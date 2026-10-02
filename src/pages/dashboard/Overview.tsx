import {
  EmptyState,
  Loading,
  PageHeader,
  PlatformGlyph,
  StatCard,
  StatusBadge,
} from "@/components/dashboard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { formatRelative } from "@/lib/format";
import { useAction, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

export default function Overview() {
  const data = useQuery(api.dashboard.overview);
  const collectAnalytics = useAction(api.publish.collectAnalytics);
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);

  if (data === undefined) return <Loading label="Loading workspace…" />;

  const syncAnalytics = async () => {
    setSyncing(true);
    try {
      const res = await collectAnalytics({ limit: 50 });
      toast("Analytics synced", {
        description: `${res.checked} post(s) checked · ${res.updated} updated · ${res.unavailable} unavailable from the platform API.`,
      });
    } catch (err) {
      toast.error("Could not sync analytics", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <motion.div {...fade} className="space-y-8">
      <PageHeader
        title="Overview"
        description="Everything being generated, queued and published on your behalf."
        actions={
          <>
            <Button variant="outline" onClick={syncAnalytics} disabled={syncing}>
              <RefreshCw className={syncing ? "size-4 animate-spin" : "size-4"} />
              Sync analytics
            </Button>
            <Button onClick={() => navigate("/dashboard/automations")}>
              <Plus className="size-4" />
              New automation
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Published this week"
          value={data.publishedThisWeek}
          hint={`${data.counts.published} published all-time`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Scheduled"
          value={data.counts.scheduled}
          hint={`${data.queuedJobs} in the publish queue`}
          icon={CalendarClock}
        />
        <StatCard
          label="Awaiting approval"
          value={data.counts.draft}
          hint="Drafts ready for review"
          icon={FileText}
        />
        <StatCard
          label="Needs attention"
          value={data.counts.failed}
          hint="Failed publishes to review"
          icon={AlertTriangle}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/70 shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-primary" />
              Upcoming publishes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nothing scheduled yet"
                description="Create an automation and your calendar will fill itself with platform-specific posts."
                action={
                  <Button onClick={() => navigate("/dashboard/automations")}>
                    <Sparkles className="size-4" />
                    Create an automation
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border/70">
                {data.upcoming.map((post) => (
                  <li key={post._id} className="flex items-start gap-3 py-3 first:pt-0">
                    <PlatformGlyph platform={post.platform} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {post.title ?? post.caption.slice(0, 80)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatRelative(post.scheduledFor)} ·{" "}
                        {post.contentPillar ?? "General"}
                      </p>
                    </div>
                    <StatusBadge status={post.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-primary" />
              Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No activity yet. The automation worker logs every generation and
                publish here.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.logs.map((log) => (
                  <li key={log._id} className="flex gap-2.5">
                    <span
                      className={
                        "mt-1.5 size-1.5 shrink-0 rounded-full " +
                        (log.level === "error"
                          ? "bg-red-500"
                          : log.level === "warn"
                            ? "bg-amber-500"
                            : "bg-emerald-500")
                      }
                    />
                    <div className="min-w-0">
                      <p className="text-xs leading-5 text-foreground/90">
                        {log.message}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatRelative(log.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              Automations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold tracking-tight">
              {data.activeCampaigns}
              <span className="ml-1 text-sm font-medium text-muted-foreground">
                active
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {data.totalCampaigns} total automations configured.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/dashboard/automations")}
            >
              Manage automations
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRoundCheck className="size-4 text-primary" />
              Connected accounts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-bold tracking-tight">
              {data.connectedAccounts}
            </p>
            {data.accountsNeedingAttention.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No accounts connected yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {data.accountsNeedingAttention.map((a) => (
                  <Badge key={a.platform} variant="outline" className="capitalize">
                    {a.platform} · {a.status.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/dashboard/accounts")}
            >
              Connect a platform
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="size-4 text-primary" />
              Recently published
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentPublished.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Published posts will appear here.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.recentPublished.map((post) => (
                  <li key={post._id} className="flex items-center gap-3">
                    <PlatformGlyph platform={post.platform} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {post.title ?? post.caption.slice(0, 60)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatRelative(post.publishedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
