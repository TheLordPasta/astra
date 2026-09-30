import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { extractVideoFrames, parseProbe, selectFrameTimes, runMedia, MediaFailure, VIDEO_LIMITS } from "./videoFrames.js";
import type { MediaRunner, ExtractedVideo } from "./videoFrames.js";
import { analyzePublicVideo, validateVideoAnalysis } from "./videoAnalysis.js";
import { executeVideoAnalysisTool } from "../tools/videoAnalysisTool.js";
import { executeVisualResearchTool, visualResearchTools } from "../tools/instagramVisualResearchTool.js";
import { VideoAccessError } from "./publicVideo.js";
import type { RetrievedVideo } from "./publicVideo.js";

const mp4 = Buffer.from("000000186674797069736f6d0000000069736f6d6d703432", "hex");
const input: RetrievedVideo = { bytes: mp4, mime: "video/mp4", byteLength: mp4.length };
const jpeg = Buffer.from([255, 216, 255, 217]);
const metadata = { duration: 2, width: 96, height: 128, codec: "h264", container: "mov,mp4,m4a,3gp,3g2,mj2", streamIndex: 0 };
const probeObject = () => ({ format: { duration: "2", format_name: metadata.container }, streams: [{ index: 0, codec_type: "video", codec_name: "h264", width: 96, height: 128 }] });
const probe = () => Buffer.from(JSON.stringify(probeObject()));
const extracted: ExtractedVideo = { metadata, frames: [{ timestampSeconds: 0.5, jpeg }, { timestampSeconds: 1.5, jpeg }] };
const dress = () => ({ garmentVisible: true, visibleFacts: { silhouette: "column", neckline: "square", sleeves: null, colors: ["ivory"], lace: null, transparency: null, embellishments: [] }, visibleTags: ["column"], fabricHypotheses: [], limitations: ["small sample"], confidence: 0.7 });
const observation = () => ({ frames: [0, 1].map(frameIndex => ({ frameIndex, analysis: dress() })), visibleAcrossFrames: [{ observation: "column silhouette", frameIndices: [0, 1] }], hypotheses: [{ interpretation: "possibly satin", visualBasis: "reflective surface", frameIndices: [1], confidence: 0.4 }], limitations: [], confidence: 0.6 });

