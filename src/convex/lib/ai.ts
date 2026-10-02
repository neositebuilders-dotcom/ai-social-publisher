/**
 * AI provider abstraction.
 *
 * The app never hard-codes an AI vendor. An `AIProvider` is just
 * `generate(request) -> GeneratedContent`, so it can be swapped for a hosted
 * model, an OpenAI-compatible endpoint (OpenRouter, Groq, LM Studio, Ollama…)
 * or the built-in local generator that runs with **no API key at all**.
 *
 * The local provider is not a stub: it composes real, platform-shaped copy from
 * the campaign brief, rotates through the campaign's content pillars and the
 * account's content history, and enforces each platform's limits. That keeps
 * the whole MVP runnable at $0 while the same interface can delegate to a
 * stronger model later.
 */

import {
  ADAPTERS,
  getAdapter,
  type ContentType,
  type PlatformId,
} from "./platforms";

export interface HistoryItem {
  topicKey: string;
  title: string;
  summary: string;
}

export interface CampaignBrief {
  name: string;
  business: string;
  instructions: string;
  brandVoice?: string;
  audience?: string;
  topics: string[];
  contentPillars: string[];
  bannedWords: string[];
  hashtagPrefs?: string;
  ctaPrefs?: string;
  platformInstructions: { platform: PlatformId; instructions: string }[];
}

export interface GenerateRequest {
  brief: CampaignBrief;
  platform: PlatformId;
  contentType: ContentType;
  history: HistoryItem[];
  /** Position of this item within the generation batch. */
  index: number;
  /** Stable-ish seed (e.g. campaign id hash + day) so runs differ day to day. */
  seed: number;
}

export interface GeneratedContent {
  topicKey: string;
  pillar: string;
  title: string;
  caption: string;
  description?: string;
  hashtags: string[];
  cta: string;
  mediaType: ContentType;
  mediaUrl?: string;
  provider: string;
  model: string;
}

export interface AIProvider {
  name: string;
  model: string;
  generate: (req: GenerateRequest) => Promise<GeneratedContent>;
}

