/**
 * Timezone-aware scheduling math.
 *
 * Convex stores timestamps in UTC. Campaigns are authored in a human timezone
 * ("America/New_York", "Europe/Berlin"), so every schedule calculation runs
 * through the IANA zone and converts back to UTC.
 *
 * No third-party timezone library: `Intl.DateTimeFormat` is available in the
 * Convex runtime and is all we need.
 */

export type Frequency = "daily" | "weekdays" | "weekly" | "custom";

export interface ScheduleSpec {
  frequency: Frequency;
  times: string[]; // "HH:MM" in the campaign timezone
  weekdays?: number[]; // 0=Sun .. 6=Sat
  postsPerDay: number;
  timezone: string;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0-6
}

function partsInTz(tz: string, ms: number): LocalParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz || "UTC",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ms))) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: Math.max(0, WEEKDAY_NAMES.indexOf(map.weekday)),
  };
}

/** Offset (ms) such that `utc = localWallClock - offset`. */
function tzOffsetMs(tz: string, ms: number): number {
  const p = partsInTz(tz, ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - ms;
}

/** Convert a wall-clock time in `tz` to a UTC timestamp. */
export function zonedToUtc(
  tz: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset = tzOffsetMs(tz, guess);
  return guess - offset;
}

/** Human-readable local time for display. */
export function formatInTz(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz || "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

/** "HH:MM" parts, validated and sorted. */
function normalizeTimes(times: string[]): [number, number][] {
  const parsed = times
    .map((t) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
      if (!m) return null;
      const h = Number(m[1]);
      const mi = Number(m[2]);
      if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
      return [h, mi] as [number, number];
    })
    .filter((v): v is [number, number] => v !== null)
    .sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  return parsed;
}

/**
 * The times a campaign should post at. If the user gave explicit times we use
 * them; otherwise we spread `postsPerDay` slots across the working day
 * starting at 09:00 local.
 */
export function planSlots(spec: ScheduleSpec): [number, number][] {
  const explicit = normalizeTimes(spec.times);
  if (explicit.length > 0) {
    return explicit.slice(0, Math.max(1, spec.postsPerDay));
  }
  const count = Math.max(1, Math.min(24, spec.postsPerDay));
  const startHour = 9;
  const gap = Math.max(1, Math.floor(10 / count));
  const slots: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const h = (startHour + i * gap) % 24;
    slots.push([h, 0]);
  }
  return slots;
}

function dayAllowed(spec: ScheduleSpec, weekday: number): boolean {
  switch (spec.frequency) {
    case "daily":
      return true;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "weekly":
    case "custom": {
      const days = spec.weekdays?.length ? spec.weekdays : [1, 3, 5];
      return days.includes(weekday);
    }
  }
}

/**
 * The next UTC timestamp strictly after `from` at which this schedule fires.
 * Searches up to 60 days ahead so sparse weekly schedules still resolve.
 */
export function computeNextRun(spec: ScheduleSpec, from: number): number {
  const tz = isValidTimezone(spec.timezone) ? spec.timezone : "UTC";
  const slots = planSlots({ ...spec, timezone: tz });
  const start = partsInTz(tz, from);
  const localMidnight = Date.UTC(start.year, start.month - 1, start.day);

  for (let i = 0; i < 60; i++) {
    const d = new Date(localMidnight + i * DAY_MS);
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const wd = d.getUTCDay();
    if (!dayAllowed({ ...spec, timezone: tz }, wd)) continue;
    for (const [h, mi] of slots) {
      const utc = zonedToUtc(tz, y, mo, day, h, mi);
      if (utc > from) return utc;
    }
  }
  return from + DAY_MS;
}

/** All upcoming run timestamps for the next `days` days (bounded). */
export function upcomingRuns(
  spec: ScheduleSpec,
  from: number,
  days = 14,
): number[] {
  const out: number[] = [];
  let cursor = from;
  for (let i = 0; i < days * Math.max(1, spec.postsPerDay); i++) {
    const next = computeNextRun(spec, cursor);
    if (next > from + days * DAY_MS) break;
    out.push(next);
    cursor = next;
  }
  return out;
}