test("deterministic bounded midpoint sampling", () => {
  assert.deepEqual(selectFrameTimes(2), [0.5, 1.5]);
  assert.deepEqual(selectFrameTimes(60), [5, 15, 25, 35, 45, 55]);
  assert.equal(selectFrameTimes(0.2).length, 1);
  for (const value of [0, -1, 61, Infinity, NaN]) assert.throws(() => selectFrameTimes(value), MediaFailure);
});
test("probe accepts bounded allowlisted metadata", () => assert.deepEqual(parseProbe(probe(), "video/mp4"), metadata));
for (const raw of ["", "{", '{"streams":', "null", "[]"]) test(`probe rejects malformed/empty shape ${JSON.stringify(raw)}`, () => assert.throws(() => parseProbe(Buffer.from(raw), "video/mp4"), MediaFailure));
for (const [name, mutate] of [
  ["duration", (p: any) => p.format.duration = "61"], ["infinite", (p: any) => p.format.duration = "NaN"],
  ["dimensions", (p: any) => p.streams[0].width = 100000], ["pixels", (p: any) => { p.streams[0].width = 4096; p.streams[0].height = 4096; }],
  ["codec", (p: any) => p.streams[0].codec_name = "unknown"], ["container", (p: any) => p.format.format_name = "hls"],
  ["no video", (p: any) => p.streams = []], ["multiple video", (p: any) => p.streams.push(p.streams[0])],
  ["index", (p: any) => p.streams[0].index = 99],
] as const) test(`probe rejects unsafe ${name}`, () => {
  const p = probeObject(); mutate(p); assert.throws(() => parseProbe(Buffer.from(JSON.stringify(p)), "video/mp4"), MediaFailure);
});
test("extraction uses fixed restricted arguments, byte limits, and removes temporary input", async () => {
  let path = ""; let frames = 0;
  const runner: MediaRunner = async (binary, args, timeout, max, stage) => {
    assert.ok(timeout > 0 && timeout <= 8000);
    assert.ok(args.includes("-protocol_whitelist")); assert.ok(args.includes("file,pipe"));
    assert.ok(args.includes("-max_alloc"));
    if (binary === "ffprobe") { path = args.at(-1)!; assert.deepEqual(await readFile(path), mp4); assert.equal(max, VIDEO_LIMITS.probeBytes); return probe(); }
    assert.equal(stage, "extract"); assert.equal(max, VIDEO_LIMITS.frameBytes);
    assert.equal(args[args.indexOf("-i") + 1], path);
    assert.equal(args[args.indexOf("-ss") + 1], String([0.5, 1.5][frames++]));
    assert.equal(args.at(-1), "pipe:1"); return jpeg;
  };
  const result = await extractVideoFrames(input, runner);
  assert.equal(result.frames.length, 2); assert.equal(frames, 2);
  await assert.rejects(access(path));
});
test("probe/decode failures sanitize secrets and always clean up", async () => {
  for (const failureStage of ["probe", "extract"]) {
    let path = "";
    await assert.rejects(extractVideoFrames(input, async (binary, args) => {
      if (binary === "ffprobe") { path = args.at(-1)!; if (failureStage !== "probe") return probe(); }
      throw new Error("https://secret.invalid/?token=private");
    }), (error: unknown) => error instanceof MediaFailure && !error.message.includes("private"));
    await assert.rejects(access(path));
  }
});
test("rejects non-JPEG/oversized extracted frames and frees extraction slot", async () => {
  for (const output of [Buffer.alloc(0), Buffer.from("HTML"), Buffer.alloc(VIDEO_LIMITS.frameBytes + 1)]) {
    await assert.rejects(extractVideoFrames(input, async binary => binary === "ffprobe" ? probe() : output), MediaFailure);
  }
  assert.equal((await extractVideoFrames(input, async binary => binary === "ffprobe" ? probe() : jpeg)).frames.length, 2);
});
test("input byte-length mismatch rejected before native tooling", async () => {
  await assert.rejects(extractVideoFrames({ ...input, byteLength: 99 }, async () => { throw new Error("must not run"); }), MediaFailure);
});
test("concurrent extraction is rejected rather than accumulating temporary data", async () => {
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  const first = extractVideoFrames(input, async binary => { if (binary === "ffprobe") { entered(); await wait; return probe(); } return jpeg; });
  await ready;
  await assert.rejects(extractVideoFrames(input), (error: unknown) => error instanceof MediaFailure && error.stage === "busy");
  release(); await first;
});
test("video analysis associates evidence with trusted timestamps, not model timestamps", async () => {
  const result = await analyzePublicVideo("https://example.com/private-query", { load: async () => input, extract: async () => extracted, analyze: async () => observation() });
  assert.equal(result.analysis.frames[1]!.timestampSeconds, 1.5);
  assert.equal(result.saved, false); assert.ok(!JSON.stringify(result).includes("private-query"));
  assert.ok(result.analysis.limitations.some(text => text.includes("Sparse")));
});
test("duplicate/missing/out-of-range model frames and evidence are rejected", () => {
  for (const mutate of [
    (a: any) => a.frames.pop(), (a: any) => a.frames[1].frameIndex = 0,
    (a: any) => a.frames[1].frameIndex = 5, (a: any) => a.visibleAcrossFrames[0].frameIndices = [5],
  ]) { const a = observation(); mutate(a); assert.throws(() => validateVideoAnalysis(a, extracted)); }
  for (const raw of [null, undefined, "", {}, "{"]) assert.throws(() => validateVideoAnalysis(raw, extracted));
});
test("no-garment frames cannot support garment hypotheses", () => {
  const a = observation(); a.frames[0]!.analysis.garmentVisible = false;
  assert.throws(() => validateVideoAnalysis(a, extracted));
  a.visibleAcrossFrames = []; a.hypotheses = [];
  assert.deepEqual(validateVideoAnalysis(a, extracted).frames[0]!.analysis.visibleTags, []);
});
test("Classroom adapter produces structured sanitized failures for invalid arguments and errors", async () => {
  for (const raw of ["", "{", '{"url":', "null", "{}", '{"url":5}']) {
    const result = JSON.parse(await executeVideoAnalysisTool(raw));
    assert.equal(result.code, "CLASSROOM_RUNTIME_FAILURE"); assert.equal(result.success, false);
  }
  for (const error of [new Error("secret token"), new VideoAccessError("transport"), new MediaFailure("extract", "timeout")]) {
    const result = await executeVideoAnalysisTool('{"url":"https://example.com/x.mp4"}', async () => { throw error; });
    assert.ok(!result.includes("secret token")); assert.equal(JSON.parse(result).code, "CLASSROOM_RUNTIME_FAILURE");
  }
});
test("Classroom adapter returns successful structured analysis", async () => {
  const result = JSON.parse(await executeVideoAnalysisTool('{"url":"https://example.com/x.mp4"}', url => analyzePublicVideo(url, { load: async () => input, extract: async () => extracted, analyze: async () => observation() })));
  assert.equal(result.success, true); assert.equal(result.analysis.frames.length, 2);
});
test("existing Classroom visual-tool registration and dispatch expose video tool", async () => {
  assert.ok(visualResearchTools.some(t => t.name === "analyze_public_dress_video"));
  const result = JSON.parse(await executeVisualResearchTool("analyze_public_dress_video", "{"));
  assert.equal(result.stage, "video.arguments");
});
// Real native execution: these tests intentionally fail if the host lacks required tooling.
// No HTTP, Meta, OpenAI or database is contacted. Synthetic patterns are not dresses.
for (const mime of ["video/mp4", "video/webm"] as const) test(`REAL FFmpeg ${mime} generation/probe/decode/cleanup`, async () => {
  const mp4Format = mime === "video/mp4";
  const args = ["-nostdin", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=96x128:rate=4", "-t", "2", "-threads", "1", "-pix_fmt", "yuv420p",
    "-c:v", mp4Format ? "libx264" : "libvpx", ...(mp4Format ? ["-movflags", "frag_keyframe+empty_moov"] : []), "-f", mp4Format ? "mp4" : "webm", "pipe:1"];
  const bytes = await runMedia("ffmpeg", args, 8000, 1024 * 1024, "extract");
  const result = await extractVideoFrames({ bytes, mime, byteLength: bytes.length });
  assert.equal(result.metadata.codec, mp4Format ? "h264" : "vp8");
  assert.equal(result.frames.length, 2); assert.ok(result.frames.every(f => f.jpeg.length > 100));
});
test("REAL process deadline and output cap kill FFmpeg safely", async () => {
  await assert.rejects(runMedia("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=32x32:rate=1", "-f", "null", "-"], 50, 1024, "extract"), (error: unknown) => error instanceof MediaFailure && error.kind === "timeout");
  await assert.rejects(runMedia("ffmpeg", ["-version"], 2000, 1, "extract"), (error: unknown) => error instanceof MediaFailure && error.kind === "limit");
});
