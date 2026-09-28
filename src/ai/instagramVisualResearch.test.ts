import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicIPv4, validateImageUrl, loadPublicImage, imageMime, MAX_IMAGE_BYTES } from "./publicImage.js";
import type { ImageTransport } from "./publicImage.js";
import { collectDesignerPosts, instagramPermalink } from "../instagram/instagramGraphClient.js";
import type { ResearchPost } from "../instagram/instagramGraphClient.js";
import { compareEngagement, selectPosts, buildTrendCandidates, DressAnalysisSchema, VisualResearchArgumentsSchema } from "./instagramVisualResearch.js";
import type { AnalyzedPost, DressAnalysis } from "./instagramVisualResearch.js";

const jpeg = Buffer.from([255,216,255,0]);
const io: ImageTransport = { resolve: async () => ["93.184.216.34"], get: async () => ({ status: 200, contentType: "image/jpeg", bytes: jpeg }) };
for (const address of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1", "::1", "::ffff:127.0.0.1"]) {
  test(`blocks non-public address ${address}`, () => assert.equal(isPublicIPv4(address), false));
}
test("accepts public IPv4", () => assert.equal(isPublicIPv4("93.184.216.34"), true));
for (const url of ["http://example.com/a.jpg", "https://user:password@example.com/a", "https://example.com:8443/a", "https://127.1/a", "https://[::1]/a", "https://example.com/a?access_token=secret", "file:///etc/passwd", "https://host.local/a"]) {
  test(`blocks unsafe URL ${url.split("?")[0]}`, () => assert.throws(() => validateImageUrl(url)));
}
test("accepts normal public URL", () => assert.equal(validateImageUrl("https://example.com/dress.jpg").hostname, "example.com"));
test("loads image bytes, never a model-side remote URL", async () => assert.equal(await loadPublicImage("https://example.com/a", io), "data:image/jpeg;base64,/9j/AA=="));
test("pins validated DNS address", async () => {
  let pinned = "";
  await loadPublicImage("https://example.com/a", { ...io, get: async (url, address) => { pinned = address; assert.equal(url.hostname, "example.com"); return io.get(url, address); } });
  assert.equal(pinned, "93.184.216.34");
});
test("mixed public/private DNS is rejected before transport", async () => {
  await assert.rejects(loadPublicImage("https://example.com/a", { resolve: async () => ["93.184.216.34", "127.0.0.1"], get: async () => { assert.fail("must not request"); } }));
});
test("redirect is revalidated against private hosts", async () => {
  await assert.rejects(loadPublicImage("https://example.com/a", { ...io, get: async () => ({ status: 302, location: "https://169.254.169.254/a", bytes: Buffer.alloc(0), contentType: "" }) }));
});
test("redirect loop is bounded", async () => {
  let calls = 0;
  await assert.rejects(loadPublicImage("https://example.com/a", { ...io, get: async () => { calls++; return { status: 302, location: "/a", bytes: Buffer.alloc(0), contentType: "" }; } }));
  assert.equal(calls, 4);
});
test("oversize image rejected", async () => {
  await assert.rejects(loadPublicImage("https://example.com/a", { ...io, get: async () => ({ status: 200, bytes: Buffer.alloc(MAX_IMAGE_BYTES + 1), contentType: "image/jpeg" }) }));
});
test("HTML masquerading as image is rejected", () => assert.throws(() => imageMime(Buffer.from("<html>"), "image/jpeg")));
test("SVG and GIF not supported", () => { assert.throws(() => imageMime(Buffer.from("<svg/>"), "image/svg+xml")); assert.throws(() => imageMime(Buffer.from("GIF89a"), "image/gif")); });
test("animated WebP is rejected", () => assert.throws(() => imageMime(Buffer.from("RIFFxxxxWEBPANIM"), "image/webp")));
test("transport errors do not expose sensitive URL/error details", async () => {
  await assert.rejects(loadPublicImage("https://example.com/a", { ...io, get: async () => { throw new Error("secret-token"); } }), e => e instanceof Error && !e.message.includes("secret-token"));
});

