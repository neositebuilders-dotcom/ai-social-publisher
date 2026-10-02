/**
 * Queue helpers. These are plain functions (not Convex functions) so they can
 * be called from inside any mutation that needs to enqueue work.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { PlatformId } from "./platforms";

export interface EnqueueArgs {
  userId: Id<"users">;
  postId: Id<"posts">;
  campaignId?: Id<"campaigns">;
  platform: PlatformId;
  runAt: number;
  /** Stable key so a post can never be queued twice for the same slot. */
  idempotencyKey: string;
  maxAttempts?: number;
}

export async function enqueuePublishJob(
  ctx: MutationCtx,
  args: EnqueueArgs,
): Promise<Id<"publishJobs"> | null> {
  const existing = await ctx.db
    .query("publishJobs")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .first();
  if (existing) return existing._id;

  const now = Date.now();
  return await ctx.db.insert("publishJobs", {
    userId: args.userId,
    postId: args.postId,
    campaignId: args.campaignId,
    platform: args.platform,
    runAt: args.runAt,
    status: "queued",
    attempts: 0,
    maxAttempts: args.maxAttempts ?? 5,
    idempotencyKey: args.idempotencyKey,
    createdAt: now,
    updatedAt: now,
  });
}

export async function logEvent(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    jobId?: Id<"publishJobs">;
    postId?: Id<"posts">;
    level: "info" | "warn" | "error";
    message: string;
    meta?: string;
  },
) {
  await ctx.db.insert("jobLogs", {
    userId: args.userId,
    jobId: args.jobId,
    postId: args.postId,
    level: args.level,
    message: args.message,
    meta: args.meta,
    createdAt: Date.now(),
  });
}

export async function notify(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    title: string;
    body?: string;
    kind: "info" | "success" | "warning" | "error";
  },
) {
  await ctx.db.insert("notifications", {
    userId: args.userId,
    title: args.title,
    body: args.body,
    kind: args.kind,
    read: false,
    createdAt: Date.now(),
  });
}
