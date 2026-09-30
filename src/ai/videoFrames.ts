import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_VIDEO_BYTES, videoMime } from "./publicVideo.js";
import type { RetrievedVideo } from "./publicVideo.js";

export const VIDEO_LIMITS = Object.freeze({ duration: 60, frames: 6, dimension: 4096,
  pixels: 4096 * 2160, frameBytes: 1024 * 1024, processingMs: 30000, probeBytes: 65536 });
export type MediaStage = "busy" | "input" | "probe" | "metadata" | "extract" | "cleanup";
export class MediaFailure extends Error {
  constructor(readonly stage: MediaStage, readonly kind: "unavailable" | "timeout" | "limit" | "invalid" | "failed") {
    super(`Video ${stage} failed (${kind}). MP4/WebM up to 25 MiB, 60 seconds and 4096 pixels per side are supported; FFmpeg and ffprobe must be installed.`);
    this.name = "MediaFailure";
  }
}
export type MediaRunner = (binary: "ffmpeg" | "ffprobe", args: string[], timeoutMs: number, maxBytes: number, stage: "probe" | "extract") => Promise<Buffer>;
// No shell, no user-provided executable, no raw stderr in returned errors. Wait for
// process close after SIGKILL so temporary input is never removed while still in use.
export const runMedia: MediaRunner = (binary, args, timeoutMs, maxBytes, stage) => new Promise((resolve, reject) => {
  if (timeoutMs <= 0) { reject(new MediaFailure(stage, "timeout")); return; }
  const child = spawn(binary, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let failure: MediaFailure | undefined;
  let count = 0, stderrBytes = 0;
  const chunks: Buffer[] = [];
  const stop = (kind: "timeout" | "limit") => { failure ??= new MediaFailure(stage, kind); child.kill("SIGKILL"); };
  const timer = setTimeout(() => stop("timeout"), timeoutMs);
  child.stdout.on("data", (chunk: Buffer) => {
    count += chunk.length;
    if (count > maxBytes) stop("limit"); else if (!failure) chunks.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes > 65536) stop("limit"); });
  child.on("error", () => { failure ??= new MediaFailure(stage, "unavailable"); });
  child.on("close", code => {
    clearTimeout(timer);
    if (failure) reject(failure);
    else if (code !== 0 || count === 0) reject(new MediaFailure(stage, "failed"));
    else resolve(Buffer.concat(chunks));
  });
});
export type VideoMetadata = { duration: number; width: number; height: number; codec: string; container: string; streamIndex: number };
export function parseProbe(bytes: Buffer, mime: RetrievedVideo["mime"]): VideoMetadata {
  try {
    if (!bytes.length || bytes.length > VIDEO_LIMITS.probeBytes) throw new Error();
    const data = JSON.parse(bytes.toString("utf8"));
    if (!data || !Array.isArray(data.streams) || data.streams.length > 8) throw new Error();
    const videos = data.streams.filter((s: any) => s?.codec_type === "video");
    if (videos.length !== 1) throw new Error();
    const stream = videos[0];
    const duration = Number(data.format?.duration);
    const width = stream.width, height = stream.height;
    const container = data.format?.format_name;
    const expected = mime === "video/mp4" ? "mov,mp4,m4a,3gp,3g2,mj2" : "matroska,webm";
    if (container !== expected || !Number.isFinite(duration) || duration <= 0 || duration > VIDEO_LIMITS.duration ||
      !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
      Math.max(width, height) > VIDEO_LIMITS.dimension || width * height > VIDEO_LIMITS.pixels ||
      !Number.isInteger(stream.index) || stream.index < 0 || stream.index > 7 ||
      !["h264", "hevc", "vp8", "vp9", "av1"].includes(stream.codec_name)) throw new Error();
    return { duration, width, height, codec: stream.codec_name, container, streamIndex: stream.index };
  } catch { throw new MediaFailure("metadata", "invalid"); }
}
export function selectFrameTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || duration > VIDEO_LIMITS.duration) throw new MediaFailure("metadata", "invalid");
  const count = Math.min(VIDEO_LIMITS.frames, Math.max(1, Math.ceil(duration)));
  // Midpoints avoid the end-of-file boundary and deliberately do not claim full motion coverage.
  return Array.from({ length: count }, (_, i) => Number(((i + 0.5) * duration / count).toFixed(6)));
}
export type VideoFrame = { timestampSeconds: number; jpeg: Buffer };
export type ExtractedVideo = { metadata: VideoMetadata; frames: VideoFrame[] };
let extracting = false;
export async function extractVideoFrames(video: RetrievedVideo, runner: MediaRunner = runMedia): Promise<ExtractedVideo> {
  if (extracting) throw new MediaFailure("busy", "limit");
  extracting = true;
  let directory: string | undefined;
  let stage: MediaStage = "input";
  try {
    if (!video.bytes.length || video.bytes.length > MAX_VIDEO_BYTES || video.byteLength !== video.bytes.length) throw new MediaFailure(stage, "limit");
    videoMime(video.bytes, video.mime);
    directory = await mkdtemp(join(tmpdir(), "astra-video-"));
    const input = join(directory, video.mime === "video/mp4" ? "input.mp4" : "input.webm");
    await writeFile(input, video.bytes, { mode: 0o600, flag: "wx" });
    const deadline = Date.now() + VIDEO_LIMITS.processingMs;
    const demuxer = video.mime === "video/mp4" ? "mov" : "matroska";
    // Restrict demuxing to the verified container, disable nested network protocols,
    // limit probing/allocation and decode threads. These are not an OS-level sandbox.
    const inputArgs = ["-max_alloc", "67108864", "-protocol_whitelist", "file,pipe", "-probesize", "5000000", "-analyzeduration", "3000000", "-threads", "1", "-f", demuxer];
    stage = "probe";
    const probe = await runner("ffprobe", ["-v", "error", ...inputArgs, "-show_entries", "format=duration,format_name:stream=index,codec_type,codec_name,width,height", "-of", "json", input], Math.min(8000, deadline - Date.now()), VIDEO_LIMITS.probeBytes, "probe");
    const metadata = parseProbe(probe, video.mime);
    const frames: VideoFrame[] = [];
    stage = "extract";
    for (const timestampSeconds of selectFrameTimes(metadata.duration)) {
      const jpeg = await runner("ffmpeg", ["-nostdin", "-v", "error", ...inputArgs,
        "-ss", String(timestampSeconds), "-i", input, "-map", `0:${metadata.streamIndex}`, "-an", "-sn", "-dn",
        "-frames:v", "1", "-vf", "scale=768:768:force_original_aspect_ratio=decrease", "-threads", "1", "-filter_threads", "1",
        "-c:v", "mjpeg", "-q:v", "3", "-f", "image2pipe", "pipe:1"], Math.min(8000, deadline - Date.now()), VIDEO_LIMITS.frameBytes, "extract");
      if (jpeg.length < 4 || jpeg.length > VIDEO_LIMITS.frameBytes || jpeg[0] !== 255 || jpeg[1] !== 216 || jpeg[jpeg.length - 2] !== 255 || jpeg[jpeg.length - 1] !== 217) throw new MediaFailure("extract", "invalid");
      frames.push({ timestampSeconds, jpeg });
    }
    return { metadata, frames };
  } catch (error) {
    if (error instanceof MediaFailure) throw error;
    throw new MediaFailure(stage, "failed");
  } finally {
    try { if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 2 }); }
    catch { throw new MediaFailure("cleanup", "failed"); }
    finally { extracting = false; }
  }
}
