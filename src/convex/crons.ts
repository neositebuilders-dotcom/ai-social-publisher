import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Heartbeat: generation + queue drain. Convex crons resolve to one minute.
crons.interval(
  "automation worker",
  { minutes: 1 },
  internal.scheduler.tick,
  {},
);

// Daily analytics refresh for published posts (03:00 UTC).
crons.daily(
  "analytics sync",
  { hourUTC: 3, minuteUTC: 0 },
  internal.publish.collectAllAnalytics,
  { limit: 100 },
);

export default crons;
