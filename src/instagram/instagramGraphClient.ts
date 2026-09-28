import "dotenv/config";

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
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
}

interface FacebookPageResponse {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

async function graphRequest<T>(
  path: string,
  accessToken: string,
  fields?: string,
): Promise<T> {
  if (!accessToken) {
    throw new Error("Instagram Graph access token is missing");
  }

  const url = new URL(`${graphBaseUrl}${path}`);

  if (fields) {
    url.searchParams.set("fields", fields);
  }

  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);

  const data = (await response.json()) as T & {
    error?: {
      message?: string;
      type?: string;
      code?: number;
    };
  };

  if (!response.ok || data.error) {
    const message =
      data.error?.message ?? `Graph API returned HTTP ${response.status}`;

    throw new Error(`Instagram Graph API error: ${message}`);
  }

  return data;
}

export async function getPageInstagramConnection(userAccessToken: string) {
  const pageId = process.env.META_FACEBOOK_PAGE_ID ?? "";

  if (!pageId) {
    throw new Error("META_FACEBOOK_PAGE_ID is missing");
  }

  const page = await graphRequest<FacebookPageResponse>(
    `/${pageId}`,
    userAccessToken,
    "id,name,access_token,instagram_business_account",
  );

  if (!page.access_token) {
    throw new Error("Meta did not return a Page Access Token");
  }

  if (!page.instagram_business_account?.id) {
    throw new Error(
      "Facebook Page has no linked Instagram professional account",
    );
  }

  return {
    pageId: page.id,
    pageName: page.name ?? null,
    pageAccessToken: page.access_token,
    instagramBusinessAccountId: page.instagram_business_account.id,
  };
}

export async function getInstagramAccount(
  instagramBusinessAccountId: string,
  pageAccessToken: string,
): Promise<InstagramGraphAccount> {
  return graphRequest<InstagramGraphAccount>(
    `/${instagramBusinessAccountId}`,
    pageAccessToken,
    [
      "id",
      "username",
      "name",
      "biography",
      "website",
      "profile_picture_url",
      "followers_count",
      "follows_count",
      "media_count",
    ].join(","),
  );
}

export async function getInstagramMedia(
  instagramBusinessAccountId: string,
  pageAccessToken: string,
): Promise<InstagramMediaResponse> {
  return graphRequest<InstagramMediaResponse>(
    `/${instagramBusinessAccountId}/media`,
    pageAccessToken,
    [
      "id",
      "caption",
      "media_type",
      "media_url",
      "permalink",
      "thumbnail_url",
      "timestamp",
    ].join(","),
  );
}
