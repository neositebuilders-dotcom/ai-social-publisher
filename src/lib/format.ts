export function formatDateTime(ms: number | undefined, tz?: string): string {
  if (!ms) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz || undefined,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function formatDate(ms: number | undefined, tz?: string): string {
  if (!ms) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz || undefined,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

export function formatTime(ms: number | undefined, tz?: string): string {
  if (!ms) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz || undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function formatRelative(ms: number | undefined): string {
  if (!ms) return "—";
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1000],
  ];
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (abs >= size || unit === "second") {
      return rtf.format(Math.round(diff / size), unit);
    }
  }
  return "now";
}

export function formatNumber(value: number | undefined): string {
  if (value === undefined || value === null) return "—";
  if (Math.abs(value) >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(value) >= 10_000)
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return new Intl.NumberFormat("en-US").format(value);
}

export const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];
