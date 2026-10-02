import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/ctx";
import { computeNextRun, isValidTimezone } from "./lib/schedule";
import type { Frequency } from "./lib/schedule";
import {
  campaignModeValidator,
  contentTypeValidator,
  platformValidator,
} from "./schema";

const contentTypes = v.array(contentTypeValidator);
const platforms = v.array(platformValidator);

const frequencyValidator = v.union(
  v.literal("daily"),
  v.literal("weekdays"),
  v.literal("weekly"),
  v.literal("custom"),
);

const optionalFields = {
  brandVoice: v.optional(v.string()),
  audience: v.optional(v.string()),
  topics: v.optional(v.array(v.string())),
  contentPillars: v.optional(v.array(v.string())),
  bannedWords: v.optional(v.array(v.string())),
  hashtagPrefs: v.optional(v.string()),
  ctaPrefs: v.optional(v.string()),
  platformInstructions: v.optional(
    v.array(v.object({ platform: platformValidator, instructions: v.string() })),
  ),
  weekdays: v.optional(v.array(v.number())),
};

type ScheduleShape = {
  frequency: Frequency;
  times: string[];
  weekdays?: number[];
  postsPerDay: number;
  timezone: string;
};

function assertSchedule(s: ScheduleShape) {
  if (!isValidTimezone(s.timezone)) {
    throw new Error(`Unknown timezone "${s.timezone}".`);
  }
  if (s.postsPerDay < 1 || s.postsPerDay > 24) {
    throw new Error("Posts per day must be between 1 and 24.");
  }
  for (const t of s.times) {
    if (!/^\d{1,2}:\d{2}$/.test(t.trim())) {
      throw new Error(`Invalid time "${t}". Use HH:MM.`);
    }
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUserId(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return null;
    return campaign;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    business: v.string(),
    instructions: v.string(),
    platforms,
    contentTypes,
    frequency: frequencyValidator,
    postsPerDay: v.number(),
    times: v.array(v.string()),
    timezone: v.string(),
    mode: campaignModeValidator,
    autoPublish: v.boolean(),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("paused")),
    ...optionalFields,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (!args.platforms.length) throw new Error("Select at least one platform.");
    if (!args.contentTypes.length) throw new Error("Select at least one content type.");
    assertSchedule({
      frequency: args.frequency,
      times: args.times,
      weekdays: args.weekdays,
      postsPerDay: args.postsPerDay,
      timezone: args.timezone,
    });

    const now = Date.now();
    const nextRunAt =
      args.status === "active"
        ? computeNextRun(
            {
              frequency: args.frequency,
              times: args.times,
              weekdays: args.weekdays,
              postsPerDay: args.postsPerDay,
              timezone: args.timezone,
            },
            now,
          )
        : undefined;

    return await ctx.db.insert("campaigns", {
      userId,
      name: args.name.trim() || "Untitled automation",
      business: args.business.trim(),
      instructions: args.instructions.trim(),
      platforms: args.platforms,
      platformInstructions: args.platformInstructions ?? [],
      contentTypes: args.contentTypes,
      frequency: args.frequency,
      postsPerDay: args.postsPerDay,
      times: args.times,
      weekdays: args.weekdays,
      timezone: args.timezone,
      mode: args.mode,
      autoPublish: args.autoPublish,
      status: args.status,
      brandVoice: args.brandVoice,
      audience: args.audience,
      topics: args.topics ?? [],
      contentPillars: args.contentPillars ?? [],
      bannedWords: args.bannedWords ?? [],
      hashtagPrefs: args.hashtagPrefs,
      ctaPrefs: args.ctaPrefs,
      nextRunAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    campaignId: v.id("campaigns"),
    name: v.optional(v.string()),
    business: v.optional(v.string()),
    instructions: v.optional(v.string()),
    platforms: v.optional(platforms),
    contentTypes: v.optional(contentTypes),
    frequency: v.optional(frequencyValidator),
    postsPerDay: v.optional(v.number()),
    times: v.optional(v.array(v.string())),
    timezone: v.optional(v.string()),
    mode: v.optional(campaignModeValidator),
    autoPublish: v.optional(v.boolean()),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("active"), v.literal("paused")),
    ),
    ...optionalFields,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("Automation not found");

    const merged: ScheduleShape = {
      frequency: (args.frequency ?? campaign.frequency) as Frequency,
      times: args.times ?? campaign.times,
      weekdays: args.weekdays ?? campaign.weekdays,
      postsPerDay: args.postsPerDay ?? campaign.postsPerDay,
      timezone: args.timezone ?? campaign.timezone,
    };
    assertSchedule(merged);

    const status = args.status ?? campaign.status;
    const nextRunAt =
      status === "active" ? computeNextRun(merged, Date.now()) : undefined;

    const { campaignId, ...patch } = args;
    await ctx.db.patch(campaignId, {
      ...patch,
      weekdays: merged.weekdays,
      postsPerDay: merged.postsPerDay,
      times: merged.times,
      frequency: merged.frequency,
      timezone: merged.timezone,
      status,
      nextRunAt,
      updatedAt: Date.now(),
    });
    return campaignId;
  },
});

export const setStatus = mutation({
  args: {
    campaignId: v.id("campaigns"),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("paused")),
  },
  handler: async (ctx, { campaignId, status }) => {
    const userId = await requireUserId(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("Automation not found");
    const nextRunAt =
      status === "active"
        ? computeNextRun(
            {
              frequency: campaign.frequency as Frequency,
              times: campaign.times,
              weekdays: campaign.weekdays,
              postsPerDay: campaign.postsPerDay,
              timezone: campaign.timezone,
            },
            Date.now(),
          )
        : undefined;
    await ctx.db.patch(campaignId, { status, nextRunAt, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const userId = await requireUserId(ctx);
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) throw new Error("Automation not found");
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    for (const post of posts) {
      const jobs = await ctx.db
        .query("publishJobs")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .collect();
      for (const job of jobs) await ctx.db.delete(job._id);
      await ctx.db.delete(post._id);
    }
    const memory = await ctx.db
      .query("contentMemory")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    for (const m of memory) await ctx.db.delete(m._id);
    await ctx.db.delete(campaignId);
  },
});

/* ----------------------------- scheduler internals ------------------------ */

/** Active automations whose next run time has arrived. */
export const due = internalMutation({
  args: { now: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, { now, limit }) => {
    const rows = await ctx.db
      .query("campaigns")
      .withIndex("by_status_next_run", (q) =>
        q.eq("status", "active").lte("nextRunAt", now),
      )
      .take(limit ?? 10);
    return rows.map((c) => ({ ...c, userId: c.userId }));
  },
});

/** Advance an automation's next run time after it has fired. */
export const markRun = internalMutation({
  args: { campaignId: v.id("campaigns"), ranAt: v.number() },
  handler: async (ctx, { campaignId, ranAt }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) return;
    const nextRunAt = computeNextRun(
      {
        frequency: campaign.frequency as Frequency,
        times: campaign.times,
        weekdays: campaign.weekdays,
        postsPerDay: campaign.postsPerDay,
        timezone: campaign.timezone,
      },
      ranAt,
    );
    await ctx.db.patch(campaignId, {
      lastRunAt: ranAt,
      nextRunAt,
      updatedAt: ranAt,
    });
  },
});

/** Internal read for actions. */
export const loadForAction = internalMutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    return await ctx.db.get(campaignId);
  },
});

export const listActiveInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("campaigns")
      .withIndex("by_status_next_run", (q) => q.eq("status", "active"))
      .collect();
  },
});
