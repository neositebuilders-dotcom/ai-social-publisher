import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/ctx";
import { campaignModeValidator } from "./schema";

const DEFAULTS = {
  timezone: "UTC",
  defaultMode: "approval" as const,
  notifyOnFailure: true,
  notifyOnPublish: true,
};

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (settings) return settings;
    return {
      _id: null,
      userId,
      ...DEFAULTS,
      brandVoice: undefined,
      audience: undefined,
      hashtagPrefs: undefined,
      ctaPrefs: undefined,
      bannedWords: [] as string[],
      aiProvider: undefined,
      aiModel: undefined,
      createdAt: 0,
      updatedAt: 0,
    };
  },
});

/**
 * Runtime AI configuration, resolved the same way the generation action
 * resolves it, so the UI can show exactly what will run. Never exposes keys.
 */
export const aiStatus = query({
  args: {},
  handler: async () => {
    const baseUrl = process.env.AI_BASE_URL?.trim();
    const hasKey = !!(process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY);
    const model = process.env.AI_MODEL?.trim() || "gpt-4o-mini";
    if (baseUrl || hasKey) {
      return {
        provider: "openai-compatible",
        model,
        endpoint: baseUrl || "https://api.openai.com/v1",
        costsMoney: true,
        note: "Calls an OpenAI-compatible endpoint. Usage is billed by that provider.",
      };
    }
    return {
      provider: "local",
      model: "local-heuristic-v1",
      endpoint: "in-process",
      costsMoney: false,
      note: "Built-in local generator. Runs at $0 with no API key.",
    };
  },
});

export const upsert = mutation({
  args: {
    timezone: v.optional(v.string()),
    defaultMode: v.optional(campaignModeValidator),
    brandVoice: v.optional(v.string()),
    audience: v.optional(v.string()),
    hashtagPrefs: v.optional(v.string()),
    ctaPrefs: v.optional(v.string()),
    bannedWords: v.optional(v.array(v.string())),
    notifyOnFailure: v.optional(v.boolean()),
    notifyOnPublish: v.optional(v.boolean()),
    aiProvider: v.optional(v.string()),
    aiModel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("settings", {
      userId,
      ...DEFAULTS,
      ...args,
      bannedWords: args.bannedWords ?? [],
      createdAt: now,
      updatedAt: now,
    });
  },
});