const metaPost = (id: string) => ({ id, caption: "dress", timestamp: "2025-01-10T00:00:00Z", media_type: "IMAGE", media_url: "https://example.com/dress.jpg", permalink: `https://www.instagram.com/p/${id}/`, like_count: 10, comments_count: 2 });
const credential = { accountId: "123", token: "fixture-secret" };
const collect = (fetcher: typeof fetch, username = "designer") => collectDesignerPosts(username, "2025-01-01T00:00:00Z", "2025-02-01T00:00:00Z", credential, fetcher);
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
test("Meta transport is GET only, bearer header, no token in URL", async () => {
  const result = await collect(async (url, init) => {
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error");
    assert.doesNotMatch(String(url), /fixture-secret|access_token/);
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer fixture-secret");
    return response({ business_discovery: { media: { data: [metaPost("a")] } } });
  });
  assert.equal(result.posts[0]?.likes, 10); assert.equal(result.posts[0]?.comments, 2);
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret/);
});
test("carousel keeps only still slides and excludes video posts", async () => {
  const result = await collect(async () => response({ business_discovery: { media: { data: [
    { ...metaPost("a"), media_type: "CAROUSEL_ALBUM", children: { data: [{ id: "1", media_type: "IMAGE", media_url: "https://example.com/1" }, { id: "2", media_type: "VIDEO", media_url: "https://example.com/2" }] } },
    { ...metaPost("v"), media_type: "VIDEO" }, { ...metaPost("old"), timestamp: "2020-01-01T00:00:00Z" },
  ] } } }));
  assert.equal(result.posts.length, 1); assert.deepEqual(result.posts[0]?.images, ["https://example.com/1"]);
});
test("unsupported metrics retry without counts, never fabricate zero", async () => {
  let calls = 0;
  const result = await collect(async url => {
    calls++;
    if (calls === 1) return response({ error: { code: 100, message: "fixture-secret" } }, 400);
    assert.doesNotMatch(decodeURIComponent(String(url)), /like_count|comments_count/);
    const { like_count: _l, comments_count: _c, ...post } = metaPost("a");
    return response({ business_discovery: { media: { data: [post] } } });
  });
  assert.equal(result.posts[0]?.likes, null); assert.equal(calls, 2);
});
test("permission errors are sanitized and do not trigger retries", async () => {
  let calls = 0;
  await assert.rejects(collect(async () => { calls++; return response({ error: { code: 190, message: "fixture-secret" } }, 400); }), e => e instanceof Error && !e.message.includes("fixture-secret"));
  assert.equal(calls, 1);
});
test("pagination rebuilds trusted endpoint and never follows paging URLs", async () => {
  let calls = 0;
  const result = await collect(async url => {
    calls++; assert.equal(new URL(String(url)).hostname, "graph.facebook.com");
    return response({ business_discovery: { media: { data: [metaPost(String(calls))], paging: { next: "https://attacker.example/token", cursors: { after: `cursor${calls}` } } } } });
  });
  assert.equal(calls, 3); assert.equal(result.posts.length, 3); assert.match(result.limitations.join(" "), /75/);
});
test("deduplicates media IDs across pages", async () => {
  let calls = 0;
  const result = await collect(async () => response({ business_discovery: { media: { data: [metaPost("a")], ...(++calls === 1 ? { paging: { next: "ignored", cursors: { after: "abc" } } } : {}) } } }));
  assert.equal(result.posts.length, 1);
});
test("invalid usernames fail before request", async () => { await assert.rejects(collect(async () => { assert.fail("network"); }, "x){token}")); });
test("malformed Graph responses fail without leaking raw payload", async () => { await assert.rejects(collect(async () => response({ secret: "fixture-secret" })), /malformed/); });
test("permalink validation rejects foreign domains, queries and Reels", () => {
  assert.equal(instagramPermalink("https://www.instagram.com/p/abc/"), true);
  for (const url of ["https://evil.example/p/a/", "https://www.instagram.com/reel/a/", "https://www.instagram.com/p/a/?token=x"]) assert.equal(instagramPermalink(url), false);
});

