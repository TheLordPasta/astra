import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export class ImageAccessError extends Error {}
const fail = () => new ImageAccessError("Image unavailable: use a public HTTPS JPEG, PNG or static WebP (maximum 8 MiB). Private addresses, credentials and redirects are restricted.");

// Deliberately IPv4-only in v1: deny special-purpose ranges, including metadata.
export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a = 0, b = 0] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 88 || b === 168 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
}

export function validateImageUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw fail(); }
  if (value.length > 4096 || url.protocol !== "https:" || url.username || url.password ||
      (url.port && url.port !== "443") || url.hash || !url.hostname.includes(".") ||
      url.hostname.endsWith(".local") || url.hostname.endsWith(".internal") ||
      (isIP(url.hostname) && !isPublicIPv4(url.hostname))) throw fail();
  for (const key of url.searchParams.keys()) {
    if (/token|secret|password|credential|api[_-]?key/i.test(key)) throw fail();
  }
  return url;
}

export function imageMime(bytes: Buffer, contentType: string): string {
  const mime = contentType.split(";")[0]?.trim().toLowerCase();
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if ((mime === "image/jpeg" && jpeg) ||
      (mime === "image/png" && png && !bytes.includes(Buffer.from("acTL"))) ||
      (mime === "image/webp" && webp && !bytes.includes(Buffer.from("ANIM")))) return mime;
  throw fail();
}

type WireResponse = { status: number; location?: string; contentType: string; bytes: Buffer };
export interface ImageTransport {
  resolve(host: string): Promise<string[]>;
  get(url: URL, pinnedAddress: string): Promise<WireResponse>;
}

export async function resolveImageHost(host: string): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup(host, { all: true, family: 4 }).then(items => items.map(item => item.address)),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(fail()), 5000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

const transport: ImageTransport = {
  resolve: resolveImageHost,
  get(url, pinnedAddress) {
    return new Promise((resolve, reject) => {
      const req = request(url, {
        method: "GET", agent: false, family: 4,
        headers: { Accept: "image/jpeg,image/png,image/webp", "Accept-Encoding": "identity" },
        // Pin the validated DNS answer to the actual connection; TLS still verifies the hostname.
        // Explicit family disables Node's multi-address lookup callback mode.
        lookup: (_host, _options, callback) => callback(null, pinnedAddress, 4),
      }, res => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          resolve({ status, ...(res.headers.location ? { location: res.headers.location } : {}), contentType: "", bytes: Buffer.alloc(0) });
          res.destroy();
          return;
        }
        if (status !== 200 || Number(res.headers["content-length"] ?? 0) > MAX_IMAGE_BYTES ||
            (res.headers["content-encoding"] && res.headers["content-encoding"] !== "identity")) {
          res.destroy(); reject(fail()); return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_IMAGE_BYTES) { res.destroy(); reject(fail()); return; }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, contentType: String(res.headers["content-type"] ?? ""), bytes: Buffer.concat(chunks) }));
        res.on("error", () => reject(fail()));
        res.on("aborted", () => reject(fail()));
      });
      const timer = setTimeout(() => req.destroy(fail()), 15000);
      req.on("close", () => clearTimeout(timer));
      req.on("error", () => reject(fail()));
      req.end();
    });
  },
};

export async function loadPublicImage(value: string, io: ImageTransport = transport): Promise<string> {
  try {
    let url = validateImageUrl(value);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const addresses = await io.resolve(url.hostname);
      if (!addresses.length || !addresses.every(isPublicIPv4)) throw fail();
      const response = await io.get(url, addresses[0]!);
      if (response.status >= 300 && response.status < 400) {
        if (!response.location || redirects === 3) throw fail();
        url = validateImageUrl(new URL(response.location, url).href);
        continue;
      }
      if (response.status !== 200 || response.bytes.length === 0 || response.bytes.length > MAX_IMAGE_BYTES) throw fail();
      const mime = imageMime(response.bytes, response.contentType);
      return `data:${mime};base64,${response.bytes.toString("base64")}`;
    }
    throw fail();
  } catch { throw fail(); }
}
