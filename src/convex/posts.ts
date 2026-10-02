import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { enqueuePublishJob } from "./lib/jobs";
import { getAdapter, type AdapterPost } from "./lib/platforms";
import { requireUserId } from "./lib/ctx";
import {
  contentTypeValidator,
  platformValidator,
  postStatusValidator,
  validationIssueValidator,
} from "./schema";

const listArgs = {
  status: v.optional(postStatusValidator),
  campaignId: v.optional(v.id("campaigns")),
  platform: v.optional(platformValidator),
  limit: v.optional(v.number()),
};

type PostFilters = {
  status?: Doc<"posts">["status"];
  campaignId?: Doc<"posts">["campaignId"];
  platform?: Doc<"posts">["platform"];
  limit?: number;
};

async function filteredPosts(
  ctx: QueryCtx,
  userId: Id<"users">,
  filters: PostFilters,
): Promise<Doc<"posts">[]> {
  const limit = Math.min(filters.limit ?? 100, 300);
  if (filters.status && !filters.campaignId && !filters.platform) {
    return await ctx.db
      .query("posts")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", filters.status!),
      )
      .order("desc")
      .take(limit);
  }
  let rows = await ctx.db
    .query("posts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(Math.max(limit * 3, 300));
  if (filters.status) rows = rows.filter((p) => p.status === filters.status);
  if (filters.campaignId)
    rows = rows.filter((p) => p.campaignId === filters.campaignId);
  if (filters.platform)
    rows = rows.filter((p) => p.platform === filters.platform);
  return rows.slice(0, limit);
}

export const list = query({
  args: listArgs,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await filteredPosts(ctx, userId, args);
  },
});

export const counts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const counts: Record<string, number> = {
      draft: 0,
      approved: 0,
      scheduled: 0,
      publishing: 0,
      published: 0,
      failed: 0,
    };
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return { total: rows.length, ...counts };
  },
});

export const get = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const userId = await requireUserId(ctx);
    const post = await ctx.db.get(postId);
    if (!post || post.userId !== userId) return null;
    const logs = await ctx.db
      .query("jobLogs")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .order("desc")
      .take(20);
    const analytics = await ctx.db
      .query("analytics")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();
    return { post, logs, analytics };
  },
});

/** Scheduled posts on or after `from`, for the content calendar. */
export const calendar = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("posts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows
      .filter(
        (p) =>
          p.scheduledFor !== undefined &&
          p.scheduledFor >= from &&
          p.scheduledFor <= to,
      )
      .sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0));
  },
});

/* ------------------------------ lifecycle -------------------------------- */

export const updateDraft = mutation({
  args: {
    postId: v.id("posts"),
    title: v.optional(v.string()),
    caption: v.optional(v.string()),
    description: v.optional(v.string()),
    hashtags: v.optional(v.array(v.string())),
    cta: v.optional(v.string()),
    mediaUrl: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== userId) throw new Error("Post not found");

    const { postId, ...patch } = args;
    await ctx.db.patch(postId, { ...patch, updatedAt: Date.now() });

    // Re-validate synchronously against the platform's rules.
    const next = { ...post, ...patch };
    const adapter = getAdapter(next.platform);
    if (adapter) {
      const issues = adapter.validate(
        {
          caption: next.caption,
          title: next.title,
          description: next.description,
          hashtags: next.hashtags,
          cta: next.cta,
          mediaType: next.mediaType,
          mediaUrl: next.mediaUrl,
        } as AdapterPost,
      );
      await ctx.db.patch(postId, { validation: issues, updatedAt: Date.now() });
    }
  },
});

export const approve = mutation({
  args: { postId: v.id("posts"), scheduledFor: v.number() },
  handler: async (ctx, { postId, scheduledFor }) => {
    const userId = await requireUserId(ctx);
    const post = await ctx.db.get(postId);
    if (!post || post.userId !== userId) throw new Error("Post not found");
    await ctx.db.patch(postId, {
      status: "scheduled",
      approvedAt: Date.now(),
      scheduledFor,
      error: undefined,
      updatedAt: Date.now(),
    });
    await enqueuePublishJob(ctx, {
      userId,
      postId,
      campaignId: post.campaignId,
      platform: post.platform,
      runAt: scheduledFor,
      idempotencyKey: `${postId}:${scheduledFor}`,
    });
  },
});

export const approveMany = mutation({
  args: { postIds: v.array(v.id("posts")), scheduledFor: v.number() },
  handler: async (ctx, { postIds, scheduledFor }) => {
    const userId = await requireUserId(ctx);
    let approved = 0;
    for (const postId of postIds) {
      const post = await ctx.db.get(postId);
      if (!post || post.userId !== userId) continue;
      if (post.status !== "draft" && post.status !== "approved") continue;
      // Stagger approved posts 15 minutes apart so they don't all fire at once.
      const at = scheduledFor + approved * 15 * 60 * 1000;
      await ctx.db.patch(postId, {
        status: "scheduled",
        approvedAt: Date.now(),
        scheduledFor: at,
        updatedAt: Date.now(),
      });
      await enqueuePublishJob(ctx, {
        userId,
        postId,
        campaignId: post.campaignId,
        platform: post.platform,
        runAt: at,
        idempotencyKey: `${postId}:${at}`,
      });
      approved++;
    }
    return approved;
  },
});

