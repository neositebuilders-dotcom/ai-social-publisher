import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  OAUTH_CONFIGS,
  buildAuthorizeUrl,
  checkOAuthEnv,
  exchangeCode,
} from "../src/convex/lib/oauth";
import { OAUTH_ENABLED } from "../src/convex/lib/platforms";

const realFetch = globalThis.fetch;
const envSnapshot = { ...process.env };
let calls: Array<{ url: string; init: RequestInit | undefined }> = [];

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  calls = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value !== undefined) process.env[key] = value;
  }
}

beforeEach(() => {
  calls = [];
  for (const key of [
    "META_APP_ID",
    "META_APP_SECRET",
    "META_REDIRECT_URI",
    "TOKEN_ENCRYPTION_KEY",
    "X_CLIENT_ID",
    "X_CLIENT_SECRET",
    "X_REDIRECT_URI",
  ]) {
    delete process.env[key];
  }
});

afterEach(() => {
  globalThis.fetch = realFetch;
  restoreEnv();
});

describe("configuration coverage", () => {
  test("every OAuth platform has a documented authorization-code config", () => {
    for (const platform of OAUTH_ENABLED) {
      const config = OAUTH_CONFIGS[platform];
      expect(config).toBeDefined();
      expect(config!.authorizeUrl.startsWith("https://")).toBe(true);
      expect(config!.tokenUrl.startsWith("https://")).toBe(true);
      expect(config!.scopes.length).toBeGreaterThan(0);
    }
  });

  test("Picsart has no OAuth flow because it publishes nothing", () => {
    expect(OAUTH_CONFIGS.picsart).toBeUndefined();
  });

  test("no flow uses a password grant", () => {
    for (const platform of OAUTH_ENABLED) {
      const config = OAUTH_CONFIGS[platform]!;
      expect(config.scopes.join(" ")).not.toMatch(/password/i);
      expect(["body", "basic"]).toContain(config.tokenAuthStyle);
    }
  });
});

describe("checkOAuthEnv", () => {
  test("lists exactly which env vars are missing", () => {
    const check = checkOAuthEnv("instagram");
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual([
      "META_APP_ID",
      "META_APP_SECRET",
      "META_REDIRECT_URI",
      "TOKEN_ENCRYPTION_KEY",
    ]);
  });

  test("passes once the app credentials and encryption key exist", () => {
    process.env.META_APP_ID = "app-1";
    process.env.META_APP_SECRET = "secret-1";
    process.env.META_REDIRECT_URI = "https://example.convex.site/oauth/callback";
    process.env.TOKEN_ENCRYPTION_KEY = "k".repeat(64);

    const check = checkOAuthEnv("instagram");
    expect(check.ok).toBe(true);
    expect(check.missing).toEqual([]);
    expect(check.clientId).toBe("app-1");
  });
});

describe("buildAuthorizeUrl", () => {
  test("builds a state-protected authorization-code URL", () => {
    const url = new URL(
      buildAuthorizeUrl({
        config: OAUTH_CONFIGS.instagram!,
        clientId: "app-1",
        redirectUri: "https://example.convex.site/oauth/callback",
        state: "csrf-nonce-123",
      }),
    );

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("csrf-nonce-123");
    expect(url.searchParams.get("client_id")).toBe("app-1");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.convex.site/oauth/callback",
    );
    expect(url.searchParams.get("scope")).toContain("instagram_content_publish");
    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.searchParams.get("client_secret")).toBeNull();
  });

  test("adds S256 PKCE for X", () => {
    const url = new URL(
      buildAuthorizeUrl({
        config: OAUTH_CONFIGS.x!,
        clientId: "x-client",
        redirectUri: "https://example.convex.site/oauth/callback",
        state: "nonce",
        codeChallenge: "challenge-value",
      }),
    );
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("exchangeCode", () => {
  test("X sends client credentials via Basic auth and includes the PKCE verifier", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 7200,
          scope: "tweet.write",
        }),
        { status: 200 },
      ),
    );

    const tokens = await exchangeCode({
      config: OAUTH_CONFIGS.x!,
      clientId: "x-client",
      clientSecret: "x-secret",
      redirectUri: "https://example.convex.site/oauth/callback",
      code: "auth-code",
      codeVerifier: "verifier-1",
    });

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("x-client:x-secret").toString("base64")}`,
    );
    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBe("verifier-1");
    expect(body.get("client_secret")).toBeNull();

    expect(tokens.accessToken).toBe("access-1");
    expect(tokens.refreshToken).toBe("refresh-1");
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
  });

  test("TikTok uses client_key/client_secret in the body and unwraps data", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({
          data: {
            access_token: "tt-access",
            refresh_token: "tt-refresh",
            expires_in: 86400,
            scope: "video.publish",
          },
        }),
        { status: 200 },
      ),
    );

    const tokens = await exchangeCode({
      config: OAUTH_CONFIGS.tiktok!,
      clientId: "tt-key",
      clientSecret: "tt-secret",
      redirectUri: "https://example.convex.site/oauth/callback",
      code: "code-1",
    });

    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.get("client_key")).toBe("tt-key");
    expect(body.get("client_id")).toBeNull();
    expect(body.get("client_secret")).toBe("tt-secret");
    expect(tokens.accessToken).toBe("tt-access");
  });

  test("surfaces a failed exchange with the HTTP status", async () => {
    mockFetch(() => new Response("invalid_grant", { status: 400 }));
    await expect(
      exchangeCode({
        config: OAUTH_CONFIGS.instagram!,
        clientId: "a",
        clientSecret: "b",
        redirectUri: "https://example.com/cb",
        code: "bad",
      }),
    ).rejects.toThrow(/Token exchange failed \(400\)/);
  });

  test("refuses a response that contains no access token", async () => {
    mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(
      exchangeCode({
        config: OAUTH_CONFIGS.instagram!,
        clientId: "a",
        clientSecret: "b",
        redirectUri: "https://example.com/cb",
        code: "x",
      }),
    ).rejects.toThrow(/no access token/i);
  });
});
