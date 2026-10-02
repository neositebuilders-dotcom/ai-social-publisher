"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/ctx";
import { isEncryptionConfigured, openTokens } from "./lib/crypto";
import {
  getAdapter,
  type AdapterPost,
  type PlatformCredentials,
  type PlatformId,
} from "./lib/platforms";
import { platformValidator } from "./schema";

interface ClaimedJob {
  jobId: Id<"publishJobs">;
  postId: Id<"posts">;
  campaignId?: Id<"campaigns">;
  userId: Id<"users">;
  platform: PlatformId;
  attempts: number;
  maxAttempts: number;
}

type PublishOutcome =
  | { ok: true; url?: string; alreadyPublished?: boolean }
  | { ok: false; error?: string; code?: string };

/** Publish one claimed job. Always terminates the job one way or another. */
async function runPublish(
  ctx: ActionCtx,
  job: ClaimedJob,
): Promise<PublishOutcome> {
  const now = Date.now();
  const post = await ctx.runMutation(internal.posts.loadForAction, {
    postId: job.postId,
  });

  if (!post) {
    await ctx.runMutation(internal.jobs.finishFailure, {
      jobId: job.jobId,
      error: "Post no longer exists.",
      retryable: false,
      now,
    });
    return { ok: false as const, error: "Post missing" };
  }
  if (post.status === "published") {
    await ctx.runMutation(internal.jobs.finishSuccess, { jobId: job.jobId, now });
    return { ok: true as const, alreadyPublished: true };
  }

  const adapter = getAdapter(post.platform);
  if (!adapter) {
    await ctx.runMutation(internal.jobs.finishFailure, {
      jobId: job.jobId,
      error: `Unknown platform "${post.platform}".`,
      retryable: false,
      now,
    });
    return { ok: false as const, error: "Unknown platform" };
  }

  const account = await ctx.runMutation(internal.accounts.findForUserPlatform, {
    userId: job.userId,
    platform: post.platform,
  });
  if (!account) {
    await ctx.runMutation(internal.jobs.finishFailure, {
      jobId: job.jobId,
      error: `No connected ${adapter.label} account. Connect one under Connected accounts.`,
      retryable: false,
      now,
    });
    return { ok: false as const, error: "Account not connected" };
  }

  if (!isEncryptionConfigured()) {
    await ctx.runMutation(internal.jobs.finishFailure, {
      jobId: job.jobId,
      error:
        "TOKEN_ENCRYPTION_KEY is not set on the Convex deployment, so stored tokens cannot be decrypted.",
      retryable: false,
      now,
    });
    return { ok: false as const, error: "Encryption key missing" };
  }

  let credentials: PlatformCredentials;
  try {
    const tokens = openTokens({
      ciphertext: account.ciphertext,
      iv: account.iv,
      authTag: account.authTag,
    });
    credentials = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      externalId: account.externalId,
      extra: tokens.extra,
    };
  } catch (err) {
    await ctx.runMutation(internal.jobs.finishFailure, {
      jobId: job.jobId,
      error: `Token decryption failed: ${err instanceof Error ? err.message : String(err)}`,
      retryable: false,
      now,
    });
    return { ok: false as const, error: "Decryption failed" };
  }

  const adapterPost: AdapterPost = {
    caption: post.caption,
    title: post.title,
    description: post.description,
    hashtags: post.hashtags,
    cta: post.cta,
    mediaType: post.mediaType,
    mediaUrl: post.mediaUrl,
  };

  let result;
  try {
    result = await adapter.publish(credentials, adapterPost);
  } catch (err) {
    result = {
      ok: false,
      code: "platform_error" as const,
      error: err instanceof Error ? err.message : String(err),
      retryable: true,
    };
  }

  if (result.ok) {
    await ctx.runMutation(internal.posts.recordPublishSuccess, {
      postId: post._id,
      platformPostId: result.platformPostId,
      platformPostUrl: result.url,
      publishedAt: now,
    });
    await ctx.runMutation(internal.jobs.finishSuccess, { jobId: job.jobId, now });
    await ctx.runMutation(internal.analytics.upsertMetrics, {
      userId: job.userId,
      postId: post._id,
      campaignId: post.campaignId,
      platform: post.platform,
      source: "pending",
      note: "Waiting for the first analytics sync.",
      metrics: {},
    });
    if (result.platformPostId) {
      void collectForPost(ctx, {
        postId: post._id,
        userId: job.userId,
        campaignId: post.campaignId,
        platform: post.platform,
        platformPostId: result.platformPostId,
      }, credentials);
    }
    return { ok: true as const, url: result.url };
  }

  if (result.code === "auth_expired") {
    await ctx.runMutation(internal.accounts.markNeedsReauth, {
      accountId: account.accountId,
      error: result.error ?? "Token rejected by the platform.",
    });
  }

  await ctx.runMutation(internal.jobs.finishFailure, {
    jobId: job.jobId,
    error: result.error ?? "Publish failed.",
    retryable: result.retryable ?? false,
    now,
  });
  return { ok: false as const, error: result.error, code: result.code };
}

