import { query } from "./_generated/server";
import { requireUserId } from "./lib/ctx";

/** One aggregate query powering the Overview page. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const weekAgo = now - 7 * 86_400_000;
    const weekAhead = now + 7 * 86_400_000;

    const [posts, campaigns, accounts, queued, logs, notifications] =
      await Promise.all([
        ctx.db
          .query("posts")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("campaigns")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("platformAccounts")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("publishJobs")
          .withIndex("by_status_run_at", (q) => q.eq("status", "queued"))
          .take(500),
        ctx.db
          .query("jobLogs")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .order("desc")
          .take(12),
        ctx.db
          .query("notifications")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .order("desc")
          .take(20),
      ]);

    const counts = {
      draft: 0,
      approved: 0,
      scheduled: 0,
      publishing: 0,
      published: 0,
      failed: 0,
    };
    let publishedThisWeek = 0;
    for (const p of posts) {
      counts[p.status] = (counts[p.status] ?? 0) + 1;
      if (p.status === "published" && (p.publishedAt ?? 0) >= weekAgo) {
        publishedThisWeek++;
      }
    }

    const upcoming = posts
      .filter(
        (p) =>
          p.scheduledFor !== undefined &&
          p.scheduledFor >= now &&
          p.scheduledFor <= weekAhead &&
          (p.status === "scheduled" || p.status === "publishing"),
      )
      .sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0))
      .slice(0, 6);

    const recentPublished = posts
      .filter((p) => p.status === "published")
      .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
      .slice(0, 5);

    const recentFailed = posts
      .filter((p) => p.status === "failed")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);

    const myQueued = queued.filter((j) => j.userId === userId).length;

    return {
      counts,
      totalPosts: posts.length,
      publishedThisWeek,
      activeCampaigns: campaigns.filter((c) => c.status === "active").length,
      totalCampaigns: campaigns.length,
      connectedAccounts: accounts.filter((a) => a.status === "connected").length,
      accountsNeedingAttention: accounts
        .filter((a) => a.status !== "connected")
        .map((a) => ({ platform: a.platform, status: a.status, lastError: a.lastError })),
      queuedJobs: myQueued,
      upcoming,
      recentPublished,
      recentFailed,
      logs,
      unreadNotifications: notifications.filter((n) => !n.read).length,
    };
  },
});
