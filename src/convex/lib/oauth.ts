"use node";

/**
 * Official OAuth 2.0 configuration for each platform.
 *
 * Everything here uses only documented authorization-code flows. No password
 * grants, no scraping. When an app's client id/secret is missing from the
 * environment the flow refuses to start and tells the operator exactly which
 * env vars are required rather than pretending to connect.
 */

import type { PlatformId } from "./platforms";

export interface OAuthConfig {
  platform: PlatformId;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  redirectEnv: string;
  /** Where the client credentials go on the token request. */
  tokenAuthStyle: "body" | "basic";
  /** PKCE (required by X, optional elsewhere). */
  pkce: boolean;
  extraAuthorizeParams?: Record<string, string>;
}

export const OAUTH_CONFIGS: Partial<Record<PlatformId, OAuthConfig>> = {
  instagram: {
    platform: "instagram",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_content_publish",
    ],
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    redirectEnv: "META_REDIRECT_URI",
    tokenAuthStyle: "body",
    pkce: false,
  },
  facebook: {
    platform: "facebook",
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: [
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "read_insights",
    ],
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
    redirectEnv: "META_REDIRECT_URI",
    tokenAuthStyle: "body",
    pkce: false,
  },
  youtube: {
    platform: "youtube",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    redirectEnv: "GOOGLE_REDIRECT_URI",
    tokenAuthStyle: "body",
    pkce: false,
    extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
  },
  linkedin: {
    platform: "linkedin",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "w_member_social"],
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    redirectEnv: "LINKEDIN_REDIRECT_URI",
    tokenAuthStyle: "body",
    pkce: false,
  },
  tiktok: {
    platform: "tiktok",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.publish", "video.list"],
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    redirectEnv: "TIKTOK_REDIRECT_URI",
    tokenAuthStyle: "body",
    pkce: false,
  },
  x: {
    platform: "x",
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    clientIdEnv: "X_CLIENT_ID",
    clientSecretEnv: "X_CLIENT_SECRET",
    redirectEnv: "X_REDIRECT_URI",
    tokenAuthStyle: "basic",
    pkce: true,
  },
};

export interface OAuthEnvCheck {
  ok: boolean;
  missing: string[];
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

/** Verify the operator configured this platform's OAuth app. */
export function checkOAuthEnv(platform: PlatformId): OAuthEnvCheck {
  const config = OAUTH_CONFIGS[platform];
  if (!config) {
    return { ok: false, missing: [] };
  }
  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  const redirectUri = process.env[config.redirectEnv];
  const missing: string[] = [];
  if (!clientId) missing.push(config.clientIdEnv);
  if (!clientSecret) missing.push(config.clientSecretEnv);
  if (!redirectUri) missing.push(config.redirectEnv);
  if (!process.env.TOKEN_ENCRYPTION_KEY) missing.push("TOKEN_ENCRYPTION_KEY");
  return { ok: missing.length === 0, missing, clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(args: {
  config: OAuthConfig;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}): string {
  const url = new URL(args.config.authorizeUrl);
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", args.config.scopes.join(" "));
  url.searchParams.set("state", args.state);
  if (args.config.pkce && args.codeChallenge) {
    url.searchParams.set("code_challenge", args.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(args.config.extraAuthorizeParams ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

/** Exchange an authorization code for tokens (documented code flow only). */
export async function exchangeCode(args: {
  config: OAuthConfig;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier?: string;
}): Promise<TokenResponse> {
  const { config } = args;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (config.tokenAuthStyle === "basic") {
    headers.Authorization = `Basic ${Buffer.from(
      `${args.clientId}:${args.clientSecret}`,
    ).toString("base64")}`;
  } else {
    body.set("client_id", args.clientId);
    body.set("client_secret", args.clientSecret);
  }
  // TikTok wants client_key/client_secret.
  if (config.platform === "tiktok") {
    body.set("client_key", args.clientId);
    body.delete("client_id");
  }
  if (args.codeVerifier) body.set("code_verifier", args.codeVerifier);

  const res = await fetch(config.tokenUrl, { method: "POST", headers, body });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 240)}`);
  }
  const json = JSON.parse(text) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    data?: { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  };
  const payload = json.data ?? json;
  if (!payload.access_token) {
    throw new Error(`Token exchange returned no access token: ${text.slice(0, 240)}`);
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : undefined,
    scope: payload.scope,
  };
}

export interface ResolvedAccount {
  externalId?: string;
  displayName?: string;
  handle?: string;
  avatarUrl?: string;
  extra?: Record<string, string>;
}

/** Look up the platform-side identity for the freshly authorized user/page. */
export async function resolveAccount(
  platform: PlatformId,
  accessToken: string,
): Promise<ResolvedAccount> {
  const get = async (url: string, auth = accessToken) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${auth}` } });
    if (!res.ok) throw new Error(`${platform} profile lookup failed (${res.status})`);
    return (await res.json()) as Record<string, unknown>;
  };

  switch (platform) {
    case "facebook":
    case "instagram": {
      const pages = (await get(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`,
      )) as {
        data?: Array<{
          id: string;
          name: string;
          access_token: string;
          instagram_business_account?: { id: string };
        }>;
      };
      const page = pages.data?.[0];
      if (!page) throw new Error("No Facebook Page available for this account.");
      if (platform === "instagram") {
        const igId = page.instagram_business_account?.id;
        if (!igId) {
          throw new Error(
            "This Facebook Page has no linked Instagram Business account.",
          );
        }
        return {
          externalId: igId,
          displayName: `${page.name} (Instagram)`,
          handle: page.name,
          extra: { pageId: page.id, pageToken: page.access_token },
        };
      }
      return {
        externalId: page.id,
        displayName: page.name,
        handle: page.name,
        extra: { pageToken: page.access_token },
      };
    }
    case "youtube": {
      const data = (await get(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      )) as {
        items?: Array<{
          id: string;
          snippet?: { title: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
        }>;
      };
      const ch = data.items?.[0];
      if (!ch) throw new Error("This Google account has no YouTube channel.");
      return {
        externalId: ch.id,
        displayName: ch.snippet?.title,
        handle: ch.snippet?.customUrl,
        avatarUrl: ch.snippet?.thumbnails?.default?.url,
      };
    }
    case "linkedin": {
      const me = (await get("https://api.linkedin.com/v2/userinfo")) as {
        sub?: string;
        name?: string;
        picture?: string;
      };
      return {
        externalId: me.sub,
        displayName: me.name,
        handle: me.name,
        avatarUrl: me.picture,
      };
    }
    case "tiktok": {
      const me = (await get(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
      )) as {
        data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } };
      };
      const u = me.data?.user;
      return {
        externalId: u?.open_id,
        displayName: u?.display_name,
        handle: u?.display_name,
        avatarUrl: u?.avatar_url,
      };
    }
    case "x": {
      const me = (await get("https://api.x.com/2/users/me")) as {
        data?: { id?: string; name?: string; username?: string };
      };
      return {
        externalId: me.data?.id,
        displayName: me.data?.name,
        handle: me.data?.username,
      };
    }
    case "picsart":
      return {};
  }
}
