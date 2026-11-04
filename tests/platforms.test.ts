import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  ADAPTERS,
  OAUTH_ENABLED,
  PLATFORM_IDS,
  adapterSummary,
  getAdapter,
  type AdapterPost,
  type PlatformId,
} from "../src/convex/lib/platforms";

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

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function post(overrides: Partial<AdapterPost> = {}): AdapterPost {
  return {
    caption: "A short, useful caption about analytics.",
    hashtags: ["#analytics", "#growth"],
    ...overrides,
  };
}

const errors = (platform: PlatformId, p: AdapterPost, banned: string[] = []) =>
  ADAPTERS[platform].validate(p, banned).filter((i) => i.level === "error");

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("adapter registry", () => {
  test("registers every supported platform exactly once", () => {
    expect(PLATFORM_IDS).toEqual([
      "instagram",
      "facebook",
      "youtube",
      "linkedin",
      "tiktok",
      "x",
      "picsart",
    ]);
    for (const id of PLATFORM_IDS) {
      expect(ADAPTERS[id].id).toBe(id);
      expect(ADAPTERS[id].label.length).toBeGreaterThan(0);
      expect(ADAPTERS[id].docsUrl.startsWith("https://")).toBe(true);
      expect(ADAPTERS[id].limits.captionMax).toBeGreaterThan(0);
      expect(ADAPTERS[id].limits.hashtagMax).toBeGreaterThan(0);
    }
  });

  test("only platforms with a documented OAuth flow claim OAuth support", () => {
    expect(OAUTH_ENABLED).toEqual([
      "instagram",
      "facebook",
      "youtube",
      "linkedin",
      "tiktok",
      "x",
    ]);
    for (const id of PLATFORM_IDS) {
      const summary = adapterSummary(id);
      expect(summary.oauthSupported).toBe(OAUTH_EXPECTED.includes(id));
    }
  });

  test("summary is serialisable (no functions cross the client boundary)", () => {
    const summary = adapterSummary("instagram");
    expect(typeof (summary as Record<string, unknown>).validate).toBe("undefined");
    expect(typeof (summary as Record<string, unknown>).publish).toBe("undefined");
    expect(() => JSON.stringify(summary)).not.toThrow();
  });

  test("getAdapter rejects unknown platforms", () => {
    expect(getAdapter("myspace")).toBeUndefined();
    expect(getAdapter("x")).toBe(ADAPTERS.x);
  });
});

const OAUTH_EXPECTED: PlatformId[] = [
  "instagram",
  "facebook",
  "youtube",
  "linkedin",
  "tiktok",
  "x",
];

