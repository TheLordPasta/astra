import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";

const appId = process.env.META_APP_ID ?? "";
const appSecret = process.env.META_APP_SECRET ?? "";
const redirectUri = process.env.META_FACEBOOK_REDIRECT_URI ?? "";
const graphVersion = process.env.META_GRAPH_API_VERSION ?? "v24.0";
const stateSecret = process.env.META_OAUTH_STATE_SECRET ?? "";
const testPageId = process.env.META_TEST_PAGE_ID ?? "";

function assertFacebookConfig() {
  if (!appId) throw new Error("META_APP_ID is missing");
  if (!appSecret) throw new Error("META_APP_SECRET is missing");
  if (!redirectUri) {
    throw new Error("META_FACEBOOK_REDIRECT_URI is missing");
  }
  if (!stateSecret) {
    throw new Error("META_OAUTH_STATE_SECRET is missing");
  }
}

function createState() {
  const nonce = crypto.randomBytes(24).toString("hex");

  const signature = crypto
    .createHmac("sha256", stateSecret)
    .update(nonce)
    .digest("hex");

  return `${nonce}.${signature}`;
}

function verifyState(state: string) {
  const [nonce, signature] = state.split(".");

  if (!nonce || !signature) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", stateSecret)
    .update(nonce)
    .digest("hex");

  if (signature.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

interface FacebookTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: unknown;
}

interface FacebookPage {
  id: string;
  name: string;
  access_token?: string;
  tasks?: string[];
  instagram_business_account?: {
    id: string;
  };
}

interface FacebookPagesResponse {
  data?: FacebookPage[];
  error?: unknown;
}

export function registerFacebookAuth(app: FastifyInstance) {
  app.get("/api/facebook/auth", async (_request, reply) => {
    assertFacebookConfig();

    const state = createState();

    const url = new URL(
      `https://www.facebook.com/${graphVersion}/dialog/oauth`,
    );

    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);

    url.searchParams.set(
      "scope",
      ["pages_show_list", "instagram_basic", "pages_read_engagement"].join(","),
    );

    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    return reply.redirect(url.toString());
  });

  app.get<{
    Querystring: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };
  }>("/api/facebook/auth/callback", async (request, reply) => {
    assertFacebookConfig();

    const {
      code,
      state,
      error,
      error_description: errorDescription,
    } = request.query;

    if (error) {
      return reply.code(400).send({
        error,
        description: errorDescription,
      });
    }

    if (!code || !state || !verifyState(state)) {
      return reply.code(400).send({
        error: "Invalid OAuth callback",
      });
    }

    // Exchange OAuth code for Facebook user access token
    const tokenUrl = new URL(
      `https://graph.facebook.com/${graphVersion}/oauth/access_token`,
    );

    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl);

    const tokenData = (await tokenResponse.json()) as FacebookTokenResponse;

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error(
        "Facebook OAuth token exchange failed",
        tokenData.error ?? "unknown error",
      );

      return reply.code(502).send({
        error: "Facebook token exchange failed",
      });
    }

    const userAccessToken = tokenData.access_token;

    // Check which permissions Meta actually granted
    const permissionsUrl = new URL(
      `https://graph.facebook.com/${graphVersion}/me/permissions`,
    );

    permissionsUrl.searchParams.set("access_token", userAccessToken);

    const permissionsResponse = await fetch(permissionsUrl);

    const permissions = await permissionsResponse.json();

    console.log("Facebook granted permissions:", permissions);

    // TEMPORARY TEST:
    // Directly query the known MushMush Facebook Page.
    // We intentionally do NOT request/log the Page access token here.
    let directPageLookup: unknown = null;

    if (testPageId) {
      const pageUrl = new URL(
        `https://graph.facebook.com/${graphVersion}/${testPageId}`,
      );

      pageUrl.searchParams.set("fields", "id,name,instagram_business_account");

      pageUrl.searchParams.set("access_token", userAccessToken);

      const pageResponse = await fetch(pageUrl);

      directPageLookup = await pageResponse.json();

      console.log("Specific Page lookup:", directPageLookup);
    }

    // Normal Page enumeration
    const pagesUrl = new URL(
      `https://graph.facebook.com/${graphVersion}/me/accounts`,
    );

    pagesUrl.searchParams.set(
      "fields",
      [
        "id",
        "name",
        "tasks",
        "access_token",
        "instagram_business_account",
      ].join(","),
    );

    pagesUrl.searchParams.set("access_token", userAccessToken);

    const pagesResponse = await fetch(pagesUrl);

    const pages = (await pagesResponse.json()) as FacebookPagesResponse;

    if (!pagesResponse.ok) {
      console.error(
        "Facebook Page lookup failed",
        pages.error ?? "unknown error",
      );

      return reply.code(502).send({
        error: "Facebook Page lookup failed",
      });
    }

    const safePages = (pages.data ?? []).map((page) => ({
      id: page.id,
      name: page.name,
      tasks: page.tasks ?? [],
      instagramBusinessAccountId: page.instagram_business_account?.id ?? null,
      hasPageAccessToken: Boolean(page.access_token),
    }));

    return reply.send({
      connected: true,
      pages: safePages,
      directPageLookup,
    });
  });
}
