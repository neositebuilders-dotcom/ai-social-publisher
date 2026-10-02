/**
 * Modular social platform adapter layer.
 *
 * The core application never talks to a social network directly — it talks to
 * this registry. Each adapter declares its capabilities, its hard platform
 * limits and — critically — the real-world gating (app review, audits, quotas,
 * paid tiers) that stands between "the API documents this" and "this app can
 * actually call it today".
 *
 * Where an official API genuinely cannot perform an action, the adapter says so
 * explicitly (`status: "unavailable"`) and `publish()` returns a structured
 * refusal instead of pretending. No scraping, no browser automation, no
 * password flows anywhere in this file.
 */

export type PlatformId =
  | "instagram"
  | "facebook"
  | "youtube"
  | "linkedin"
  | "tiktok"
  | "x"
  | "picsart";

export type ContentType =
  | "text"
  | "image"
  | "carousel"
  | "story"
  | "short_video";

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
}

export interface AdapterPost {
  caption: string;
  title?: string;
  description?: string;
  hashtags: string[];
  cta?: string;
  mediaType?: ContentType;
  mediaUrl?: string;
}

export interface PlatformCredentials {
  accessToken?: string;
  refreshToken?: string;
  /** Platform-side identifier: page id, IG user id, LinkedIn sub, channel id… */
  externalId?: string;
  /** Extra identifiers the platform needs (page id, author urn, …). */
  extra?: Record<string, string>;
}

export interface PublishResult {
  ok: boolean;
  platformPostId?: string;
  url?: string;
  /** Machine-readable reason when ok === false. */
  code?:
    | "not_connected"
    | "not_configured"
    | "media_required"
    | "requires_review"
    | "unavailable"
    | "rate_limited"
    | "auth_expired"
    | "invalid_content"
    | "platform_error";
  error?: string;
  /** Whether a retry might succeed later. */
  retryable?: boolean;
}

export interface MetricsResult {
  source: "api" | "unavailable";
  note?: string;
  metrics: {
    impressions?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    clicks?: number;
    views?: number;
  };
}

export type RequirementStatus =
  | "available"
  | "approval_required"
  | "quota"
  | "paid"
  | "unavailable";

export interface Requirement {
  label: string;
  status: RequirementStatus;
  note: string;
}

export interface PlatformAdapter {
  id: PlatformId;
  label: string;
  tagline: string;
  /** Tailwind-friendly brand-ish accent used in the UI. */
  accent: string;
  docsUrl: string;
  /** Content types this adapter can genuinely publish. */
  capabilities: ContentType[];
  limits: {
    captionMax: number;
    titleMax?: number;
    hashtagMax: number;
    requiresMedia?: ContentType[];
    maxVideoSeconds?: number;
  };
  requirements: Requirement[];
  /** Env vars the server needs before the connect flow can run. */
  setupEnv: string[];
  defaultInstructions: string;
  validate: (post: AdapterPost, bannedWords?: string[]) => ValidationIssue[];
  publish: (
    creds: PlatformCredentials,
    post: AdapterPost,
  ) => Promise<PublishResult>;
  fetchMetrics?: (
    creds: PlatformCredentials,
    platformPostId: string,
  ) => Promise<MetricsResult | null>;
}

/* -------------------------------------------------------------------------- */
/*  HTTP helper                                                               */
/* -------------------------------------------------------------------------- */

async function httpJson(
  url: string,
  init: RequestInit,
  timeoutMs = 20000,
): Promise<{ status: number; headers: Headers; body: unknown; raw: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const raw = await res.text();
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    return { status: res.status, headers: res.headers, body, raw };
  } finally {
    clearTimeout(timer);
  }
}

function errMessage(body: unknown, raw: string): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error;
    if (b.error && typeof b.error === "object") {
      const nested = b.error as Record<string, unknown>;
      const parts = [nested.message, nested.status, nested.code]
        .filter(Boolean)
        .join(" / ");
      if (parts) return parts;
    }
    if (typeof b.message === "string") return b.message;
  }
  return raw.slice(0, 280) || "Unknown platform error";
}

