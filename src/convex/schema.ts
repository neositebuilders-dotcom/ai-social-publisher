import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

/* -------------------------------------------------------------------------- */
/*  Shared validators                                                          */
/* -------------------------------------------------------------------------- */

export const platformValidator = v.union(
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("youtube"),
  v.literal("linkedin"),
  v.literal("tiktok"),
  v.literal("x"),
  v.literal("picsart"),
);
export type PlatformId = Infer<typeof platformValidator>;

export const postStatusValidator = v.union(
  v.literal("draft"),
  v.literal("approved"),
  v.literal("scheduled"),
  v.literal("publishing"),
  v.literal("published"),
  v.literal("failed"),
);
export type PostStatus = Infer<typeof postStatusValidator>;

export const contentTypeValidator = v.union(
  v.literal("text"),
  v.literal("image"),
  v.literal("carousel"),
  v.literal("story"),
  v.literal("short_video"),
);
export type ContentType = Infer<typeof contentTypeValidator>;

export const campaignModeValidator = v.union(
  v.literal("approval"),
  v.literal("autopilot"),
);
export type CampaignMode = Infer<typeof campaignModeValidator>;

export const campaignStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("paused"),
);
export type CampaignStatus = Infer<typeof campaignStatusValidator>;

export const jobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("dead"),
);
export type JobStatus = Infer<typeof jobStatusValidator>;

export const accountStatusValidator = v.union(
  v.literal("pending"),
  v.literal("connected"),
  v.literal("needs_reauth"),
  v.literal("disconnected"),
);
export type AccountStatus = Infer<typeof accountStatusValidator>;

