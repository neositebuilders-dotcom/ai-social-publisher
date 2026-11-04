import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildMessages,
  createRemoteProvider,
  localProvider,
  resolveProvider,
  type CampaignBrief,
  type GenerateRequest,
} from "../src/convex/lib/ai";
import { ADAPTERS, PLATFORM_IDS, type PlatformId } from "../src/convex/lib/platforms";

const realFetch = globalThis.fetch;
let calls: Array<{ url: string; init: RequestInit | undefined }> = [];

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  calls = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
}

function brief(overrides: Partial<CampaignBrief> = {}): CampaignBrief {
  return {
    name: "Launch",
    business: "Nimbus Analytics",
    instructions: "Promote the product with practical tips.",
    brandVoice: "warm and direct",
    audience: "startup operators",
    topics: ["pricing", "onboarding"],
    contentPillars: ["Product", "Education"],
    bannedWords: [],
    hashtagPrefs: "#saas, growth",
    ctaPrefs: "",
    platformInstructions: [],
    ...overrides,
  };
}

function request(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    brief: brief(),
    platform: "x",
    contentType: "text",
    history: [],
    index: 0,
    seed: 7,
    ...overrides,
  };
}

beforeEach(() => {
  calls = [];
  delete process.env.MEDIA_IMAGE_BASE;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.MEDIA_IMAGE_BASE;
});

describe("local provider", () => {
  test("is deterministic for the same campaign inputs", async () => {
    const a = await localProvider.generate(request());
    const b = await localProvider.generate(request());
    expect(a).toEqual(b);
    expect(a.model).toBe("local-heuristic-v1");
    expect(a.provider).toBe("local");
  });

  test("varies the caption between posts in the same batch", async () => {
    const first = await localProvider.generate(request({ index: 0 }));
    const second = await localProvider.generate(request({ index: 1 }));
    expect(first.caption).not.toBe(second.caption);
  });

  test("avoids pillars and topics it has already used", async () => {
    const out = await localProvider.generate(
      request({
        history: [
          { topicKey: "product::pricing", title: "Pricing", summary: "..." },
        ],
      }),
    );
    expect(out.pillar).toBe("Education");
    expect(out.topicKey).toBe("education::onboarding");
  });

  test("strips banned words from generated copy", async () => {
    const out = await localProvider.generate(
      request({ brief: brief({ bannedWords: ["guarantee", "hack"] }) }),
    );
    expect(out.caption.toLowerCase()).not.toContain("guarantee");
    expect(out.caption.toLowerCase()).not.toContain("hack");
    expect(out.caption.length).toBeGreaterThan(0);
  });

  test("uses hashtag and CTA preferences when provided", async () => {
    const out = await localProvider.generate(
      request({ brief: brief({ ctaPrefs: "Book a demo today." }) }),
    );
    expect(out.cta).toBe("Book a demo today.");
    expect(out.hashtags).toContain("#saas");
  });

  test("adds a description for YouTube only", async () => {
    const youtube = await localProvider.generate(
      request({ platform: "youtube", contentType: "short_video" }),
    );
    expect(typeof youtube.description).toBe("string");
    expect(youtube.description!.length).toBeGreaterThan(0);

    const x = await localProvider.generate(request());
    expect(x.description).toBeUndefined();
  });

  test("attaches deterministic media for image posts but not text posts", async () => {
    const instagram = await localProvider.generate(
      request({ platform: "instagram", contentType: "image" }),
    );
    expect(instagram.mediaUrl).toMatch(
      /^https:\/\/picsum\.photos\/seed\/aipublisher-/,
    );
    expect(instagram.mediaUrl).toContain("/1080/1350");

    const x = await localProvider.generate(request());
    expect(x.mediaUrl).toBeUndefined();
  });

  test("respects a configured MEDIA_IMAGE_BASE", async () => {
    process.env.MEDIA_IMAGE_BASE = "https://cdn.example.com/media";
    const out = await localProvider.generate(
      request({ platform: "facebook", contentType: "image" }),
    );
    expect(out.mediaUrl!.startsWith("https://cdn.example.com/media/")).toBe(true);
  });

  test("production output passes every adapter's hard limits", async () => {
    for (const platform of PLATFORM_IDS) {
      const adapter = ADAPTERS[platform];
      const contentType = adapter.capabilities[0] ?? "text";
      const out = await localProvider.generate(
        request({ platform, contentType, brief: brief({ bannedWords: ["guarantee"] }) }),
      );

      expect(out.caption.length).toBeLessThanOrEqual(adapter.limits.captionMax);
      expect(out.hashtags.length).toBeLessThanOrEqual(adapter.limits.hashtagMax);
      if (adapter.limits.titleMax) {
        expect(out.title.length).toBeLessThanOrEqual(adapter.limits.titleMax);
      }
      expect(out.caption.toLowerCase()).not.toContain("guarantee");

      const issues = adapter
        .validate(
          {
            caption: out.caption,
            title: out.title,
            description: out.description,
            hashtags: out.hashtags,
            cta: out.cta,
            mediaType: out.mediaType,
            mediaUrl: out.mediaUrl,
          },
          brief().bannedWords,
        )
        .filter((i) => i.level === "error");

      // Video-only platforms legitimately need a real video file, which the
      // text generator cannot invent — it must say so rather than fake one.
      if (platform === "youtube" || platform === "tiktok") {
        expect(issues.map((i) => i.code)).toEqual(["media_required"]);
      } else {
        expect(issues).toEqual([]);
      }
    }
  });

  test("rejects unknown platforms", async () => {
    await expect(
      localProvider.generate(request({ platform: "myspace" as PlatformId })),
    ).rejects.toThrow(/Unknown platform/);
  });
});

