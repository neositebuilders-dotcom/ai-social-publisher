import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/ctx";
import { platformValidator } from "./schema";

/** Connected accounts for the signed-in user — never includes tokens. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const accounts = await ctx.db
      .query("platformAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return accounts.map((a) => ({
      _id: a._id,
      platform: a.platform,
      displayName: a.displayName,
      handle: a.handle,
      avatarUrl: a.avatarUrl,
      status: a.status,
      scopes: a.scopes ?? [],
      tokenExpiresAt: a.tokenExpiresAt,
      connectedAt: a.connectedAt,
      lastError: a.lastError,
    }));
  },
});

/** Upsert a platform account + its encrypted tokens (called by the OAuth action). */
export const storeConnection = internalMutation({
  args: {
    userId: v.id("users"),
    platform: platformValidator,
    externalId: v.optional(v.string()),
    displayName: v.optional(v.string()),
    handle: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    scopes: v.optional(v.array(v.string())),
    tokenExpiresAt: v.optional(v.number()),
    ciphertext: v.string(),
    iv: v.string(),
    authTag: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("platformAccounts")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", args.userId).eq("platform", args.platform),
      )
      .first();

    const now = Date.now();
    const accountId = existing
      ? (await ctx.db.patch(existing._id, {
          externalId: args.externalId,
          displayName: args.displayName,
          handle: args.handle,
          avatarUrl: args.avatarUrl,
          status: "connected",
          scopes: args.scopes,
          tokenExpiresAt: args.tokenExpiresAt,
          connectedAt: now,
          lastError: undefined,
        }),
        existing._id)
      : await ctx.db.insert("platformAccounts", {
          userId: args.userId,
          platform: args.platform,
          externalId: args.externalId,
          displayName: args.displayName,
          handle: args.handle,
          avatarUrl: args.avatarUrl,
          status: "connected",
          scopes: args.scopes,
          tokenExpiresAt: args.tokenExpiresAt,
          connectedAt: now,
        });

    const existingToken = await ctx.db
      .query("accountTokens")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .first();

    const tokenDoc = {
      accountId,
      userId: args.userId,
      platform: args.platform,
      ciphertext: args.ciphertext,
      iv: args.iv,
      authTag: args.authTag,
      updatedAt: now,
    };
    if (existingToken) {
      await ctx.db.patch(existingToken._id, tokenDoc);
    } else {
      await ctx.db.insert("accountTokens", tokenDoc);
    }

    await ctx.db.insert("auditLogs", {
      userId: args.userId,
      action: "account.connected",
      detail: args.platform,
      createdAt: now,
    });

    return accountId;
  },
});

/** Disconnect an account and delete its stored tokens. */
export const disconnect = mutation({
  args: { accountId: v.id("platformAccounts") },
  handler: async (ctx, { accountId }) => {
    const userId = await requireUserId(ctx);
    const account = await ctx.db.get(accountId);
    if (!account || account.userId !== userId) {
      throw new Error("Account not found");
    }
    const tokens = await ctx.db
      .query("accountTokens")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    for (const t of tokens) await ctx.db.delete(t._id);
    await ctx.db.delete(accountId);
    await ctx.db.insert("auditLogs", {
      userId,
      action: "account.disconnected",
      detail: account.platform,
      createdAt: Date.now(),
    });
  },
});

/** Mark an account as needing re-authentication (called on 401/403). */
export const markNeedsReauth = internalMutation({
  args: { accountId: v.id("platformAccounts"), error: v.string() },
  handler: async (ctx, { accountId, error }) => {
    await ctx.db.patch(accountId, { status: "needs_reauth", lastError: error });
  },
});

/** Internal: load the encrypted token payload for an account. */
export const getTokenPayload = internalMutation({
  args: { accountId: v.id("platformAccounts") },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    const token = await ctx.db
      .query("accountTokens")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .first();
    if (!account || !token) return null;
    return {
      userId: account.userId,
      platform: account.platform,
      externalId: account.externalId,
      ciphertext: token.ciphertext,
      iv: token.iv,
      authTag: token.authTag,
    };
  },
});

/** Internal: the connected account + token payload for a user and platform. */
export const findForUserPlatform = internalMutation({
  args: { userId: v.id("users"), platform: platformValidator },
  handler: async (ctx, { userId, platform }) => {
    const account = await ctx.db
      .query("platformAccounts")
      .withIndex("by_user_platform", (q) =>
        q.eq("userId", userId).eq("platform", platform),
      )
      .first();
    if (!account) return null;
    const token = await ctx.db
      .query("accountTokens")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .first();
    if (!token) return null;
    return {
      accountId: account._id,
      status: account.status,
      externalId: account.externalId,
      ciphertext: token.ciphertext,
      iv: token.iv,
      authTag: token.authTag,
    };
  },
});