function statusToCode(status: number): PublishResult["code"] {
  if (status === 401 || status === 403) return "auth_expired";
  if (status === 429) return "rate_limited";
  return "platform_error";
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/* -------------------------------------------------------------------------- */
/*  Shared validators                                                         */
/* -------------------------------------------------------------------------- */

function baseValidation(
  post: AdapterPost,
  adapter: PlatformAdapter,
  bannedWords: string[] = [],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const caption = post.caption ?? "";

  if (!caption.trim()) {
    issues.push({
      level: "error",
      code: "empty_caption",
      message: "Caption is empty.",
    });
  }
  if (caption.length > adapter.limits.captionMax) {
    issues.push({
      level: "error",
      code: "caption_too_long",
      message: `Caption is ${caption.length} chars; ${adapter.label} allows ${adapter.limits.captionMax}.`,
    });
  }
  if (
    adapter.limits.titleMax &&
    post.title &&
    post.title.length > adapter.limits.titleMax
  ) {
    issues.push({
      level: "error",
      code: "title_too_long",
      message: `Title is ${post.title.length} chars; ${adapter.label} allows ${adapter.limits.titleMax}.`,
    });
  }
  if (post.hashtags.length > adapter.limits.hashtagMax) {
    issues.push({
      level: "error",
      code: "too_many_hashtags",
      message: `${post.hashtags.length} hashtags; ${adapter.label} allows ${adapter.limits.hashtagMax}.`,
    });
  }
  const haystack = `${caption} ${post.title ?? ""} ${post.hashtags.join(" ")}`.toLowerCase();
  for (const word of bannedWords) {
    const w = word.trim().toLowerCase();
    if (w && haystack.includes(w)) {
      issues.push({
        level: "warning",
        code: "banned_word",
        message: `Contains banned term "${word}".`,
      });
    }
  }
  if (
    adapter.limits.requiresMedia?.length &&
    (!post.mediaUrl ||
      !post.mediaType ||
      !adapter.limits.requiresMedia.includes(post.mediaType))
  ) {
    issues.push({
      level: "error",
      code: "media_required",
      message: `${adapter.label} requires ${adapter.limits.requiresMedia.join(" / ")} media for this post type.`,
    });
  }
  return issues;
}

/* -------------------------------------------------------------------------- */
/*  Instagram (Graph API)                                                     */
/* -------------------------------------------------------------------------- */

const instagram: PlatformAdapter = {
  id: "instagram",
  label: "Instagram",
  tagline: "Visual feed + Reels",
  accent: "#E1306C",
  docsUrl: "https://developers.facebook.com/docs/instagram-platform",
  capabilities: ["image", "carousel", "story", "short_video"],
  limits: {
    captionMax: 2200,
    hashtagMax: 30,
    requiresMedia: ["image", "carousel", "story", "short_video"],
    maxVideoSeconds: 900,
  },
  requirements: [
    {
      label: "Instagram Professional account linked to a Facebook Page",
      status: "approval_required",
      note: "Publishing needs a Business/Creator IG account. Personal accounts cannot use the Content Publishing API.",
    },
    {
      label: "`instagram_content_publish` permission",
      status: "approval_required",
      note: "Works immediately for admins/testers of the Meta app; public use requires App Review.",
    },
  ],
  setupEnv: [
    "META_APP_ID",
    "META_APP_SECRET",
    "META_REDIRECT_URI",
    "TOKEN_ENCRYPTION_KEY",
  ],
  defaultInstructions:
    "Short, visual-first caption. Lead with a hook line, then one benefit, then a CTA. 8–15 niche hashtags.",
  validate: (post, banned) =>
    baseValidation(post, instagram, banned),
  publish: async (creds, post) => {
    if (!creds.accessToken || !creds.externalId) {
      return {
        ok: false,
        code: "not_connected",
        error: "Instagram account is not connected.",
      };
    }
    if (!post.mediaUrl) {
      return {
        ok: false,
        code: "media_required",
        error: "Instagram requires a publicly reachable image or video URL.",
      };
    }
    const base = "https://graph.facebook.com/v21.0";
    const caption = [post.caption, post.hashtags.join(" ")]
      .filter(Boolean)
      .join("\n\n");

    const isVideo = post.mediaType === "short_video";
    const createParams = new URLSearchParams({
      access_token: creds.accessToken,
      caption,
    });
    if (isVideo) {
      createParams.set("media_type", post.mediaType === "story" ? "STORIES" : "REELS");
      createParams.set("video_url", post.mediaUrl);
    } else {
      if (post.mediaType === "story") createParams.set("media_type", "STORIES");
      createParams.set("image_url", post.mediaUrl);
    }

    const created = await httpJson(`${base}/${creds.externalId}/media`, {
      method: "POST",
      body: createParams,
    });
    if (created.status >= 300) {
      return {
        ok: false,
        code: statusToCode(created.status),
        error: errMessage(created.body, created.raw),
        retryable: isRetryable(created.status),
      };
    }
    const creationId = (created.body as { id?: string } | null)?.id;
    if (!creationId) {
      return { ok: false, code: "platform_error", error: "No creation id returned." };
    }

    const published = await httpJson(`${base}/${creds.externalId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: creds.accessToken,
        creation_id: creationId,
      }),
    });
    if (published.status >= 300) {
      return {
        ok: false,
        code: statusToCode(published.status),
        error: errMessage(published.body, published.raw),
        retryable: isRetryable(published.status),
      };
    }
    const id = (published.body as { id?: string } | null)?.id;
    return {
      ok: true,
      platformPostId: id,
      url: id ? `https://www.instagram.com/p/${id}` : undefined,
    };
  },
  fetchMetrics: async (creds, platformPostId) => {
    if (!creds.accessToken) return null;
    const metrics =
      "impressions,reach,likes,comments,shares,saved";
    const res = await httpJson(
      `https://graph.facebook.com/v21.0/${platformPostId}/insights?metric=${metrics}&access_token=${creds.accessToken}`,
      { method: "GET" },
    );
    if (res.status >= 300) {
      return {
        source: "unavailable",
        note: errMessage(res.body, res.raw),
        metrics: {},
      };
    }
    const out: MetricsResult["metrics"] = {};
    const data = (res.body as { data?: Array<{ name: string; values: Array<{ value: number }> }> })
      ?.data ?? [];
    for (const row of data) {
      const value = row.values?.[0]?.value;
      if (typeof value !== "number") continue;
      if (row.name === "impressions") out.impressions = value;
      if (row.name === "reach") out.reach = value;
      if (row.name === "likes") out.likes = value;
      if (row.name === "comments") out.comments = value;
      if (row.name === "shares") out.shares = value;
    }
    return { source: "api", metrics: out };
  },
};

/* -------------------------------------------------------------------------- */
/*  Facebook Pages                                                            */
/* -------------------------------------------------------------------------- */

const facebook: PlatformAdapter = {
  id: "facebook",
  label: "Facebook",
  tagline: "Pages feed + links",
  accent: "#1877F2",
  docsUrl: "https://developers.facebook.com/docs/pages-api",
  capabilities: ["text", "image", "carousel", "short_video"],
  limits: { captionMax: 63206, hashtagMax: 30 },
  requirements: [
    {
      label: "Facebook Page + `pages_manage_posts`",
      status: "approval_required",
      note: "Admins/testers of the Meta app can publish immediately; public use requires App Review.",
    },
    {
      label: "Page access token",
      status: "available",
      note: "Issued by the OAuth exchange for the selected Page. Free.",
    },
  ],
  setupEnv: [
    "META_APP_ID",
    "META_APP_SECRET",
    "META_REDIRECT_URI",
    "TOKEN_ENCRYPTION_KEY",
  ],
  defaultInstructions:
    "Conversational, community-oriented. Ask a question and invite replies. 3–6 hashtags maximum.",
  validate: (post, banned) => baseValidation(post, facebook, banned),
  publish: async (creds, post) => {
    if (!creds.accessToken || !creds.externalId) {
      return {
        ok: false,
        code: "not_connected",
        error: "Facebook Page is not connected.",
      };
    }
    const base = "https://graph.facebook.com/v21.0";
    const message = [post.caption, post.hashtags.join(" ")]
      .filter(Boolean)
      .join("\n\n");

    if (post.mediaUrl && post.mediaType !== "text") {
      const res = await httpJson(`${base}/${creds.externalId}/photos`, {
        method: "POST",
        body: new URLSearchParams({
          access_token: creds.accessToken,
          url: post.mediaUrl,
          caption: message,
        }),
      });
      if (res.status >= 300) {
        return {
          ok: false,
          code: statusToCode(res.status),
          error: errMessage(res.body, res.raw),
          retryable: isRetryable(res.status),
        };
      }
      const id = (res.body as { id?: string; post_id?: string } | null);
      const postId = id?.post_id ?? id?.id;
      return {
        ok: true,
        platformPostId: postId,
        url: id?.id ? `https://facebook.com/${id.id}` : undefined,
      };
    }

    const res = await httpJson(`${base}/${creds.externalId}/feed`, {
      method: "POST",
      body: new URLSearchParams({
        access_token: creds.accessToken,
        message,
      }),
    });
    if (res.status >= 300) {
      return {
        ok: false,
        code: statusToCode(res.status),
        error: errMessage(res.body, res.raw),
        retryable: isRetryable(res.status),
      };
    }
    const id = (res.body as { id?: string } | null)?.id;
    return {
      ok: true,
      platformPostId: id,
      url: id ? `https://facebook.com/${id}` : undefined,
    };
  },
  fetchMetrics: async (creds, platformPostId) => {
    if (!creds.accessToken) return null;
    const res = await httpJson(
      `https://graph.facebook.com/v21.0/${platformPostId}/insights?metric=post_impressions,post_impressions_unique,post_reactions_by_type_total,post_clicks&access_token=${creds.accessToken}`,
      { method: "GET" },
    );
    if (res.status >= 300) {
      return {
        source: "unavailable",
        note: errMessage(res.body, res.raw),
        metrics: {},
      };
    }
    const out: MetricsResult["metrics"] = {};
    type Row = { name: string; values: Array<{ value: unknown }> };
    const data = (res.body as { data?: Row[] })?.data ?? [];
    for (const row of data) {
      const value = row.values?.[0]?.value;
      if (row.name === "post_impressions" && typeof value === "number")
        out.impressions = value;
      if (row.name === "post_impressions_unique" && typeof value === "number")
        out.reach = value;
      if (row.name === "post_clicks" && typeof value === "number")
        out.clicks = value;
      if (row.name === "post_reactions_by_type_total" && value && typeof value === "object") {
        out.likes = Object.values(value as Record<string, number>).reduce(
          (a, b) => a + (typeof b === "number" ? b : 0),
          0,
        );
      }
    }
    return { source: "api", metrics: out };
  },
};

/* -------------------------------------------------------------------------- */
/*  YouTube                                                                   */
/* -------------------------------------------------------------------------- */

const youtube: PlatformAdapter = {
  id: "youtube",
  label: "YouTube",
  tagline: "Shorts + long-form video",
  accent: "#FF0000",
  docsUrl: "https://developers.google.com/youtube/v3/docs/videos/insert",
  capabilities: ["short_video"],
  limits: {
    captionMax: 5000,
    titleMax: 100,
    hashtagMax: 15,
    requiresMedia: ["short_video"],
    maxVideoSeconds: 60,
  },
  requirements: [
    {
      label: "OAuth client verified for the `youtube.upload` scope",
      status: "approval_required",
      note: "Google requires OAuth app verification before non-test users can grant upload access.",
    },
    {
      label: "YouTube Data API quota",
      status: "quota",
      note: "Free default quota is 10,000 units/day; an upload costs ~1,600 units, i.e. ~6 uploads/day. The core app supports 1 video per publish job.",
    },
  ],
  setupEnv: [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "TOKEN_ENCRYPTION_KEY",
  ],
  defaultInstructions:
    "Punchy title under 70 chars, keyword-rich first line, then 2–3 sentence description. 3–5 hashtags.",
  validate: (post, banned) => baseValidation(post, youtube, banned),
  publish: async (creds, post) => {
    if (!creds.accessToken) {
      return { ok: false, code: "not_connected", error: "YouTube is not connected." };
    }
    if (!post.mediaUrl) {
      return {
        ok: false,
        code: "media_required",
        error: "YouTube publishing needs a video URL. Generate or upload a video first.",
      };
    }
    const metadata = {
      snippet: {
        title: (post.title || post.caption).slice(0, 100),
        description: [post.caption, post.description, post.hashtags.join(" ")]
          .filter(Boolean)
          .join("\n\n"),
        categoryId: "22",
      },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    };

    // 1. Open a resumable session.
    const init = await httpJson(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": "video/*",
        },
        body: JSON.stringify(metadata),
      },
    );
    if (init.status >= 300) {
      return {
        ok: false,
        code: statusToCode(init.status),
        error: errMessage(init.body, init.raw),
        retryable: isRetryable(init.status),
      };
    }
    const location = init.headers.get("location");
    if (!location) {
      return { ok: false, code: "platform_error", error: "No upload session returned." };
    }

    // 2. Stream the media bytes to the session.
    const mediaRes = await fetch(post.mediaUrl);
    if (!mediaRes.ok) {
      return {
        ok: false,
        code: "platform_error",
        error: `Could not fetch media (${mediaRes.status}).`,
        retryable: true,
      };
    }
    const bytes = new Uint8Array(await mediaRes.arrayBuffer());
    const upload = await httpJson(
      location,
      {
        method: "PUT",
        headers: {
          "Content-Type": "video/*",
          "Content-Length": String(bytes.byteLength),
        },
        body: bytes,
      },
      120000,
    );
    if (upload.status >= 300) {
      return {
        ok: false,
        code: statusToCode(upload.status),
        error: errMessage(upload.body, upload.raw),
        retryable: isRetryable(upload.status),
      };
    }
    const id = (upload.body as { id?: string } | null)?.id;
    return {
      ok: true,
      platformPostId: id,
      url: id ? `https://youtube.com/watch?v=${id}` : undefined,
    };
  },
  fetchMetrics: async (creds, platformPostId) => {
    if (!creds.accessToken) return null;
    const res = await httpJson(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${platformPostId}`,
      { method: "GET", headers: { Authorization: `Bearer ${creds.accessToken}` } },
    );
    if (res.status >= 300) {
      return { source: "unavailable", note: errMessage(res.body, res.raw), metrics: {} };
    }
    const stats = (res.body as {
      items?: Array<{
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      }>;
    })?.items?.[0]?.statistics;
    return {
      source: stats ? "api" : "unavailable",
      metrics: stats
        ? {
            views: Number(stats.viewCount ?? 0),
            likes: Number(stats.likeCount ?? 0),
            comments: Number(stats.commentCount ?? 0),
          }
        : {},
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  LinkedIn                                                                  */
/* -------------------------------------------------------------------------- */

const linkedin: PlatformAdapter = {
  id: "linkedin",
  label: "LinkedIn",
  tagline: "Professional feed",
  accent: "#0A66C2",
  docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api",
  capabilities: ["text", "image"],
  limits: { captionMax: 3000, hashtagMax: 5 },
  requirements: [
    {
      label: "`w_member_social` (personal) or `w_organization_social`",
      status: "available",
      note: "Member posting is available on the free tier. Organization posting needs Page admin rights.",
    },
    {
      label: "Restli Posting API — `/rest/posts`",
      status: "available",
      note: "Versioned REST API. Free. Rate limited per member/app.",
    },
  ],
  setupEnv: [
    "LINKEDIN_CLIENT_ID",
    "LINKEDIN_CLIENT_SECRET",
    "LINKEDIN_REDIRECT_URI",
    "TOKEN_ENCRYPTION_KEY",
  ],
  defaultInstructions:
    "Insight-led and professional. One clear idea, one supporting detail, a question or CTA. 3–5 hashtags.",
  validate: (post, banned) => baseValidation(post, linkedin, banned),
  publish: async (creds, post) => {
    if (!creds.accessToken) {
      return { ok: false, code: "not_connected", error: "LinkedIn is not connected." };
    }
    let author = creds.externalId
      ? creds.externalId.startsWith("urn:")
        ? creds.externalId
        : `urn:li:person:${creds.externalId}`
      : undefined;

    if (!author) {
      const me = await httpJson("https://api.linkedin.com/v2/userinfo", {
        method: "GET",
        headers: { Authorization: `Bearer ${creds.accessToken}` },
      });
      const sub = (me.body as { sub?: string } | null)?.sub;
      if (sub) author = `urn:li:person:${sub}`;
    }
    if (!author) {
      return { ok: false, code: "auth_expired", error: "Could not resolve LinkedIn author URN." };
    }

    const res = await httpJson("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202411",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author,
        commentary: [post.caption, post.hashtags.join(" ")]
          .filter(Boolean)
          .join("\n\n"),
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED" },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    });
    if (res.status >= 300) {
      return {
        ok: false,
        code: statusToCode(res.status),
        error: errMessage(res.body, res.raw),
        retryable: isRetryable(res.status),
      };
    }
    const urn =
      res.headers.get("x-restli-id") ?? res.headers.get("X-RestLi-Id") ?? undefined;
    return {
      ok: true,
      platformPostId: urn,
      url: urn
        ? `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}`
        : undefined,
    };
  },
  fetchMetrics: async () => ({
    source: "unavailable",
    note: "LinkedIn analytics requires approved marketing/partner scopes; member-level metrics are not exposed.",
    metrics: {},
  }),
};

/* -------------------------------------------------------------------------- */
/*  TikTok                                                                    */
/* -------------------------------------------------------------------------- */

const tiktok: PlatformAdapter = {
  id: "tiktok",
  label: "TikTok",
  tagline: "Short-form video",
  accent: "#00E1D9",
  docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  capabilities: ["short_video"],
  limits: {
    captionMax: 2200,
    hashtagMax: 10,
    requiresMedia: ["short_video"],
    maxVideoSeconds: 600,
  },
  requirements: [
    {
      label: "Content Posting API audit",
      status: "approval_required",
      note: "Unaudited apps can only publish to the author's private (SELF_ONLY) view. Public posting requires TikTok's app audit.",
    },
    {
      label: "`video.publish` scope",
      status: "approval_required",
      note: "Requested at app review alongside the Content Posting API audit.",
    },
  ],
  setupEnv: [
    "TIKTOK_CLIENT_KEY",
    "TIKTOK_CLIENT_SECRET",
    "TIKTOK_REDIRECT_URI",
    "TOKEN_ENCRYPTION_KEY",
  ],
  defaultInstructions:
    "Creator-native hook in the first 3 seconds. Short punchy caption with 3–5 trend-style hashtags.",
  validate: (post, banned) => baseValidation(post, tiktok, banned),
  publish: async (creds, post) => {
    if (!creds.accessToken) {
      return { ok: false, code: "not_connected", error: "TikTok is not connected." };
    }
    if (!post.mediaUrl) {
      return {
        ok: false,
        code: "media_required",
        error: "TikTok publishing needs a hosted video URL.",
      };
    }
    const privacy = creds.extra?.privacyLevel ?? "SELF_ONLY";
    const caption = [post.caption, post.hashtags.join(" ")].filter(Boolean).join(" ");
    const res = await httpJson(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title: caption.slice(0, 2200),
            privacy_level: privacy,
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: { source: "PULL_FROM_URL", video_url: post.mediaUrl },
        }),
      },
    );
    if (res.status >= 300) {
      return {
        ok: false,
        code: statusToCode(res.status),
        error: errMessage(res.body, res.raw),
        retryable: isRetryable(res.status),
      };
    }
    const data = res.body as { data?: { publish_id?: string }; error?: { code?: string; message?: string } };
    if (data.error?.code && data.error.code !== "ok") {
      return {
        ok: false,
        code: "platform_error",
        error: data.error.message ?? data.error.code,
      };
    }
    return {
      ok: true,
      platformPostId: data.data?.publish_id,
      url: "https://www.tiktok.com/@me",
    };
  },
  fetchMetrics: async (creds, platformPostId) => {
    if (!creds.accessToken) return null;
    const res = await httpJson(
      "https://open.tiktokapis.com/v2/video/query/?fields=like_count,comment_count,share_count,view_count",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filters: { video_ids: [platformPostId] } }),
      },
    );
    if (res.status >= 300) {
      return { source: "unavailable", note: errMessage(res.body, res.raw), metrics: {} };
    }
    const v = (res.body as { data?: { videos?: Array<Record<string, number>> } })?.data
      ?.videos?.[0];
    if (!v) return { source: "unavailable", metrics: {} };
    return {
      source: "api",
      metrics: {
        likes: v.like_count,
        comments: v.comment_count,
        shares: v.share_count,
        views: v.view_count,
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  X / Twitter                                                               */
/* -------------------------------------------------------------------------- */

const x: PlatformAdapter = {
  id: "x",
  label: "X",
  tagline: "Real-time short posts",
  accent: "#111111",
  docsUrl: "https://docs.x.com/x-api/posts/creation-of-a-post",
  capabilities: ["text"],
  limits: { captionMax: 280, hashtagMax: 5 },
  requirements: [
    {
      label: "Write access on the X API",
      status: "quota",
      note: "The free tier allows a small number of writes per month; volume posting requires a paid plan. Media upload (v1.1) needs elevated access.",
    },
  ],
  setupEnv: ["X_CLIENT_ID", "X_CLIENT_SECRET", "X_REDIRECT_URI", "TOKEN_ENCRYPTION_KEY"],
  defaultInstructions:
    "Sharp and short. One idea, under 240 chars, max 2 hashtags. No fluff.",
  validate: (post, banned) => baseValidation(post, x, banned),
  publish: async (creds, post) => {
    if (!creds.accessToken) {
      return { ok: false, code: "not_connected", error: "X is not connected." };
    }
    const text = [post.caption, post.hashtags.join(" ")]
      .filter(Boolean)
      .join("\n")
      .slice(0, 280);
    const res = await httpJson("https://api.x.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    if (res.status >= 300) {
      return {
        ok: false,
        code: statusToCode(res.status),
        error: errMessage(res.body, res.raw),
        retryable: isRetryable(res.status),
      };
    }
    const id = (res.body as { data?: { id?: string } } | null)?.data?.id;
    return {
      ok: true,
      platformPostId: id,
      url: id ? `https://x.com/i/web/status/${id}` : undefined,
    };
  },
  fetchMetrics: async (creds, platformPostId) => {
    if (!creds.accessToken) return null;
    const res = await httpJson(
      `https://api.x.com/2/tweets/${platformPostId}?tweet.fields=public_metrics`,
      { method: "GET", headers: { Authorization: `Bearer ${creds.accessToken}` } },
    );
    if (res.status >= 300) {
      return { source: "unavailable", note: errMessage(res.body, res.raw), metrics: {} };
    }
    const m = (res.body as { data?: { public_metrics?: Record<string, number> } })?.data
      ?.public_metrics;
    if (!m) return { source: "unavailable", metrics: {} };
    return {
      source: "api",
      metrics: {
        impressions: m.impression_count,
        likes: m.like_count,
        comments: m.reply_count,
        shares: m.retweet_count,
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  Picsart (media enhancement only — no social publishing)                   */
/* -------------------------------------------------------------------------- */

const picsart: PlatformAdapter = {
  id: "picsart",
  label: "Picsart",
  tagline: "Design & photo editing API",
  accent: "#C209C1",
  docsUrl: "https://docs.picsart.io/",
  // Picsart's official API is a design/photo editing + generation API.
  // It does NOT publish to social networks, so it exposes no publishing
  // capability and the adapter refuses publish() honestly.
  capabilities: [],
  limits: { captionMax: 2200, hashtagMax: 30 },
  requirements: [
    {
      label: "Social publishing",
      status: "unavailable",
      note: "Picsart's official API performs image editing/generation and does not publish to social networks. Use it to prepare media, then publish via the destination platform's adapter.",
    },
    {
      label: "Media enhancement / generation",
      status: "paid",
      note: "The Picsart API is credit-based and not free. It is optional; generation falls back to your configured AI provider.",
    },
  ],
  setupEnv: ["PICSART_API_KEY"],
  defaultInstructions:
    "Prepare on-brand visuals (background removal, resizing, templates) before publishing elsewhere.",
  validate: (post) =>
    baseValidation(post, picsart).concat(
      post.caption.trim()
        ? []
        : [],
    ),
  publish: async () => ({
    ok: false,
    code: "unavailable",
    error:
      "Picsart's official API cannot publish to social networks. Use it for media preparation and publish through the destination platform.",
    retryable: false,
  }),
};

/* -------------------------------------------------------------------------- */
/*  Registry                                                                  */
/* -------------------------------------------------------------------------- */

export const ADAPTERS: Record<PlatformId, PlatformAdapter> = {
  instagram,
  facebook,
  youtube,
  linkedin,
  tiktok,
  x,
  picsart,
};

export const PLATFORM_IDS = Object.keys(ADAPTERS) as PlatformId[];

/** Platforms with a documented OAuth 2.0 authorization-code flow. */
export const OAUTH_ENABLED: PlatformId[] = [
  "instagram",
  "facebook",
  "youtube",
  "linkedin",
  "tiktok",
  "x",
];

export function getAdapter(id: string): PlatformAdapter | undefined {
  return ADAPTERS[id as PlatformId];
}

/** Serialisable summary of an adapter for the client. */
export function adapterSummary(id: PlatformId) {
  const a = ADAPTERS[id];
  return {
    id: a.id,
    label: a.label,
    tagline: a.tagline,
    accent: a.accent,
    docsUrl: a.docsUrl,
    capabilities: a.capabilities,
    limits: a.limits,
    requirements: a.requirements,
    setupEnv: a.setupEnv,
    defaultInstructions: a.defaultInstructions,
    oauthSupported: OAUTH_ENABLED.includes(a.id),
  };
}
