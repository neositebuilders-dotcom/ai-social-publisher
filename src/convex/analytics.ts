import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireUserId } from "./lib/ctx";
import { platformValidator } from "./schema";

export const summary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("analytics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const totals = {
      impressions: 0,
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: 0,
      views: 0,
    };
    const byPlatform: Record<
      string,
      { posts: number; impressions: number; likes: number; comments: number; views: number; unavailable: number }
    > = {};

    for (const row of rows) {
      const p = (byPlatform[row.platform] ??= {
        posts: 0,
        impressions: 0,
        likes: 0,
        comments: 0,
        views: 0,
        unavailable: 0,
      });
      p.posts += 1;
      if (row.source === "unavailable") p.unavailable += 1;
      totals.impressions += row.metrics.impressions ?? 0;
      totals.reach += row.metrics.reach ?? 0;
      totals.likes += row.metrics.likes ?? 0;
      totals.comments += row.metrics.comments ?? 0;
      totals.shares += row.metrics.shares ?? 0;
      totals.clicks += row.metrics.clicks ?? 0;
      totals.views += row.metrics.views ?? 0;
      p.impressions += row.metrics.impressions ?? 0;
      p.likes += row.metrics.likes ?? 0;
      p.comments += row.metrics.comments ?? 0;
      p.views += row.metrics.views ?? 0;
    }

    return {
      totals,
      byPlatform,
      tracked: rows.length,
      lastCollectedAt: rows.reduce((acc, r) => Math.max(acc, r.collectedAt), 0),
    };
  },
});

export const forPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("analytics")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();
    return rows.filter((r) => r.userId === userId);
  },
});

export const upsertMetrics = internalMutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
    campaignId: v.optional(v.id("campaigns")),
    platform: platformValidator,
    source: v.union(
      v.literal("api"),
      v.literal("unavailable"),
      v.literal("pending"),
    ),
    note: v.optional(v.string()),
    metrics: v.object({
      impressions: v.optional(v.number()),
      reach: v.optional(v.number()),
      likes: v.optional(v.number()),
      comments: v.optional(v.number()),
      shares: v.optional(v.number()),
      clicks: v.optional(v.number()),
      views: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("analytics")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .first();
    const payload = { ...args, collectedAt: Date.now() };
    if (existing && existing.userId === args.userId) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("analytics", payload);
    }
  },
});
