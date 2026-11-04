import { describe, expect, test } from "bun:test";
import {
  computeNextRun,
  isValidTimezone,
  planSlots,
  upcomingRuns,
  zonedToUtc,
  type ScheduleSpec,
} from "../src/convex/lib/schedule";

const DAY = 86_400_000;

function spec(overrides: Partial<ScheduleSpec> = {}): ScheduleSpec {
  return {
    frequency: "daily",
    times: ["09:00"],
    postsPerDay: 1,
    timezone: "UTC",
    ...overrides,
  };
}

function localHHMM(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

describe("timezone validation", () => {
  test("accepts real IANA zones", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Europe/Berlin")).toBe(true);
  });

  test("rejects unknown zones instead of throwing", () => {
    expect(isValidTimezone("Mars/Phobos")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("planSlots", () => {
  test("sorts explicit times and caps them at postsPerDay", () => {
    const slots = planSlots(
      spec({ times: ["15:30", "09:00", "12:00"], postsPerDay: 2 }),
    );
    expect(slots).toEqual([
      [9, 0],
      [12, 0],
    ]);
  });

  test("spreads slots across the working day when no times are given", () => {
    expect(planSlots(spec({ times: [], postsPerDay: 3 }))).toEqual([
      [9, 0],
      [12, 0],
      [15, 0],
    ]);
  });

  test("ignores malformed times and falls back to generated slots", () => {
    expect(
      planSlots(spec({ times: ["tomorrow", "25:00", "9:99"], postsPerDay: 2 })),
    ).toEqual([
      [9, 0],
      [14, 0],
    ]);
  });
});

describe("zonedToUtc", () => {
  test("converts a wall clock time in a zone to UTC", () => {
    expect(zonedToUtc("UTC", 2026, 5, 4, 7, 30)).toBe(
      Date.UTC(2026, 4, 4, 7, 30),
    );
    expect(zonedToUtc("America/New_York", 2026, 1, 15, 9, 0)).toBe(
      Date.UTC(2026, 0, 15, 14, 0),
    );
  });
});

describe("computeNextRun", () => {
  test("fires at the local wall clock time, not UTC", () => {
    const from = Date.UTC(2026, 0, 1, 0, 0);
    const next = computeNextRun(
      spec({ timezone: "America/New_York" }),
      from,
    );
    expect(new Date(next).toISOString()).toBe("2026-01-01T14:00:00.000Z");
    expect(localHHMM(next, "America/New_York")).toBe("09:00");
  });

  test("keeps the local time across the spring-forward DST change", () => {
    // 2026-03-08 02:00 -> 03:00 in New York.
    const from = Date.UTC(2026, 2, 7, 18, 0); // Mar 7, 13:00 EST
    const next = computeNextRun(spec({ timezone: "America/New_York" }), from);
    expect(localHHMM(next, "America/New_York")).toBe("09:00");
    expect(next).toBe(Date.UTC(2026, 2, 8, 13, 0)); // 09:00 EDT
  });

  test("keeps the local time across the fall-back DST change", () => {
    // 2026-11-01 02:00 -> 01:00 in New York.
    const from = Date.UTC(2026, 9, 31, 18, 0); // Oct 31, 14:00 EDT
    const next = computeNextRun(spec({ timezone: "America/New_York" }), from);
    expect(localHHMM(next, "America/New_York")).toBe("09:00");
    expect(next).toBe(Date.UTC(2026, 10, 1, 14, 0)); // 09:00 EST
  });

  test("is always strictly in the future", () => {
    const tz = "Europe/Berlin";
    for (const from of [
      Date.UTC(2026, 0, 1, 8, 0),
      Date.UTC(2026, 0, 31, 23, 59),
      Date.UTC(2026, 6, 15, 12, 30),
    ]) {
      const next = computeNextRun(spec({ timezone: tz, times: ["08:00"] }), from);
      expect(next).toBeGreaterThan(from);
    }
  });

  test("does not re-fire a slot that has already passed", () => {
    // 09:00 EST on Jan 1 is 14:00Z; asking from exactly that instant must
    // return the following day, never the same timestamp.
    const from = Date.UTC(2026, 0, 1, 14, 0);
    const next = computeNextRun(spec({ timezone: "America/New_York" }), from);
    expect(next).toBe(Date.UTC(2026, 0, 2, 14, 0));
  });

  test("weekdays skips the weekend", () => {
    const from = Date.UTC(2026, 0, 3, 12, 0); // Saturday
    const next = computeNextRun(spec({ frequency: "weekdays" }), from);
    expect(new Date(next).getUTCDay()).toBe(1); // Monday
    expect(next).toBe(Date.UTC(2026, 0, 5, 9, 0));
  });

  test("weekly only fires on the configured weekdays", () => {
    const from = Date.UTC(2026, 0, 4, 12, 0); // Sunday Jan 4 2026
    const next = computeNextRun(
      spec({ frequency: "weekly", weekdays: [2] }),
      from,
    );
    expect(new Date(next).getUTCDay()).toBe(2); // Tuesday
    expect(next).toBe(Date.UTC(2026, 0, 6, 9, 0));
  });

  test("falls back to UTC for an invalid timezone instead of throwing", () => {
    const from = Date.UTC(2026, 0, 1, 0, 0);
    expect(() =>
      computeNextRun(spec({ timezone: "Not/AZone" }), from),
    ).not.toThrow();
    expect(computeNextRun(spec({ timezone: "Not/AZone" }), from)).toBe(
      Date.UTC(2026, 0, 1, 9, 0),
    );
  });
});

describe("upcomingRuns", () => {
  test("returns strictly increasing slots inside the requested window", () => {
    const from = Date.UTC(2026, 0, 1, 0, 0);
    const runs = upcomingRuns(spec(), from, 7);
    expect(runs.length).toBe(7);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toBeGreaterThan(runs[i - 1]);
    }
    expect(runs[runs.length - 1]).toBeLessThanOrEqual(from + 7 * DAY);
    expect(runs[0]).toBe(Date.UTC(2026, 0, 1, 9, 0));
  });

  test("emits every slot when a day has multiple posts", () => {
    const from = Date.UTC(2026, 0, 1, 0, 0);
    const runs = upcomingRuns(
      spec({ times: ["09:00", "17:00"], postsPerDay: 2 }),
      from,
      1,
    );
    expect(runs).toEqual([
      Date.UTC(2026, 0, 1, 9, 0),
      Date.UTC(2026, 0, 1, 17, 0),
    ]);
  });
});