/** Called by the scheduler after a job has been atomically claimed. */
export const publishJob = internalAction({
  args: {
    jobId: v.id("publishJobs"),
    postId: v.id("posts"),
    campaignId: v.optional(v.id("campaigns")),
    userId: v.id("users"),
    platform: platformValidator,
    attempts: v.number(),
    maxAttempts: v.number(),
  },
  handler: async (ctx, args): Promise<PublishOutcome> => {
    return await runPublish(ctx, args);
  },
});

/** Publish a single post immediately, from the dashboard. */
export const publishNow = action({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }): Promise<PublishOutcome> => {
    const userId = await requireUserId(ctx);
    const post = await ctx.runMutation(internal.posts.loadForAction, { postId });
    if (!post || post.userId !== userId) throw new Error("Post not found");

    const runAt = Date.now();
    const jobId = await ctx.runMutation(internal.jobs.enqueueNow, {
      userId,
      postId,
      campaignId: post.campaignId,
      platform: post.platform,
      runAt,
    });
    if (!jobId) throw new Error("Could not queue the post.");
    const claimed = await ctx.runMutation(internal.jobs.claimOne, {
      jobId,
      now: runAt,
    });
    if (!claimed) return { ok: false as const, error: "Job already completed." };
    return await runPublish(ctx, claimed);
  },
});

/* -------------------------------- analytics ------------------------------- */

interface AnalyticsTarget {
  postId: Id<"posts">;
  userId: Id<"users">;
  campaignId?: Id<"campaigns">;
  platform: PlatformId;
  platformPostId: string;
}

async function collectForPost(
  ctx: ActionCtx,
  target: AnalyticsTarget,
  credentials: PlatformCredentials,
): Promise<{ source: "api" | "unavailable" }> {
  const adapter = getAdapter(target.platform);
  if (!adapter?.fetchMetrics) {
    await ctx.runMutation(internal.analytics.upsertMetrics, {
      userId: target.userId,
      postId: target.postId,
      campaignId: target.campaignId,
      platform: target.platform,
      source: "unavailable",
      note: `${adapter?.label ?? target.platform} does not expose post metrics through its public API.`,
      metrics: {},
    });
    return { source: "unavailable" as const };
  }
  try {
    const result = await adapter.fetchMetrics(credentials, target.platformPostId);
    if (!result) {
      await ctx.runMutation(internal.analytics.upsertMetrics, {
        userId: target.userId,
        postId: target.postId,
        campaignId: target.campaignId,
        platform: target.platform,
        source: "unavailable",
        note: "Metrics are not available for this post.",
        metrics: {},
      });
      return { source: "unavailable" as const };
    }
    await ctx.runMutation(internal.analytics.upsertMetrics, {
      userId: target.userId,
      postId: target.postId,
      campaignId: target.campaignId,
      platform: target.platform,
      source: result.source,
      note: result.note,
      metrics: result.metrics,
    });
    return { source: result.source };
  } catch (err) {
    await ctx.runMutation(internal.analytics.upsertMetrics, {
      userId: target.userId,
      postId: target.postId,
      campaignId: target.campaignId,
      platform: target.platform,
      source: "unavailable",
      note: err instanceof Error ? err.message : String(err),
      metrics: {},
    });
    return { source: "unavailable" as const };
  }
}

/** Refresh metrics for the signed-in user's published posts. */
export const collectAnalytics = action({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { limit },
  ): Promise<{ checked: number; updated: number; unavailable: number }> => {
    const userId = await requireUserId(ctx);
    const targets = await ctx.runMutation(internal.posts.publishedWithIds, {
      userId,
      limit,
    });
    let updated = 0;
    let unavailable = 0;
    for (const t of targets) {
      const account = await ctx.runMutation(internal.accounts.findForUserPlatform, {
        userId: t.userId,
        platform: t.platform,
      });
      if (!account || !isEncryptionConfigured()) continue;
      let credentials: PlatformCredentials;
      try {
        const tokens = openTokens({
          ciphertext: account.ciphertext,
          iv: account.iv,
          authTag: account.authTag,
        });
        credentials = {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          externalId: account.externalId,
          extra: tokens.extra,
        };
      } catch {
        continue;
      }
      const res = await collectForPost(ctx, t, credentials);
      if (res.source === "api") updated++;
      else unavailable++;
    }
    return { checked: targets.length, updated, unavailable };
  },
});

/** Daily cron entry point: refresh metrics across all published posts. */
export const collectAllAnalytics = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { limit },
  ): Promise<{ checked: number; updated: number }> => {
    const targets = await ctx.runMutation(internal.posts.publishedWithIds, { limit });
    let updated = 0;
    for (const t of targets) {
      const account = await ctx.runMutation(internal.accounts.findForUserPlatform, {
        userId: t.userId,
        platform: t.platform,
      });
      if (!account || !isEncryptionConfigured()) continue;
      try {
        const tokens = openTokens({
          ciphertext: account.ciphertext,
          iv: account.iv,
          authTag: account.authTag,
        });
        const res = await collectForPost(
          ctx,
          t,
          {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            externalId: account.externalId,
            extra: tokens.extra,
          },
        );
        if (res.source === "api") updated++;
      } catch {
        // Skip this post and continue with the rest of the batch.
      }
    }
    return { checked: targets.length, updated };
  },
});
