import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { platformValidator } from "./schema";

/** Create a single-use CSRF nonce for an OAuth handshake. */
export const create = internalMutation({
  args: {
    state: v.string(),
    userId: v.id("users"),
    platform: platformValidator,
    redirectUri: v.optional(v.string()),
    codeVerifier: v.optional(v.string()),
    ttlMs: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("oauthStates", {
      state: args.state,
      userId: args.userId,
      platform: args.platform,
      redirectUri: args.redirectUri,
      codeVerifier: args.codeVerifier,
      createdAt: now,
      expiresAt: now + args.ttlMs,
    });
  },
});

/** Consume (and delete) a nonce. Returns null if missing or expired. */
export const consume = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", state))
      .first();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt < Date.now()) return null;
    return {
      userId: row.userId,
      platform: row.platform,
      redirectUri: row.redirectUri,
      codeVerifier: row.codeVerifier,
    };
  },
});