export const analysis: DressAnalysis = {
  garmentVisible: true, visibleFacts: { silhouette: "A-line", neckline: "V", sleeves: "long", colors: ["ivory"], lace: "large floral motifs", transparency: "sheer sleeves", embellishments: [] },
  visibleTags: ["a-line", "large-floral-lace"], fabricHypotheses: [{ material: "lace over mesh", visualBasis: "open floral surface", confidence: 0.5 }], limitations: ["composition not known"], confidence: 0.8,
};
export const post = (id: string, likes: number | null = 10, username = "designer"): ResearchPost => ({
  id, username, likes, comments: null, caption: "dress", timestamp: "2025-01-10T00:00:00Z", permalink: `https://www.instagram.com/p/${id}/`, images: ["https://example.com/image.jpg"],
});
test("engagement median excludes self and requires peers", () => {
  const values = compareEngagement([post("a", 100), post("b", 10), post("c", 10)], Date.parse("2025-02-01T00:00:00Z"));
  assert.equal(values[0]?.engagement.relativeLikes, 10);
  assert.equal(compareEngagement([post("a")], Date.now())[0]?.engagement.relativeLikes, null);
});
test("missing counts and zero denominator do not produce ratios", () => {
  const values = compareEngagement([post("a", null), post("b", 0), post("c", 0)], Date.now());
  assert.ok(values.every(p => p.engagement.relativeLikes === null));
});
test("comparisons do not mix designers or broad age buckets", () => {
  const values = compareEngagement([post("a"), post("b", 10, "other"), { ...post("c"), timestamp: "2025-01-31T00:00:00Z" }], Date.parse("2025-02-01T00:00:00Z"));
  assert.ok(values.every(p => p.engagement.peerCount === 0));
});
test("sampling includes comparison posts, bounded and unique", () => {
  const selected = selectPosts(compareEngagement(Array.from({ length: 12 }, (_, i) => post(String(i), i + 1)), Date.now()));
  assert.equal(selected.length, 4); assert.equal(selected.filter(p => p.sampleRole === "comparison").length, 2);
  assert.equal(new Set(selected.map(p => p.id)).size, 4);
});
test("missing engagement yields only comparison samples", () => {
  const selected = selectPosts(compareEngagement([post("a", null), post("b", null)], Date.now()));
  assert.ok(selected.every(p => p.sampleRole === "comparison"));
});
const analyzed = (id: string, username: string): AnalyzedPost => {
  const { images: _images, ...selected } = selectPosts(compareEngagement([post(id, 10, username)], Date.now()))[0]!;
  return { ...selected, imagesAvailable: 1, imagesAnalyzed: 1, analysis, analysisError: null };
};
test("one designer cannot establish a cross-designer trend", () => assert.deepEqual(buildTrendCandidates([analyzed("a", "same"), analyzed("b", "same")]), []));
test("cross-designer candidates have evidence links and conservative confidence", () => {
  const candidates = buildTrendCandidates([analyzed("a", "one"), analyzed("b", "two")]);
  assert.equal(candidates.length, 2); assert.equal(candidates[0]?.distinctDesigners, 2);
  assert.equal(candidates[0]?.status, "proposed"); assert.equal(candidates[0]?.sourceUrls.length, 2);
  assert.ok(candidates[0]!.confidence <= 0.65); assert.ok(candidates[0]!.limitations.length > 0);
});
test("failed or low-confidence analyses cannot support a candidate", () => {
  assert.deepEqual(buildTrendCandidates([analyzed("a", "one"), { ...analyzed("b", "two"), analysis: null }]), []);
});
test("schema separates uncertain fabric hypotheses from visible facts", () => {
  assert.ok(DressAnalysisSchema.safeParse(analysis).success);
  assert.equal(DressAnalysisSchema.safeParse({ ...analysis, visibleTags: ["pure-silk"] }).success, false);
});
test("scope requires bounded past date range and designer list", () => {
  const args = { usernames: ["designer"], market: "bridal", segment: "designers", category: "dresses", geography: "Israel", since: "2025-01-01T00:00:00Z", until: "2025-02-01T00:00:00Z" };
  assert.ok(VisualResearchArgumentsSchema.safeParse(args).success);
  assert.equal(VisualResearchArgumentsSchema.safeParse({ ...args, until: "2030-01-01T00:00:00Z" }).success, false);
  assert.equal(VisualResearchArgumentsSchema.safeParse({ ...args, usernames: [] }).success, false);
});
