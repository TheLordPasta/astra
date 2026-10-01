import { request } from "node:https";
import { isPublicIPv4, resolveImageHost, validateImageUrl } from "./publicImage.js";

export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const VIDEO_REQUEST_TIMEOUT_MS = 15000;
export type VideoFailureStage = "url" | "dns" | "transport" | "redirect" | "http" | "size" | "type";
export class VideoAccessError extends Error {
  constructor(public readonly stage: VideoFailureStage) {
    super(`Video unavailable (${stage}): use a public HTTPS MP4 or WebM, maximum 25 MiB. Private addresses, credentials, compressed responses and unsafe redirects are not supported.`);
    this.name = "VideoAccessError";
  }
}
const fail = (stage: VideoFailureStage) => new VideoAccessError(stage);

export function validateVideoUrl(value: string): URL {
  try { return validateImageUrl(value); } catch { throw fail("url"); }
}

// Container signature checks, not codec/decodability verification. The extraction phase
// must probe/decode the bounded bytes before treating them as a usable video.
export function videoMime(bytes: Buffer, contentType: string): "video/mp4" | "video/webm" {
  const mime = contentType.split(";")[0]?.trim().toLowerCase();
  if (mime === "video/mp4" && bytes.length >= 16 && bytes.toString("ascii", 4, 8) === "ftyp") {
    const size = bytes.readUInt32BE(0);
    const brands = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4V "]);
    if (size >= 16 && size <= bytes.length && (size - 16) % 4 === 0) {
      const declared = [bytes.toString("ascii", 8, 12)];
      for (let i = 16; i < size; i += 4) declared.push(bytes.toString("ascii", i, i + 4));
      if (declared.some(brand => brands.has(brand))) return "video/mp4";
    }
  }
  if (mime === "video/webm" && bytes.length >= 12 &&
      bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) &&
      bytes.subarray(4, Math.min(bytes.length, 4096)).includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]))) return "video/webm";
  throw fail("type");
}

export type VideoWireResponse = { status: number; location?: string; contentType: string; bytes: Buffer; contentEncoding?: string };
export interface VideoTransport {
  resolve(host: string): Promise<string[]>;
  get(url: URL, pinnedAddress: string): Promise<VideoWireResponse>;
}

export const publicVideoTransport: VideoTransport = {
  resolve: resolveImageHost,
  get(url, pinnedAddress) {
    return new Promise((resolve, reject) => {
      const req = request(url, {
        method: "GET", agent: false, family: 4,
        headers: { Accept: "video/mp4,video/webm", "Accept-Encoding": "identity" },
        // Bind the validated address to the socket, while retaining TLS hostname verification.
        lookup: (_host, _options, callback) => callback(null, pinnedAddress, 4),
      }, res => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          resolve({ status, ...(res.headers.location ? { location: res.headers.location } : {}), contentType: "", bytes: Buffer.alloc(0) });
          res.destroy();
          return;
        }
        const stop = (stage: VideoFailureStage) => { res.destroy(); reject(fail(stage)); };
        if (status !== 200) { stop("http"); return; }
        if (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity") { stop("type"); return; }
        const length = res.headers["content-length"];
        if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_VIDEO_BYTES)) { stop("size"); return; }
        const contentType = String(res.headers["content-type"] ?? "");
        if (!["video/mp4", "video/webm"].includes(contentType.split(";")[0]!.trim().toLowerCase())) { stop("type"); return; }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_VIDEO_BYTES) { stop("size"); return; }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (!res.complete || (length !== undefined && size !== Number(length))) { reject(fail("transport")); return; }
          resolve({ status, contentType, bytes: Buffer.concat(chunks, size) });
        });
        res.on("error", () => reject(fail("transport")));
        res.on("aborted", () => reject(fail("transport")));
      });
      // Absolute per-request deadline, not an idle timeout that a slow stream can reset.
      const timer = setTimeout(() => req.destroy(fail("transport")), VIDEO_REQUEST_TIMEOUT_MS);
      req.on("close", () => clearTimeout(timer));
      req.on("error", () => reject(fail("transport")));
      req.end();
    });
  },
};

export type RetrievedVideo = { bytes: Buffer; mime: "video/mp4" | "video/webm"; byteLength: number };
export async function loadPublicVideo(value: string, io: VideoTransport = publicVideoTransport): Promise<RetrievedVideo> {
  let stage: VideoFailureStage = "url";
  try {
    let url = validateVideoUrl(value);
    for (let redirects = 0; redirects <= 3; redirects++) {
      stage = "dns";
      const addresses = await io.resolve(url.hostname);
      if (!addresses.length || !addresses.every(isPublicIPv4)) throw fail(stage);
      stage = "transport";
      const response = await io.get(url, addresses[0]!);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.location || redirects === 3) throw fail("redirect");
        stage = "redirect";
        url = validateVideoUrl(new URL(response.location, url).href);
        continue;
      }
      if (response.status !== 200) throw fail("http");
      if (!response.bytes.length || response.bytes.length > MAX_VIDEO_BYTES) throw fail("size");
      if (response.contentEncoding && response.contentEncoding !== "identity") throw fail("type");
      const mime = videoMime(response.bytes, response.contentType);
      // Do not propagate potentially signed source URLs into results, logs, or model input.
      return { bytes: response.bytes, mime, byteLength: response.bytes.length };
    }
    throw fail("redirect");
  } catch (error) {
    if (error instanceof VideoAccessError) throw error;
    throw fail(stage);
  }
}
