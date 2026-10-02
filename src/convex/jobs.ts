import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { enqueuePublishJob, logEvent } from "./lib/jobs";
import { requireUserId } from "./lib/ctx";
import { platformValidator } from "./schema";

const BACKOFF_MS = [0, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

function backoff(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 60 * 60_000;
}

/** Recent queue log entries for the workspace activity feed. */
export const recentLogs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("jobLogs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(limit ?? 50, 200));
  },
});

/**
 * Atomically claim due jobs. Jobs are marked `running` and their attempt count
 * is incremented here, so two concurrent worker ticks can never publish the
 * same post twice.
 */
export const claimDue = internalMutation({
  args: { now: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, { now, limit }) => {
    const due = await ctx.db
      .query("publishJobs")
      .withIndex("by_status_run_at", (q) =>
        q.eq("status", "queued").lte("runAt", now),
      )
      .take(limit ?? 5);

    const claimed = [];
    for (const job of due) {
      const attempts = job.attempts + 1;
      await ctx.db.patch(job._id, {
        status: "running",
        attempts,
        lockedAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(job.postId, {
        status: "publishing",
        attemptCount: attempts,
        updatedAt: now,
      });
      claimed.push({
        jobId: job._id,
        postId: job.postId,
        campaignId: job.campaignId,
        userId: job.userId,
        platform: job.platform,
        attempts,
        maxAttempts: job.maxAttempts,
      });
    }
    return claimed;
  },
});

/** Mark a job finished successfully. */
export const finishSuccess = internalMutation({
  args: { jobId: v.id("publishJobs"), now: v.number() },
  handler: async (ctx, { jobId, now }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;
    await ctx.db.patch(jobId, { status: "done", finishedAt: now, updatedAt: now });
    await logEvent(ctx, {
      userId: job.userId,
      jobId,
      postId: job.postId,
      level: "info",
      message: `Published to ${job.platform}.`,
    });
  },
});

/**
 * Record a failed attempt. Retryable failures are re-queued with exponential
 * backoff; exhausted or non-retryable jobs are marked dead and the post failed.
 */
export const finishFailure = internalMutation({
  args: {
    jobId: v.id("publishJobs"),
    error: v.string(),
    retryable: v.boolean(),
    now: v.number(),
  },
  handler: async (ctx, { jobId, error, retryable, now }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return;
    const exhausted = !retryable || job.attempts >= job.maxAttempts;

    await logEvent(ctx, {
      userId: job.userId,
      jobId,
      postId: job.postId,
      level: exhausted ? "error" : "warn",
      message: exhausted
        ? `Publish failed permanently: ${error}`
        : `Attempt ${job.attempts} failed, will retry: ${error}`,
    });

    if (exhausted) {
      await ctx.db.patch(jobId, {
        status: "dead",
        lastError: error,
        finishedAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(job.postId, {
        status: "failed",
        error,
        updatedAt: now,
      });
      await ctx.db.insert("notifications", {
        userId: job.userId,
        title: "Publish failed",
        body: error.slice(0, 200),
        kind: "error",
        read: false,
        createdAt: now,
      });
      return;
    }

    const runAt = now + backoff(job.attempts);
    await ctx.db.patch(jobId, {
      status: "queued",
      runAt,
      lastError: error,
      lockedAt: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(job.postId, {
      status: "scheduled",
      scheduledFor: runAt,
      error,
      updatedAt: now,
    });
  },
});

/**
 * Recover jobs that were left `running` (e.g. the worker crashed mid-publish).
 * Stale claims are returned to the queue rather than silently lost.
 */
export const requeueStale = internalMutation({
  args: { now: v.number(), staleAfterMs: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, { now, staleAfterMs, limit }) => {
    const cutoff = now - staleAfterMs;
    const running = await ctx.db
      .query("publishJobs")
      .withIndex("by_status_run_at", (q) => q.eq("status", "running"))
      .take(limit ?? 20);
    let requeued = 0;
    for (const job of running) {
      if ((job.lockedAt ?? 0) > cutoff) continue;
      await ctx.db.patch(job._id, {
        status: "queued",
        runAt: now,
        lockedAt: undefined,
        updatedAt: now,
      });
      await ctx.db.patch(job.postId, {
        status: "scheduled",
        scheduledFor: now,
        updatedAt: now,
      });
      requeued++;
    }
    return requeued;
  },
});

/** Claim a single known job (used for user-initiated publishing). */
export const claimOne = internalMutation({
  args: { jobId: v.id("publishJobs"), now: v.number() },
  handler: async (ctx, { jobId, now }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status === "done") return null;
    const attempts = job.attempts + 1;
    await ctx.db.patch(jobId, {
      status: "running",
      attempts,
      lockedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(job.postId, {
      status: "publishing",
      attemptCount: attempts,
      updatedAt: now,
    });
    return {
      jobId,
      postId: job.postId,
      campaignId: job.campaignId,
      userId: job.userId,
      platform: job.platform,
      attempts,
      maxAttempts: job.maxAttempts,
    };
  },
});

/** Queue a post for immediate manual publishing. */
export const enqueueNow = internalMutation({
  args: {
    userId: v.id("users"),
    postId: v.id("posts"),
    campaignId: v.optional(v.id("campaigns")),
    platform: platformValidator,
    runAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await enqueuePublishJob(ctx, {
      userId: args.userId,
      postId: args.postId,
      campaignId: args.campaignId,
      platform: args.platform,
      runAt: args.runAt,
      idempotencyKey: `${args.postId}:manual:${args.runAt}`,
    });
  },
});

/** Write an activity log entry from an action. */
export const record = internalMutation({
  args: {
    userId: v.id("users"),
    postId: v.optional(v.id("posts")),
    jobId: v.optional(v.id("publishJobs")),
    level: v.union(v.literal("info"), v.literal("warn"), v.literal("error")),
    message: v.string(),
    meta: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logEvent(ctx, args);
  },
});

/** Jobs waiting in the queue, for the dashboard. */
export const queuedCount = internalMutation({
  args: {},
  handler: async (ctx) => {
    const queued = await ctx.db
      .query("publishJobs")
      .withIndex("by_status_run_at", (q) => q.eq("status", "queued"))
      .take(500);
    return queued.length;
  },
});