describe("Picsart is honest about what its official API cannot do", () => {
  test("declares no publishing capability", () => {
    expect(ADAPTERS.picsart.capabilities).toEqual([]);
    expect(OAUTH_ENABLED).not.toContain("picsart");
  });

  test("refuses to publish instead of faking success", async () => {
    const result = await ADAPTERS.picsart.publish(
      { accessToken: "token" },
      post(),
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("unavailable");
    expect(result.retryable).toBe(false);
    expect(result.error).toContain("cannot publish");
    expect(calls.length).toBe(0);
  });

  test("flags social publishing as unavailable in its requirements", () => {
    const requirement = ADAPTERS.picsart.requirements.find(
      (r) => r.status === "unavailable",
    );
    expect(requirement).toBeDefined();
  });
});

describe("validation", () => {
  test("rejects an empty caption", () => {
    expect(errors("x", post({ caption: "   " })).map((i) => i.code)).toContain(
      "empty_caption",
    );
  });

  test("enforces each platform's caption limit", () => {
    expect(
      errors("x", post({ caption: "a".repeat(281) })).map((i) => i.code),
    ).toContain("caption_too_long");
    expect(
      errors("linkedin", post({ caption: "a".repeat(3001) })).map((i) => i.code),
    ).toContain("caption_too_long");
    expect(errors("x", post({ caption: "a".repeat(280) }))).toEqual([]);
  });

  test("enforces per-platform hashtag ceilings", () => {
    const tooMany = Array.from({ length: 6 }, (_, i) => `#tag${i}`);
    expect(errors("linkedin", post({ hashtags: tooMany })).map((i) => i.code)).toContain(
      "too_many_hashtags",
    );
    expect(
      errors(
        "instagram",
        post({
          hashtags: tooMany,
          mediaType: "image",
          mediaUrl: "https://example.com/a.jpg",
        }),
      ),
    ).toEqual([]);
  });

  test("enforces YouTube's title limit", () => {
    expect(
      errors("youtube", post({ title: "t".repeat(101) })).map((i) => i.code),
    ).toContain("title_too_long");
  });

  test("requires media where the platform demands it", () => {
    expect(errors("instagram", post({ mediaType: "image" })).map((i) => i.code)).toContain(
      "media_required",
    );
    expect(errors("tiktok", post({ mediaType: "short_video" })).map((i) => i.code)).toContain(
      "media_required",
    );
    expect(
      errors(
        "instagram",
        post({ mediaType: "image", mediaUrl: "https://example.com/a.jpg" }),
      ),
    ).toEqual([]);
  });

  test("warns about banned words without blocking the post", () => {
    const issues = ADAPTERS.x.validate(
      post({ caption: "We guarantee results." }),
      ["guarantee"],
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "banned_word", level: "warning" }),
    );
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("publish refuses to run without a connected account", () => {
  for (const id of ["instagram", "facebook", "youtube", "linkedin", "tiktok", "x"] as PlatformId[]) {
    test(`${id} returns not_connected and makes no network call`, async () => {
      const result = await ADAPTERS[id].publish({}, post());
      expect(result.ok).toBe(false);
      expect(result.code).toBe("not_connected");
      expect(calls.length).toBe(0);
    });
  }

  test("media-first platforms report media_required before any request", async () => {
    const instagram = await ADAPTERS.instagram.publish(
      { accessToken: "t", externalId: "1784" },
      post({ mediaType: "image" }),
    );
    expect(instagram.code).toBe("media_required");

    const youtube = await ADAPTERS.youtube.publish(
      { accessToken: "t" },
      post({ mediaType: "short_video" }),
    );
    expect(youtube.code).toBe("media_required");

    const tiktok = await ADAPTERS.tiktok.publish(
      { accessToken: "t" },
      post({ mediaType: "short_video" }),
    );
    expect(tiktok.code).toBe("media_required");
    expect(calls.length).toBe(0);
  });
});

describe("X adapter", () => {
  test("posts the caption and hashtags to /2/tweets within 280 chars", async () => {
    mockFetch(() => json({ data: { id: "1900000000000000001" } }, 201));
    const result = await ADAPTERS.x.publish(
      { accessToken: "token" },
      post({ hashtags: Array.from({ length: 5 }, (_, i) => `#tag${i}`) }),
    );

    expect(result).toEqual({
      ok: true,
      platformPostId: "1900000000000000001",
      url: "https://x.com/i/web/status/1900000000000000001",
    });
    expect(calls[0].url).toBe("https://api.x.com/2/tweets");
    const body = JSON.parse(String(calls[0].init?.body)) as { text: string };
    expect(body.text.length).toBeLessThanOrEqual(280);
    expect(body.text).toContain("#tag0");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token");
  });

  test("maps rate limits to a retryable failure", async () => {
    mockFetch(() => json({ detail: "Too many requests" }, 429));
    const result = await ADAPTERS.x.publish({ accessToken: "t" }, post());
    expect(result.ok).toBe(false);
    expect(result.code).toBe("rate_limited");
    expect(result.retryable).toBe(true);
  });

  test("maps expired credentials to auth_expired", async () => {
    mockFetch(() => json({ detail: "Unauthorized" }, 401));
    const result = await ADAPTERS.x.publish({ accessToken: "t" }, post());
    expect(result.code).toBe("auth_expired");
    expect(result.retryable).toBe(false);
  });

  test("maps server errors to a retryable platform_error", async () => {
    mockFetch(() => json({}, 503));
    const result = await ADAPTERS.x.publish({ accessToken: "t" }, post());
    expect(result.code).toBe("platform_error");
    expect(result.retryable).toBe(true);
  });
});

describe("LinkedIn adapter", () => {
  test("posts to /rest/posts and reads the Restli id header", async () => {
    mockFetch(() =>
      json({}, 201, { "x-restli-id": "urn:li:share:7312345678901234567" }),
    );
    const result = await ADAPTERS.linkedin.publish(
      { accessToken: "t", externalId: "abc123" },
      post(),
    );

    expect(result.ok).toBe(true);
    expect(result.platformPostId).toBe("urn:li:share:7312345678901234567");
    expect(result.url).toContain(encodeURIComponent("urn:li:share:"));

    expect(calls[0].url).toBe("https://api.linkedin.com/rest/posts");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["LinkedIn-Version"]).toBeDefined();
    const body = JSON.parse(String(calls[0].init?.body)) as {
      author: string;
      lifecycleState: string;
      commentary: string;
    };
    expect(body.author).toBe("urn:li:person:abc123");
    expect(body.lifecycleState).toBe("PUBLISHED");
    expect(body.commentary).toContain("#analytics");
  });
});

describe("Instagram adapter", () => {
  test("creates a media container then publishes it", async () => {
    mockFetch((url) =>
      url.includes("media_publish")
        ? json({ id: "17900000000000000" })
        : json({ id: "creation-1" }),
    );
    const result = await ADAPTERS.instagram.publish(
      { accessToken: "t", externalId: "17841400000000000" },
      post({ mediaType: "image", mediaUrl: "https://example.com/a.jpg" }),
    );

    expect(result.ok).toBe(true);
    expect(result.platformPostId).toBe("17900000000000000");
    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain("/17841400000000000/media");
    expect(calls[1].url).toContain("/media_publish");
    expect(String(calls[1].init?.body)).toContain("creation_id=creation-1");
  });

  test("reports platform errors from the container step", async () => {
    mockFetch(() => json({ error: { message: "Invalid image URL" } }, 400));
    const result = await ADAPTERS.instagram.publish(
      { accessToken: "t", externalId: "1" },
      post({ mediaType: "image", mediaUrl: "https://example.com/a.jpg" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid image URL");
    expect(calls.length).toBe(1);
  });
});

describe("Facebook and TikTok adapters", () => {
  test("Facebook posts text to the page feed", async () => {
    mockFetch(() => json({ id: "123_456" }));
    const result = await ADAPTERS.facebook.publish(
      { accessToken: "t", externalId: "123" },
      post(),
    );
    expect(result.ok).toBe(true);
    expect(result.platformPostId).toBe("123_456");
    expect(calls[0].url).toContain("/123/feed");
  });

  test("TikTok uses PULL_FROM_URL for a hosted video", async () => {
    mockFetch(() => json({ data: { publish_id: "p-1" }, error: { code: "ok" } }));
    const result = await ADAPTERS.tiktok.publish(
      { accessToken: "t" },
      post({ mediaType: "short_video", mediaUrl: "https://example.com/v.mp4" }),
    );
    expect(result.ok).toBe(true);
    expect(result.platformPostId).toBe("p-1");
    const body = JSON.parse(String(calls[0].init?.body)) as {
      source_info: { source: string; video_url: string };
      post_info: { privacy_level: string };
    };
    expect(body.source_info.source).toBe("PULL_FROM_URL");
    expect(body.source_info.video_url).toBe("https://example.com/v.mp4");
    expect(body.post_info.privacy_level).toBe("SELF_ONLY");
  });

  test("TikTok surfaces an error payload returned with HTTP 200", async () => {
    mockFetch(() =>
      json({ error: { code: "spam_risk_too_many_posts", message: "Too many posts" } }),
    );
    const result = await ADAPTERS.tiktok.publish(
      { accessToken: "t" },
      post({ mediaType: "short_video", mediaUrl: "https://example.com/v.mp4" }),
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("platform_error");
    expect(result.error).toBe("Too many posts");
  });
});

describe("metrics", () => {
  test("maps X public metrics into the shared shape", async () => {
    mockFetch(() =>
      json({
        data: {
          public_metrics: {
            impression_count: 1200,
            like_count: 42,
            reply_count: 7,
            retweet_count: 3,
          },
        },
      }),
    );
    const metrics = await ADAPTERS.x.fetchMetrics!(
      { accessToken: "t" },
      "1900000000000000001",
    );
    expect(metrics?.source).toBe("api");
    expect(metrics?.metrics).toEqual({
      impressions: 1200,
      likes: 42,
      comments: 7,
      shares: 3,
    });
  });

  test("reports unavailable metrics instead of zeroes on failure", async () => {
    mockFetch(() => json({ detail: "Unauthorized" }, 401));
    const metrics = await ADAPTERS.x.fetchMetrics!({ accessToken: "t" }, "1");
    expect(metrics?.source).toBe("unavailable");
    expect(metrics?.metrics).toEqual({});
  });

  test("LinkedIn advertises no member-level metrics", async () => {
    const metrics = await ADAPTERS.linkedin.fetchMetrics!({ accessToken: "t" }, "urn:li:share:1");
    expect(metrics?.source).toBe("unavailable");
    expect(calls.length).toBe(0);
  });
});
