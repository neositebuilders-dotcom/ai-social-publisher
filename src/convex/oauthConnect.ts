"use node";

import { createHash, randomBytes } from "node:crypto";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/ctx";
import { sealTokens } from "./lib/crypto";
import {
  OAUTH_CONFIGS,
  buildAuthorizeUrl,
  checkOAuthEnv,
  exchangeCode,
  resolveAccount,
} from "./lib/oauth";
import { platformValidator, type PlatformId } from "./schema";

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Begin the OAuth 2.0 authorization-code flow for a platform.
 * Returns a ready-to-redirect URL, or an explicit list of the env vars the
 * operator still has to configure. Never fabricates a connection.
 */
export const start = action({
  args: { platform: platformValidator },
  handler: async (
    ctx,
    { platform },
  ): Promise<
    | { ok: true; authUrl: string; scopes: string[] }
    | {
        ok: false;
        reason: "unsupported" | "not_configured";
        missing: string[];
        message: string;
      }
  > => {
    const userId = await requireUserId(ctx);
    const config = OAUTH_CONFIGS[platform];
    if (!config) {
      return {
        ok: false as const,
        reason: "unsupported" as const,
        missing: [] as string[],
        message: `${platform} does not support OAuth in this build.`,
      };
    }
    const env = checkOAuthEnv(platform);
    if (!env.ok) {
      return {
        ok: false as const,
        reason: "not_configured" as const,
        missing: env.missing,
        message:
          "This platform's OAuth app is not configured on the backend yet. Set these Convex environment variables, then retry.",
      };
    }

    const state = randomBytes(24).toString("hex");
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;
    if (config.pkce) {
      codeVerifier = randomBytes(32).toString("base64url");
      codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    }

    await ctx.runMutation(internal.oauthStates.create, {
      state,
      userId,
      platform,
      redirectUri: env.redirectUri,
      codeVerifier,
      ttlMs: STATE_TTL_MS,
    });

    const authUrl = buildAuthorizeUrl({
      config,
      clientId: env.clientId!,
      redirectUri: env.redirectUri!,
      state,
      codeChallenge,
    });

    return { ok: true as const, authUrl, scopes: config.scopes };
  },
});

/**
 * Complete the flow. The single-use `state` nonce is what binds the callback to
 * the user who started it (CSRF protection), so no session is required here.
 */
export const complete = internalAction({
  args: { code: v.string(), state: v.string() },
  handler: async (
    ctx,
    { code, state },
  ): Promise<{
    ok: true;
    platform: PlatformId;
    accountId: Id<"platformAccounts">;
    displayName?: string;
  }> => {
    const pending = await ctx.runMutation(internal.oauthStates.consume, { state });
    if (!pending) throw new Error("This authorization link is invalid or has expired.");

    const platform = pending.platform as PlatformId;
    const config = OAUTH_CONFIGS[platform];
    if (!config) throw new Error(`${platform} does not support OAuth in this build.`);

    const env = checkOAuthEnv(platform);
    if (!env.ok) {
      throw new Error(`Missing backend configuration: ${env.missing.join(", ")}`);
    }

    const tokens = await exchangeCode({
      config,
      clientId: env.clientId!,
      clientSecret: env.clientSecret!,
      redirectUri: pending.redirectUri ?? env.redirectUri!,
      code,
      codeVerifier: pending.codeVerifier,
    });

    const profile = await resolveAccount(platform, tokens.accessToken);

    const sealed = sealTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      extra: profile.extra,
    });

    const accountId = await ctx.runMutation(internal.accounts.storeConnection, {
      userId: pending.userId,
      platform,
      externalId: profile.externalId,
      displayName: profile.displayName,
      handle: profile.handle,
      avatarUrl: profile.avatarUrl,
      scopes: tokens.scope ? tokens.scope.split(/[\s,]+/) : config.scopes,
      tokenExpiresAt: tokens.expiresAt,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      authTag: sealed.authTag,
    });

    return { ok: true as const, platform, accountId, displayName: profile.displayName };
  },
});