describe("buildMessages", () => {
  test("includes hard limits, brand rules and the anti-repetition brief", () => {
    const messages = buildMessages(
      request({
        brief: brief({ bannedWords: ["guarantee"] }),
        history: [{ topicKey: "product::pricing", title: "Pricing recap", summary: "old post" }],
      }),
      "sharp, short and direct",
    );

    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("Platform: X");
    expect(messages[1].content).toContain("caption <= 280 chars");
    expect(messages[1].content).toContain("Never use these terms: guarantee");
    expect(messages[1].content).toContain("Pricing recap");
    expect(messages[1].content).toContain("Return JSON");
  });
});

describe("remote OpenAI-compatible provider", () => {
  test("parses structured output and normalises it to platform rules", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  topicKey: "education::pricing",
                  pillar: "Education",
                  title: "Pricing without guesswork",
                  caption: `${"a".repeat(400)} guarantee`,
                  hashtags: ["clean", "#already"],
                  cta: "Read more",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const provider = createRemoteProvider({
      baseUrl: "https://ai.test/v1/",
      apiKey: "sk-test",
      model: "test-model",
    });
    const out = await provider.generate(
      request({ brief: brief({ bannedWords: ["guarantee"] }) }),
    );

    expect(calls[0].url).toBe("https://ai.test/v1/chat/completions");
    const body = JSON.parse(String(calls[0].init?.body)) as {
      model: string;
      messages: unknown[];
    };
    expect(body.model).toBe("test-model");
    expect(body.messages.length).toBe(2);
    expect(
      (calls[0].init?.headers as Record<string, string>).Authorization,
    ).toBe("Bearer sk-test");

    expect(out.caption.length).toBeLessThanOrEqual(280);
    expect(out.caption).not.toContain("guarantee");
    expect(out.hashtags).toEqual(["#clean", "#already"]);
    expect(out.topicKey).toBe("education::pricing");
    expect(out.provider).toBe("openai-compatible");
    expect(out.model).toBe("test-model");
  });

  test("surfaces provider HTTP failures with the status code", async () => {
    mockFetch(() => new Response("upstream exploded", { status: 500 }));
    const provider = createRemoteProvider({
      baseUrl: "https://ai.test/v1",
      apiKey: "",
      model: "m",
    });
    await expect(provider.generate(request())).rejects.toThrow(/AI provider 500/);
  });
});

describe("resolveProvider", () => {
  const keys = ["AI_BASE_URL", "AI_API_KEY", "OPENAI_API_KEY", "AI_MODEL"];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("defaults to the free local generator", () => {
    const provider = resolveProvider();
    expect(provider.name).toBe("local");
    expect(provider.model).toBe("local-heuristic-v1");
  });

  test("uses the remote provider when a base URL is configured", () => {
    process.env.AI_BASE_URL = "http://localhost:11434/v1";
    const provider = resolveProvider();
    expect(provider.name).toBe("openai-compatible");
    expect(provider.model).toBe("gpt-4o-mini");
  });

  test("honours an explicit model and an explicit local override", () => {
    process.env.AI_BASE_URL = "http://localhost:11434/v1";
    process.env.AI_MODEL = "llama3.1";
    expect(resolveProvider().model).toBe("llama3.1");
    expect(resolveProvider({ provider: "local" }).name).toBe("local");
  });
});
