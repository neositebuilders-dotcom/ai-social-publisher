"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/ctx";
import {
  resolveProvider,
  type CampaignBrief,
  type GenerateRequest,
} from "./lib/ai";
import { getAdapter, type AdapterPost, type ContentType } from "./lib/platforms";
import { upcomingRuns, type Frequency } from "./lib/schedule";

function seedFrom(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickContentType(
  requested: ContentType[],
  capabilities: ContentType[],
): ContentType {
  if (capabilities.length === 0) return requested[0] ?? "text";
  const overlap = requested.filter((c) => capabilities.includes(c));
  if (overlap.length) return overlap[0];
  return capabilities[0];
}

interface GenerationArgs {
  campaignId: Id<"campaigns">;
  userId: Id<"users">;
  perPlatform?: number;
  provider?: string;
  model?: string;
}

async function runGeneration(ctx: ActionCtx, args: GenerationArgs) {
  const campaign = await ctx.runMutation(internal.campaigns.loadForAction, {
    campaignId: args.campaignId,
  });
  if (!campaign || campaign.userId !== args.userId) {
    throw new Error("Automation not found");
  }

  const history = await ctx.runMutation(internal.posts.historyForCampaign, {
    campaignId: args.campaignId,
    limit: 40,
  });

  const now = Date.now();
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const spec = {
    frequency: campaign.frequency as Frequency,
    times: campaign.times,
    weekdays: campaign.weekdays,
    postsPerDay: campaign.postsPerDay,
    timezone: campaign.timezone,
  };
  const runs = upcomingRuns(spec, now, 10);

  const ai = resolveProvider({ provider: args.provider, model: args.model });
  const brief: CampaignBrief = {
    name: campaign.name,
    business: campaign.business,
    instructions: campaign.instructions,
    brandVoice: campaign.brandVoice,
    audience: campaign.audience,
    topics: campaign.topics,
    contentPillars: campaign.contentPillars,
    bannedWords: campaign.bannedWords,
    hashtagPrefs: campaign.hashtagPrefs,
    ctaPrefs: campaign.ctaPrefs,
    platformInstructions: campaign.platformInstructions,
  };

  const per = Math.max(1, Math.min(args.perPlatform ?? campaign.postsPerDay, 4));
  const autopilot = campaign.mode === "autopilot" && campaign.autoPublish;

  let slotIndex = 0;
  let createdCount = 0;
  let scheduledCount = 0;
  let blockedCount = 0;
  const runningHistory = [...history];

  for (const platform of campaign.platforms) {
    const adapter = getAdapter(platform);
    if (!adapter) continue;

    const contentType = pickContentType(campaign.contentTypes, adapter.capabilities);
    const publishable = adapter.capabilities.length > 0;

    for (let i = 0; i < per; i++) {
      const req: GenerateRequest = {
        brief,
        platform,
        contentType,
        history: runningHistory,
        index: i,
        seed: seedFrom(`${args.campaignId}:${dayKey}:${platform}`) + slotIndex,
      };

      let generated;
      try {
        generated = await ai.generate(req);
      } catch (err) {
        await ctx.runMutation(internal.jobs.record, {
          userId: args.userId,
          level: "error",
          message: `AI generation failed for ${platform}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
        continue;
      }

      const adapterPost: AdapterPost = {
        caption: generated.caption,
        title: generated.title,
        description: generated.description,
        hashtags: generated.hashtags,
        cta: generated.cta,
        mediaType: generated.mediaType,
        mediaUrl: generated.mediaUrl,
      };

      const issues = adapter.validate(adapterPost, campaign.bannedWords);
      if (!publishable) {
        issues.push({
          level: "warning",
          code: "no_publishing_capability",
          message: `${adapter.label} cannot publish to social networks; this draft is for media preparation only.`,
        });
      }
      const hasError = issues.some((x) => x.level === "error");
      const canSchedule = autopilot && publishable && !hasError;
      const scheduledFor = canSchedule ? runs[slotIndex % runs.length] : undefined;

      await ctx.runMutation(internal.posts.insertGenerated, {
        userId: args.userId,
        campaignId: args.campaignId,
        platform,
        status: canSchedule ? "scheduled" : "draft",
        title: generated.title,
        caption: generated.caption,
        description: generated.description,
        hashtags: generated.hashtags,
        cta: generated.cta,
        contentPillar: generated.pillar,
        contentTypes: campaign.contentTypes,
        mediaType: generated.mediaType,
        mediaUrl: generated.mediaUrl,
        scheduledFor,
        aiProvider: generated.provider,
        aiModel: generated.model,
        validation: issues,
      });

      // Record the topic immediately so the next run does not repeat it, even
      // when posts are still waiting on human approval.
      await ctx.runMutation(internal.posts.remember, {
        userId: args.userId,
        campaignId: args.campaignId,
        platform,
        topicKey: generated.topicKey,
        title: generated.title,
        summary: generated.caption.slice(0, 240),
      });
      runningHistory.push({
        topicKey: generated.topicKey,
        title: generated.title,
        summary: generated.caption.slice(0, 240),
      });

      createdCount++;
      if (canSchedule) scheduledCount++;
      else if (autopilot && hasError) blockedCount++;
      slotIndex++;
    }
  }

  await ctx.runMutation(internal.jobs.record, {
    userId: args.userId,
    level: "info",
    message: `Generated ${createdCount} post(s) for "${campaign.name}" using ${ai.name}/${ai.model}.`,
    meta: JSON.stringify({ scheduled: scheduledCount, blocked: blockedCount }),
  });

  if (blockedCount > 0) {
    await ctx.runMutation(internal.notifications.push, {
      userId: args.userId,
      title: `${blockedCount} post(s) need attention`,
      body: "Autopilot generated content that failed platform validation. Review the drafts.",
      kind: "warning",
    });
  }

  return {
    created: createdCount,
    scheduled: scheduledCount,
    blocked: blockedCount,
    provider: ai.name,
    model: ai.model,
  };
}

/** Generate content for one automation, from the dashboard. */
export const generateForCampaign = action({
  args: {
    campaignId: v.id("campaigns"),
    perPlatform: v.optional(v.number()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await runGeneration(ctx, { ...args, userId });
  },
});

/** Internal variant used by the scheduler (no user session available). */
export const generateInternal = internalAction({
  args: {
    campaignId: v.id("campaigns"),
    userId: v.id("users"),
    perPlatform: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await runGeneration(ctx, args);
  },
});
