import "dotenv/config";
import { z } from "zod/v4";

const graphVersion = process.env.META_GRAPH_API_VERSION ?? "v24.0";
const graphBaseUrl = `https://graph.facebook.com/${graphVersion}`;

export interface InstagramGraphAccount {
  id: string;
  username?: string;
  name?: string;
  biography?: string;
  website?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}
export interface InstagramGraphMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  thumbnail_url?: string;
  timestamp?: string;
}
interface InstagramMediaResponse {
  data: InstagramGraphMedia[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string; previous?: string };
}
interface FacebookPageResponse {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string };
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

// Shared read-only transport. Never return Meta's raw errors or request URLs/tokens.
export class InstagramReadError extends Error {
  constructor(public readonly code: number | null, public readonly status: number | null) {
    super(`Instagram read failed (HTTP ${status ?? "unavailable"}, code ${code ?? "unknown"}). Check account eligibility, permissions, API fields and token configuration.`);
  }
}
async function graphRequest<T>(path: string, accessToken: string, fields?: string, fetcher: typeof fetch = fetch): Promise<T> {
  if (!accessToken) throw new InstagramReadError(null, null);
  const url = new URL(`${graphBaseUrl}${path}`);
  if (fields) url.searchParams.set("fields", fields);
  try {
    const response = await fetcher(url, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json() as T & { error?: { code?: unknown } };
    if (!response.ok || data?.error) throw new InstagramReadError(
      typeof data?.error?.code === "number" ? data.error.code : null, response.status);
    return data;
  } catch (error) {
    if (error instanceof InstagramReadError) throw error;
    throw new InstagramReadError(null, null);
  }
}
export async function getPageInstagramConnection(userAccessToken: string) {
  const pageId = process.env.META_FACEBOOK_PAGE_ID ?? "";
  if (!pageId) throw new Error("META_FACEBOOK_PAGE_ID is missing");
  const page = await graphRequest<FacebookPageResponse>(`/${pageId}`, userAccessToken, "id,name,access_token,instagram_business_account");
  if (!page.access_token) throw new Error("Meta did not return a Page Access Token");
  if (!page.instagram_business_account?.id) throw new Error("Facebook Page has no linked Instagram professional account");
  return { pageId: page.id, pageName: page.name ?? null, pageAccessToken: page.access_token, instagramBusinessAccountId: page.instagram_business_account.id };
}
export async function getInstagramAccount(id: string, token: string): Promise<InstagramGraphAccount> {
  return graphRequest(`/${id}`, token, "id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count");
}
export async function getInstagramMedia(id: string, token: string): Promise<InstagramMediaResponse> {
  return graphRequest(`/${id}/media`, token, "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp");
}
export interface InstagramBusinessDiscoveryProfile {
  id?: string;
  username?: string;
  name?: string;
  biography?: string;
  website?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  media?: { data?: InstagramGraphMedia[] };
}
export async function discoverInstagramBusiness(ourId: string, targetUsername: string, token: string): Promise<InstagramBusinessDiscoveryProfile> {
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(targetUsername)) throw new Error("Invalid Instagram username");
  const fields = `business_discovery.username(${targetUsername}){id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,media.limit(5){id,caption,media_type,permalink,timestamp}}`;
  const result = await graphRequest<{ business_discovery?: InstagramBusinessDiscoveryProfile }>(`/${ourId}`, token, fields);
  if (!result.business_discovery) throw new Error(`No Business Discovery data returned for @${targetUsername}`);
  return result.business_discovery;
}