/* -------------------------------------------------------------------------- */
/*  Deterministic helpers                                                     */
/* -------------------------------------------------------------------------- */

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], n: number): T {
  return arr[Math.abs(n) % arr.length];
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripBanned(text: string, banned: string[]): string {
  let out = text;
  for (const w of banned) {
    const term = w.trim();
    if (!term) continue;
    out = out.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/* -------------------------------------------------------------------------- */
/*  Local (zero-cost) provider                                                */
/* -------------------------------------------------------------------------- */

const HOOKS = [
  "Most teams overlook this",
  "A quick one for you",
  "Here's the thing",
  "Small change, big difference",
  "If you're building in this space",
  "Worth repeating",
  "One idea, 30 seconds",
  "The quiet advantage",
];

const OPENERS = [
  "Let's talk about",
  "A pattern we keep seeing:",
  "Here's what changed for us:",
  "Hot take:",
  "Three things we learned about",
];

const CLOSERS = [
  "What's your take?",
  "Curious how you'd handle this.",
  "Save this one.",
  "Reply with your approach.",
  "Follow along for more.",
];

function platformVoice(platform: PlatformId): string {
  switch (platform) {
    case "linkedin":
      return "insight-led and professional";
    case "x":
      return "sharp, short and direct";
    case "instagram":
      return "visual, warm and benefit-first";
    case "facebook":
      return "conversational and community-minded";
    case "tiktok":
      return "creator-native with a fast hook";
    case "youtube":
      return "clear value promise up front";
    case "picsart":
      return "design-forward and visual";
  }
}

function buildHooks(platform: PlatformId, h: number): string {
  switch (platform) {
    case "x":
      return pick(["Most teams get this wrong:", "Unpopular opinion:", "Quick win:"], h);
    case "tiktok":
      return pick(["POV: you finally", "3 seconds to convince you", "Nobody talks about"], h);
    case "youtube":
      return pick(["Here's how", "The fastest way to", "Stop doing this:"], h);
    default:
      return pick(HOOKS, h);
  }
}

function composeCaption(args: {
  platform: PlatformId;
  pillar: string;
  topic: string;
  business: string;
  audience?: string;
  brandVoice?: string;
  hook: string;
  opener: string;
  closer: string;
  instructions: string;
}): string {
  const {
    platform,
    pillar,
    topic,
    business,
    audience,
    brandVoice,
    hook,
    opener,
    closer,
    instructions,
  } = args;

  const who = audience ? audience : "your audience";
  const voice = brandVoice ? ` (${brandVoice})` : "";
  const pillarLine = pillar ? `${pillar.toLowerCase()} angle` : "core idea";

  switch (platform) {
    case "x":
      return `${hook} ${opener} ${topic}. We build ${business} — the ${pillarLine} matters more than most people think. ${closer}`;
    case "linkedin":
      return [
        `${hook} — ${opener} ${topic}.${voice}`,
        "",
        `At ${business}, we've found that a clear ${pillarLine} beats a clever one every time. It keeps ${who} moving and makes the value obvious without overselling.`,
        "",
        `If you take one thing away: start with the problem ${who} already has, then show the shortest path to solving it.`,
        "",
        closer,
      ].join("\n");
    case "instagram":
    case "facebook":
      return [
        `${hook} ✨ ${opener} ${topic}.`,
        "",
        `For ${who}, this is the part of ${business} that quietly does the heavy lifting. ${instructions ? instructions.split(".")[0] + "." : ""}`.trim(),
        "",
        `${closer}`,
      ].join("\n");
    case "tiktok":
      return `Hook (0-3s): ${hook} ${topic}.\nBody: ${opener} ${business} does this well — here's the ${pillarLine} in one shot.\nEnd: ${closer}`;
    case "youtube":
      return `${hook} ${topic} — a short breakdown for ${who}.\n\nIn this video we cover ${business.toLowerCase()}'s ${pillarLine}, why it works, and the mistake to avoid.\n\n${closer}`;
    case "picsart":
      return `Visual concept for ${topic}: on-brand ${pillarLine} composition. ${closer}`;
  }
}

function buildHashtags(args: {
  platform: PlatformId;
  pillar: string;
  topic: string;
  business: string;
  prefs?: string;
}): string[] {
  const { platform, pillar, topic, business, prefs } = args;
  const adapter = ADAPTERS[platform];
  const base = [
    slug(topic),
    slug(pillar),
    slug(business),
  ].filter(Boolean);
  const platformTags: Record<PlatformId, string[]> = {
    instagram: ["socialmedia", "contentcreator", "growthtips"],
    facebook: ["community", "smallbusiness"],
    linkedin: ["leadership", "strategy", "growth"],
    x: ["buildinpublic"],
    tiktok: ["fyp", "learnontiktok"],
    youtube: ["shorts", "tutorial"],
    picsart: ["design", "visual"],
  };
  const fromPrefs = (prefs ?? "")
    .split(/[\s,]+/)
    .map((t) => slug(t.replace(/^#/, "")))
    .filter(Boolean);
  const all = [...new Set([...base, ...platformTags[platform], ...fromPrefs])];
  return all.slice(0, adapter.limits.hashtagMax).map((t) => `#${t}`);
}

function buildCTA(platform: PlatformId, ctaPrefs?: string): string {
  if (ctaPrefs?.trim()) return ctaPrefs.trim();
  switch (platform) {
    case "linkedin":
      return "Follow for more practical breakdowns.";
    case "x":
      return "Follow for more.";
    case "instagram":
      return "Save this + follow for more.";
    case "facebook":
      return "Tell us in the comments.";
    case "tiktok":
      return "Follow for part two.";
    case "youtube":
      return "Subscribe for more short breakdowns.";
    case "picsart":
      return "Try it on your next post.";
  }
}

/**
 * Choose the next pillar/topic pair. Prefers pillars that have not been used
 * recently, so a long-running automation keeps sounding fresh.
 */
function chooseTopic(
  req: GenerateRequest,
): { pillar: string; topic: string } {
  const pillars = req.brief.contentPillars.length
    ? req.brief.contentPillars
    : ["Product", "Education", "Story"];
  const topics = req.brief.topics.length ? req.brief.topics : [req.brief.business];

  const usedPillars = new Set(req.history.map((h) => h.topicKey.split("::")[0]));
  const usedTopics = new Set(req.history.map((h) => h.topicKey.split("::")[1]));

  const pillar =
    pillars.find((p) => !usedPillars.has(slug(p))) ??
    pick(pillars, req.seed + req.index);
  const topic =
    topics.find((t) => !usedTopics.has(slug(t))) ?? pick(topics, req.seed + req.index);
  return { pillar, topic };
}

export const localProvider: AIProvider = {
  name: "local",
  model: "local-heuristic-v1",
  async generate(req) {
    const adapter = getAdapter(req.platform);
    if (!adapter) throw new Error(`Unknown platform ${req.platform}`);

    const { pillar, topic } = chooseTopic(req);
    const h = hash(`${req.seed}:${req.platform}:${pillar}:${topic}:${req.index}`);

    const platformInstruction =
      req.brief.platformInstructions.find((p) => p.platform === req.platform)
        ?.instructions ?? "";

    const rawCaption = composeCaption({
      platform: req.platform,
      pillar,
      topic,
      business: req.brief.business,
      audience: req.brief.audience,
      brandVoice: req.brief.brandVoice,
      hook: buildHooks(req.platform, h),
      opener: pick(OPENERS, h >> 3),
      closer: pick(CLOSERS, h >> 5),
      instructions: platformInstruction || req.brief.instructions,
    });

    let caption = stripBanned(rawCaption, req.brief.bannedWords);
    const hashtags = buildHashtags({
      platform: req.platform,
      pillar,
      topic,
      business: req.brief.business,
      prefs: req.brief.hashtagPrefs,
    });
    const cta = buildCTA(req.platform, req.brief.ctaPrefs);

    // Enforce the platform's hard caption limit by trimming on a word boundary.
    if (caption.length > adapter.limits.captionMax) {
      caption = caption.slice(0, adapter.limits.captionMax - 1).replace(/\s+\S*$/, "") + "…";
    }

    const mediaType: ContentType = req.contentType;
    let mediaUrl: string | undefined;
    if (mediaType === "image" || mediaType === "carousel" || mediaType === "story") {
      // Deterministic placeholder imagery (picsum.photos — free, no key) so the
      // local pipeline can produce a publishable shape at $0. Swap for real
      // generation by pointing an AI provider at a media endpoint.
      const base = process.env.MEDIA_IMAGE_BASE ?? "https://picsum.photos/seed";
      const w = req.platform === "instagram" ? 1080 : 1200;
      const hgt = req.platform === "instagram" ? 1350 : 675;
      mediaUrl = `${base}/aipublisher-${slug(topic)}-${h % 9973}/${w}/${hgt}`;
    }

    const title = titleCase(
      `${pillar}: ${topic}`.slice(0, adapter.limits.titleMax ?? 120),
    );
    const description =
      req.platform === "youtube"
        ? `${topic} explained for ${req.brief.audience ?? "your audience"}. ${req.brief.instructions}`.slice(0, 900)
        : undefined;

    return {
      topicKey: `${slug(pillar)}::${slug(topic)}`,
      pillar,
      title,
      caption,
      description,
      hashtags,
      cta,
      mediaType,
      mediaUrl,
      provider: req.platform === "picsart" ? "picsart" : "local",
      model: "local-heuristic-v1",
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  Remote OpenAI-compatible provider                                          */
/* -------------------------------------------------------------------------- */

export function buildMessages(req: GenerateRequest, voice: string): {
  role: "system" | "user";
  content: string;
}[] {
  const adapter = getAdapter(req.platform);
  const history = req.history
    .slice(0, 20)
    .map((h) => `- ${h.title}: ${h.summary}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "You are a senior social media strategist. You write platform-native copy that never repeats recent posts. Always respond with a single JSON object and no prose.",
    },
    {
      role: "user",
      content: [
        `Platform: ${adapter?.label ?? req.platform} (${voice}).`,
        `Business/product: ${req.brief.business}`,
        `Campaign: ${req.brief.name}`,
        `Instructions: ${req.brief.instructions}`,
        req.brief.brandVoice ? `Brand voice: ${req.brief.brandVoice}` : "",
        req.brief.audience ? `Target audience: ${req.brief.audience}` : "",
        `Content pillars: ${req.brief.contentPillars.join(", ") || "n/a"}`,
        `Topics: ${req.brief.topics.join(", ") || "n/a"}`,
        req.brief.bannedWords.length
          ? `Never use these terms: ${req.brief.bannedWords.join(", ")}`
          : "",
        req.brief.hashtagPrefs ? `Hashtag preferences: ${req.brief.hashtagPrefs}` : "",
        req.brief.ctaPrefs ? `CTA preferences: ${req.brief.ctaPrefs}` : "",
        `Content type: ${req.contentType}`,
        `Hard limits: caption <= ${adapter?.limits.captionMax ?? 2200} chars, <= ${adapter?.limits.hashtagMax ?? 10} hashtags${adapter?.limits.titleMax ? `, title <= ${adapter.limits.titleMax}` : ""}.`,
        history ? `Recently published (do NOT repeat these angles):\n${history}` : "",
        "",
        'Return JSON: {"topicKey":string,"pillar":string,"title":string,"caption":string,"description":string|null,"hashtags":string[],"cta":string}',
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

export function createRemoteProvider(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): AIProvider {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  return {
    name: "openai-compatible",
    model: opts.model,
    async generate(req) {
      const voice = platformVoice(req.platform);
      const messages = buildMessages(req, voice);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45_000);
      try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: opts.model,
            messages,
            temperature: 0.8,
            response_format: { type: "json_object" },
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`AI provider ${res.status}: ${text.slice(0, 200)}`);
        }
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content ?? "";
        const parsed = JSON.parse(content) as Partial<GeneratedContent>;
        const adapter = getAdapter(req.platform);

        let mediaUrl: string | undefined;
        const mediaType: ContentType = req.contentType;
        if (mediaType === "image" || mediaType === "story" || mediaType === "carousel") {
          const base = process.env.MEDIA_IMAGE_BASE ?? "https://picsum.photos/seed";
          mediaUrl = `${base}/aipublisher-${hash(parsed.topicKey ?? req.platform)}/1080/1350`;
        }

        return {
          topicKey: parsed.topicKey ?? `${slug(parsed.pillar ?? "post")}::${slug(parsed.title ?? "topic")}`,
          pillar: parsed.pillar ?? "General",
          title: (parsed.title ?? req.brief.name).slice(0, adapter?.limits.titleMax ?? 200),
          caption: stripBanned(
            (parsed.caption ?? "").slice(0, adapter?.limits.captionMax ?? 2200),
            req.brief.bannedWords,
          ),
          description: parsed.description ?? undefined,
          hashtags: (parsed.hashtags ?? [])
            .map((t) => (t.startsWith("#") ? t : `#${slug(t)}`))
            .slice(0, adapter?.limits.hashtagMax ?? 10),
          cta: parsed.cta ?? buildCTA(req.platform, req.brief.ctaPrefs),
          mediaType,
          mediaUrl,
          provider: "openai-compatible",
          model: opts.model,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Resolve the active provider from the environment.
 *
 * `AI_BASE_URL` (with an optional `AI_API_KEY`) points at any OpenAI-compatible
 * endpoint — a local Ollama/LM Studio server, OpenRouter, Groq, etc. When it is
 * absent we use the built-in local generator, so the product works at $0.
 */
export function resolveProvider(overrides?: {
  provider?: string;
  model?: string;
}): AIProvider {
  const baseUrl = process.env.AI_BASE_URL?.trim();
  const apiKey = (process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? "").trim();
  const model =
    overrides?.model?.trim() || process.env.AI_MODEL?.trim() || "gpt-4o-mini";

  const wantsRemote =
    overrides?.provider === "remote" ||
    overrides?.provider === "openai-compatible" ||
    (!!baseUrl && overrides?.provider !== "local") ||
    (!!apiKey && overrides?.provider !== "local");

  if (wantsRemote) {
    return createRemoteProvider({
      baseUrl: baseUrl || "https://api.openai.com/v1",
      apiKey,
      model,
    });
  }
  return localProvider;
}
