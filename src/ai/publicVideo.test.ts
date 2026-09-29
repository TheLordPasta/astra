import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPublicVideo, validateVideoUrl, videoMime, VideoAccessError, MAX_VIDEO_BYTES, type VideoTransport, type VideoWireResponse } from "./publicVideo.js";

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypisom"), Buffer.alloc(4), Buffer.from("mp42")]);
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]);
const url = "https://media.example.com/dress.mp4";
const response = (overrides: Partial<VideoWireResponse> = {}): VideoWireResponse => ({ status: 200, contentType: "video/mp4", bytes: mp4, ...overrides });
const transport = (result = response()): VideoTransport => ({ resolve: async () => ["8.8.8.8"], get: async () => result });
const rejectsAt = async (action: () => Promise<unknown>, stage: string) => {
  await assert.rejects(action, error => error instanceof VideoAccessError && error.stage === stage);
};

test("retrieves MP4 bytes with structured metadata and a pinned public address", async () => {
  const result = await loadPublicVideo(url, {
    resolve: async host => { assert.equal(host, "media.example.com"); return ["8.8.8.8"]; },
    get: async (target, pinned) => { assert.equal(target.href, url); assert.equal(pinned, "8.8.8.8"); return response(); },
  });
  assert.deepEqual(result, { bytes: mp4, mime: "video/mp4", byteLength: mp4.length });
  assert.equal("url" in result, false);
});
test("retrieves WebM and normalizes MIME parameters", async () => {
  const result = await loadPublicVideo(url, transport(response({ contentType: "VIDEO/WEBM; charset=binary", bytes: webm })));
  assert.equal(result.mime, "video/webm");
});
for (const value of ["http://media.example.com/a", "https://user:password@media.example.com/a", "https://127.0.0.1/a", "https://169.254.169.254/a", "https://[::1]/a", "https://media.example.com:8443/a", "https://media.example.com/a#fragment", "https://media.example.com/a?access_token=private", "https://service.internal/a", "not a url"]) {
  test(`rejects unsafe URL ${value.split("?")[0]}`, () => {
    assert.throws(() => validateVideoUrl(value), VideoAccessError);
  });
}
for (const addresses of [[], ["127.0.0.1"], ["8.8.8.8", "10.0.0.1"], ["169.254.169.254"], ["::1"], ["100.64.0.1"]]) {
  test(`rejects non-public or mixed DNS ${JSON.stringify(addresses)}`, async () => {
    let requested = false;
    await rejectsAt(() => loadPublicVideo(url, { resolve: async () => addresses, get: async () => { requested = true; return response(); } }), "dns");
    assert.equal(requested, false);
  });
}
test("revalidates and resolves each redirect, including relative redirects", async () => {
  const hosts: string[] = [];
  let requests = 0;
  await loadPublicVideo(url, {
    resolve: async host => { hosts.push(host); return ["8.8.8.8"]; },
    get: async target => {
      requests++;
      if (requests === 1) return response({ status: 302, location: "/next" });
      if (requests === 2) return response({ status: 307, location: "https://cdn.example.com/final" });
      assert.equal(target.hostname, "cdn.example.com");
      return response();
    },
  });
  assert.deepEqual(hosts, ["media.example.com", "media.example.com", "cdn.example.com"]);
});
test("blocks redirects to private addresses and protocol downgrades", async () => {
  for (const location of ["https://127.0.0.1/secret", "http://media.example.com/a"]) {
    await rejectsAt(() => loadPublicVideo(url, transport(response({ status: 302, location }))), "url");
  }
});
test("blocks public redirect whose DNS resolves privately", async () => {
  let resolutions = 0;
  await rejectsAt(() => loadPublicVideo(url, {
    resolve: async () => ++resolutions === 1 ? ["8.8.8.8"] : ["10.0.0.1"],
    get: async () => response({ status: 302, location: "https://cdn.example.com/a" }),
  }), "dns");
});
test("redirect loop is bounded to four requests", async () => {
  let calls = 0;
  await rejectsAt(() => loadPublicVideo(url, { resolve: async () => ["8.8.8.8"], get: async () => { calls++; return response({ status: 302, location: "/again" }); } }), "redirect");
  assert.equal(calls, 4);
});
test("rejects missing redirect location", async () => {
  await rejectsAt(() => loadPublicVideo(url, transport(response({ status: 302 }))), "redirect");
});
test("rejects non-200 and partial responses, including empty errors", async () => {
  for (const status of [204, 206, 304, 403, 404, 429, 500]) {
    await rejectsAt(() => loadPublicVideo(url, transport(response({ status, bytes: Buffer.alloc(0) }))), "http");
  }
});
test("rejects empty or oversized bytes", async () => {
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(MAX_VIDEO_BYTES + 1)]) {
    await rejectsAt(() => loadPublicVideo(url, transport(response({ bytes }))), "size");
  }
});
test("accepts boundary-size payload but does not claim it is decodable", async () => {
  const bytes = Buffer.alloc(MAX_VIDEO_BYTES);
  mp4.copy(bytes);
  assert.equal((await loadPublicVideo(url, transport(response({ bytes })))).byteLength, MAX_VIDEO_BYTES);
});
test("rejects compressed responses", async () => {
  await rejectsAt(() => loadPublicVideo(url, transport(response({ contentEncoding: "gzip" }))), "type");
});
test("rejects HTML, signature mismatches, malformed boxes, and other containers", () => {
  for (const [bytes, mime] of [[Buffer.from("<html>error</html>"), "video/mp4"], [mp4, "text/html"], [mp4, "video/webm"], [webm, "video/mp4"], [Buffer.from([0, 0, 0, 255, ...mp4.subarray(4)]), "video/mp4"], [Buffer.from("RIFFxxxxAVI "), "video/webm"]] as const) {
    assert.throws(() => videoMime(bytes, mime), VideoAccessError);
  }
});
test("sanitizes DNS and transport failures without leaking URLs or credentials", async () => {
  for (const stage of ["dns", "transport"] as const) {
    const io = transport();
    const error = () => { throw new Error("secret-token https://private.example/path?password=hidden"); };
    if (stage === "dns") io.resolve = error;
    else io.get = error;
    await assert.rejects(() => loadPublicVideo(url, io), caught => {
      assert.ok(caught instanceof VideoAccessError);
      assert.equal(caught.stage, stage);
      assert.doesNotMatch(caught.message, /secret-token|private.example|hidden/);
      return true;
    });
  }
});
test("sanitizes aborted transport failures", async () => {
  const io = transport();
  io.get = async () => { throw new DOMException("upstream details", "AbortError"); };
  await rejectsAt(() => loadPublicVideo(url, io), "transport");
});