const ChildSchema = z.object({ id: z.string(), media_type: z.string(), media_url: z.string().optional() });
const PostSchema = z.object({
  id: z.string(), caption: z.string().optional(), media_type: z.string(),
  media_url: z.string().optional(), permalink: z.string().optional(), timestamp: z.string(),
  like_count: z.number().int().nonnegative().nullable().optional(),
  comments_count: z.number().int().nonnegative().nullable().optional(),
  children: z.object({ data: z.array(ChildSchema), paging: z.object({ next: z.string().optional() }).optional() }).optional(),
});
const DiscoverySchema = z.object({ business_discovery: z.object({
  media: z.object({ data: z.array(PostSchema), paging: z.object({
    cursors: z.object({ after: z.string().optional() }).optional(), next: z.string().optional(),
  }).optional() }),
}) });
export type ResearchPost = {
  id: string; username: string; caption: string; permalink: string; timestamp: string;
  likes: number | null; comments: number | null; images: string[];
};
export type InstagramPostCollection = {
  posts: ResearchPost[]; limitations: string[]; retrievedAt: string; scanned: number;
};
export function instagramPermalink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["instagram.com", "www.instagram.com"].includes(url.hostname) &&
      !url.username && !url.password && !url.port && !url.search && !url.hash && /^\/p\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  } catch { return false; }
}
export async function collectDesignerPosts(
  username: string, since: string, until: string,
  credentials: { accountId: string; token: string }, fetcher: typeof fetch = fetch,
): Promise<InstagramPostCollection> {
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(username) || !/^\d+$/.test(credentials.accountId)) throw new Error("Invalid designer or configured account ID");
  const start = Date.parse(since), end = Date.parse(until);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error("Invalid date range");
  const posts = new Map<string, ResearchPost>();
  const limitations = new Set<string>(["Business Discovery only covers eligible accessible professional accounts; not unrestricted Instagram search."]);
  let after: string | undefined;
  let metrics = true;
  let scanned = 0;
  for (let page = 0; page < 3; page++) {
    const fields = () => `business_discovery.username(${username}){media.limit(25)${after ? `.after(${after})` : ""}{id,caption,media_type,media_url,permalink,timestamp${metrics ? ",like_count,comments_count" : ""},children.limit(20){id,media_type,media_url}}}`;
    let raw: unknown;
    try { raw = await graphRequest(`/${credentials.accountId}`, credentials.token, fields(), fetcher); }
    catch (error) {
      if (!(error instanceof InstagramReadError) || error.code !== 100 || !metrics) throw error;
      metrics = false;
      limitations.add("Metric fields were rejected; retried without counts. Missing counts remain unknown, not zero.");
      raw = await graphRequest(`/${credentials.accountId}`, credentials.token, fields(), fetcher);
    }
    const parsed = DiscoverySchema.safeParse(raw);
    if (!parsed.success) throw new Error("Instagram returned unavailable or malformed Business Discovery data");
    const media = parsed.data.business_discovery.media;
    scanned += media.data.length;
    for (const post of media.data) {
      const date = Date.parse(post.timestamp);
      if (!Number.isFinite(date) || date < start || date > end) continue;
      if (post.media_type !== "IMAGE" && post.media_type !== "CAROUSEL_ALBUM") continue;
      if (!post.permalink || !instagramPermalink(post.permalink)) { limitations.add("Posts without a valid photo permalink were excluded."); continue; }
      const images = post.media_type === "IMAGE" ? [post.media_url].filter((v): v is string => !!v) :
        (post.children?.data ?? []).filter(child => child.media_type === "IMAGE" && child.media_url).map(child => child.media_url!);
      if (post.children?.paging?.next) limitations.add("Some carousel children were truncated by the 20-slide API limit.");
      if (!images.length) { limitations.add("Some posts had no accessible still images."); continue; }
      posts.set(post.id, { id: post.id, username: username.toLowerCase(), caption: (post.caption ?? "").slice(0, 2200),
        permalink: post.permalink, timestamp: post.timestamp, likes: post.like_count ?? null,
        comments: post.comments_count ?? null, images });
    }
    const next = media.paging?.cursors?.after;
    if (!media.paging?.next) break;
    if (!next || !/^[a-zA-Z0-9_=-]{1,2048}$/.test(next) || next === after) {
      limitations.add("Pagination stopped: missing, repeated or unsupported cursor."); break;
    }
    after = next;
    if (page === 2) limitations.add("Retrieval capped at 75 recent posts per designer; date-window coverage may be incomplete.");
  }
  return { posts: [...posts.values()], limitations: [...limitations], retrievedAt: new Date().toISOString(), scanned };
}