export const retry = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const userId = await requireUserId(ctx);
    const post = await ctx.db.get(postId);
    if (!post || post.userId !== userId) throw new Error("Post not found");
    const at = Date.now() + 1000;
    await ctx.db.patch(postId, {
      status: "scheduled",
      error: undefined,
      scheduledFor: at,
      updatedAt: Date.now(),
    });
    await enqueuePublishJob(ctx, {
      userId,
      postId,
      campaignId: post.campaignId,
      platform: post.platform,
      runAt: at,
      idempotencyKey: `${postId}:retry:${at}`,
    });
  },
});

export const discard = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    const userId = await requireUserId(ctx);
    const post = await ctx.db.get(postId);
    if (!post || post.userId !== userId) throw new Error("Post not found");
    const jobs = await ctx.db
      .query("publishJobs")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();
    for (const job of jobs) await ctx.db.delete(job._id);
    await ctx.db.delete(postId);
  },
});

/* --------------------------- action-facing internals ---------------------- */

export const insertGenerated = internalMutation({
  args: {
    userId: v.id("users"),
    campaignId: v.optional(v.id("campaigns")),
    platform: platformValidator,
    status: postStatusValidator,
    title: v.optional(v.string()),
    caption: v.string(),
    description: v.optional(v.string()),
    hashtags: v.array(v.string()),
    cta: v.optional(v.string()),
    contentPillar: v.optional(v.string()),
    contentTypes: v.array(contentTypeValidator),
    mediaType: v.optional(contentTypeValidator),
    mediaUrl: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
    aiProvider: v.optional(v.string()),
    aiModel: v.optional(v.string()),
    validation: v.array(validationIssueValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      userId: args.userId,
      campaignId: args.campaignId,
      platform: args.platform,
      status: args.status,
      title: args.title,
      caption: args.caption,
      description: args.description,
      hashtags: args.hashtags,
      cta: args.cta,
      contentPillar: args.contentPillar,
      contentTypes: args.contentTypes,
      mediaType: args.mediaType,
      mediaUrl: args.mediaUrl,
      scheduledFor: args.scheduledFor,
      aiProvider: args.aiProvider,
      aiModel: args.aiModel,
      validation: args.validation,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    if (args.status === "scheduled" && args.scheduledFor) {
      await enqueuePublishJob(ctx, {
        userId: args.userId,
        postId,
        campaignId: args.campaignId,
        platform: args.platform,
        runAt: args.scheduledFor,
        idempotencyKey: `${postId}:${args.scheduledFor}`,
      });
    }
    return postId;
  },
});

export const remember = internalMutation({
  args: {
    userId: v.id("users"),
    campaignId: v.id("campaigns"),
    platform: v.optional(platformValidator),
    topicKey: v.string(),
    title: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("contentMemory", { ...args, createdAt: Date.now() });
  },
});

export const historyForCampaign = internalMutation({
  args: { campaignId: v.id("campaigns"), limit: v.optional(v.number()) },
  handler: async (ctx, { campaignId, limit }) => {
    const rows = await ctx.db
      .query("contentMemory")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .order("desc")
      .take(limit ?? 40);
    return rows.map((r) => ({
      topicKey: r.topicKey,
      title: r.title,
      summary: r.summary,
    }));
  },
});

export const setStatusInternal = internalMutation({
  args: { postId: v.id("posts"), status: postStatusValidator, error: v.optional(v.string()) },
  handler: async (ctx, { postId, status, error }) => {
    await ctx.db.patch(postId, { status, error, updatedAt: Date.now() });
  },
});

export const recordPublishSuccess = internalMutation({
  args: {
    postId: v.id("posts"),
    platformPostId: v.optional(v.string()),
    platformPostUrl: v.optional(v.string()),
    publishedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      status: "published",
      platformPostId: args.platformPostId,
      platformPostUrl: args.platformPostUrl,
      publishedAt: args.publishedAt,
      error: undefined,
      updatedAt: args.publishedAt,
    });
  },
});

export const recordPublishFailure = internalMutation({
  args: { postId: v.id("posts"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.postId, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    });
  },
});

export const loadForAction = internalMutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => await ctx.db.get(postId),
});

/** Published posts that have a platform-side id, for analytics collection. */
export const publishedWithIds = internalMutation({
  args: { userId: v.optional(v.id("users")), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    const take = Math.min(limit ?? 50, 200);
    let rows: Doc<"posts">[];
    if (userId) {
      rows = await ctx.db
        .query("posts")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", "published"),
        )
        .order("desc")
        .take(take);
    } else {
      const all = await ctx.db.query("posts").collect();
      rows = all
        .filter((p) => p.status === "published")
        .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
        .slice(0, take);
    }
    return rows
      .filter((p) => !!p.platformPostId)
      .map((p) => ({
        postId: p._id,
        userId: p.userId,
        campaignId: p.campaignId,
        platform: p.platform,
        platformPostId: p.platformPostId!,
      }));
  },
});