export const validationIssueValidator = v.object({
  level: v.union(v.literal("error"), v.literal("warning")),
  code: v.string(),
  message: v.string(),
});
export type ValidationIssue = Infer<typeof validationIssueValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    /* -------------------------------------------------------------------- */
    /*  Connected social accounts                                            */
    /* -------------------------------------------------------------------- */
    platformAccounts: defineTable({
      userId: v.id("users"),
      platform: platformValidator,
      externalId: v.optional(v.string()),
      displayName: v.optional(v.string()),
      handle: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      status: accountStatusValidator,
      scopes: v.optional(v.array(v.string())),
      tokenExpiresAt: v.optional(v.number()),
      connectedAt: v.number(),
      lastError: v.optional(v.string()),
    })
      .index("by_user", ["userId"])
      .index("by_user_platform", ["userId", "platform"]),

    // Encrypted OAuth credentials. Never returned to the client.
    accountTokens: defineTable({
      accountId: v.id("platformAccounts"),
      userId: v.id("users"),
      platform: platformValidator,
      ciphertext: v.string(),
      iv: v.string(),
      authTag: v.string(),
      updatedAt: v.number(),
    }).index("by_account", ["accountId"]),

    // Short-lived CSRF nonces for the OAuth handshake.
    oauthStates: defineTable({
      state: v.string(),
      userId: v.id("users"),
      platform: platformValidator,
      redirectUri: v.optional(v.string()),
      codeVerifier: v.optional(v.string()),
      createdAt: v.number(),
      expiresAt: v.number(),
    }).index("by_state", ["state"]),

    /* -------------------------------------------------------------------- */
    /*  Automations (campaigns)                                              */
    /* -------------------------------------------------------------------- */
    campaigns: defineTable({
      userId: v.id("users"),
      name: v.string(),
      business: v.string(),
      instructions: v.string(),
      platforms: v.array(platformValidator),
      platformInstructions: v.array(
        v.object({ platform: platformValidator, instructions: v.string() }),
      ),
      contentTypes: v.array(contentTypeValidator),
      frequency: v.union(
        v.literal("daily"),
        v.literal("weekdays"),
        v.literal("weekly"),
        v.literal("custom"),
      ),
      postsPerDay: v.number(),
      times: v.array(v.string()), // "HH:MM" local to `timezone`
      weekdays: v.optional(v.array(v.number())), // 0=Sun .. 6=Sat for weekly/custom
      timezone: v.string(),
      mode: campaignModeValidator,
      autoPublish: v.boolean(),
      status: campaignStatusValidator,

      // Brand / content guidance
      brandVoice: v.optional(v.string()),
      audience: v.optional(v.string()),
      topics: v.array(v.string()),
      contentPillars: v.array(v.string()),
      bannedWords: v.array(v.string()),
      hashtagPrefs: v.optional(v.string()),
      ctaPrefs: v.optional(v.string()),

      lastRunAt: v.optional(v.number()),
      nextRunAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_status_next_run", ["status", "nextRunAt"]),

    /* -------------------------------------------------------------------- */
    /*  Posts                                                                */
    /* -------------------------------------------------------------------- */
    posts: defineTable({
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
      publishedAt: v.optional(v.number()),
      approvedAt: v.optional(v.number()),

      platformPostId: v.optional(v.string()),
      platformPostUrl: v.optional(v.string()),
      error: v.optional(v.string()),

      aiProvider: v.optional(v.string()),
      aiModel: v.optional(v.string()),
      validation: v.array(validationIssueValidator),
      attemptCount: v.number(),

      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_status", ["userId", "status"])
      .index("by_campaign", ["campaignId"])
      .index("by_status_scheduled", ["status", "scheduledFor"]),

    /* -------------------------------------------------------------------- */
    /*  Publish queue                                                        */
    /* -------------------------------------------------------------------- */
    publishJobs: defineTable({
      userId: v.id("users"),
      postId: v.id("posts"),
      campaignId: v.optional(v.id("campaigns")),
      platform: platformValidator,
      runAt: v.number(),
      status: jobStatusValidator,
      attempts: v.number(),
      maxAttempts: v.number(),
      lastError: v.optional(v.string()),
      idempotencyKey: v.string(),
      lockedAt: v.optional(v.number()),
      finishedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_status_run_at", ["status", "runAt"])
      .index("by_post", ["postId"])
      .index("by_idempotency", ["idempotencyKey"]),

    jobLogs: defineTable({
      userId: v.id("users"),
      jobId: v.optional(v.id("publishJobs")),
      postId: v.optional(v.id("posts")),
      level: v.union(
        v.literal("info"),
        v.literal("warn"),
        v.literal("error"),
      ),
      message: v.string(),
      meta: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_job", ["jobId"])
      .index("by_post", ["postId"])
      .index("by_user", ["userId"]),

    /* -------------------------------------------------------------------- */
    /*  Content intelligence                                                 */
    /* -------------------------------------------------------------------- */
    contentMemory: defineTable({
      userId: v.id("users"),
      campaignId: v.id("campaigns"),
      platform: v.optional(platformValidator),
      topicKey: v.string(),
      title: v.string(),
      summary: v.string(),
      createdAt: v.number(),
    })
      .index("by_campaign", ["campaignId"])
      .index("by_campaign_platform", ["campaignId", "platform"]),

    /* -------------------------------------------------------------------- */
    /*  Analytics                                                            */
    /* -------------------------------------------------------------------- */
    analytics: defineTable({
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
      collectedAt: v.number(),
    })
      .index("by_post", ["postId"])
      .index("by_user", ["userId"]),

    /* -------------------------------------------------------------------- */
    /*  Media library                                                        */
    /* -------------------------------------------------------------------- */
    mediaAssets: defineTable({
      userId: v.id("users"),
      name: v.string(),
      kind: contentTypeValidator,
      url: v.string(),
      mimeType: v.optional(v.string()),
      size: v.optional(v.number()),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      durationSec: v.optional(v.number()),
      source: v.union(
        v.literal("upload"),
        v.literal("url"),
        v.literal("generated"),
      ),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    /* -------------------------------------------------------------------- */
    /*  Settings + notifications                                             */
    /* -------------------------------------------------------------------- */
    settings: defineTable({
      userId: v.id("users"),
      timezone: v.string(),
      defaultMode: campaignModeValidator,
      brandVoice: v.optional(v.string()),
      audience: v.optional(v.string()),
      hashtagPrefs: v.optional(v.string()),
      ctaPrefs: v.optional(v.string()),
      bannedWords: v.array(v.string()),
      notifyOnFailure: v.boolean(),
      notifyOnPublish: v.boolean(),
      aiProvider: v.optional(v.string()),
      aiModel: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    notifications: defineTable({
      userId: v.id("users"),
      title: v.string(),
      body: v.optional(v.string()),
      kind: v.union(
        v.literal("info"),
        v.literal("success"),
        v.literal("warning"),
        v.literal("error"),
      ),
      read: v.boolean(),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    auditLogs: defineTable({
      userId: v.optional(v.id("users")),
      action: v.string(),
      detail: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
