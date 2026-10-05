import "dotenv/config";

const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";

if (!accessToken) {
  throw new Error("INSTAGRAM_ACCESS_TOKEN is missing from .env");
}

const baseUrl = "https://graph.instagram.com";

async function instagramRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = new URL(`${baseUrl}${path}`);

  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const data: unknown = await response.json();

  if (!response.ok) {
    throw new Error(
      `Instagram API error (${response.status}): ${JSON.stringify(data)}`,
    );
  }

  return data as T;
}

export interface InstagramProfile {
  id: string;
  user_id: string;
  username: string;
}

export interface InstagramMessageResponse {
  recipient_id: string;
  message_id: string;
}

export interface InstagramMedia {
  id: string;
  media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  thumbnail_url?: string;
}

export interface InstagramMediaList {
  data: InstagramMedia[];
  paging?: {
    next?: string;
    previous?: string;
  };
}

export async function getInstagramMedia(
  mediaId: string,
): Promise<InstagramMedia> {
  return instagramRequest<InstagramMedia>(
    `/${encodeURIComponent(
      mediaId,
    )}?fields=id,media_type,media_url,permalink,timestamp,thumbnail_url`,
  );
}

export async function getRecentInstagramMedia(
  limit = 25,
): Promise<InstagramMedia[]> {
  const result = await instagramRequest<InstagramMediaList>(
    `/me/media?fields=id,media_type,media_url,permalink,timestamp,thumbnail_url&limit=${limit}`,
  );

  return result.data;
}

export async function getRecentInstagramVideos(
  limit = 25,
): Promise<InstagramMedia[]> {
  const media = await getRecentInstagramMedia(limit);

  return media.filter(
    (item) => item.media_type === "VIDEO" && typeof item.media_url === "string",
  );
}

export async function getInstagramProfile(): Promise<InstagramProfile> {
  return instagramRequest<InstagramProfile>("/me?fields=id,user_id,username");
}

export async function sendInstagramMessage(
  recipientId: string,
  text: string,
): Promise<InstagramMessageResponse> {
  return instagramRequest<InstagramMessageResponse>("/me/messages", {
    method: "POST",
    body: JSON.stringify({
      recipient: {
        id: recipientId,
      },
      message: {
        text,
      },
    }),
  });
}
