import {
  EmptyState,
  Loading,
  PageHeader,
  PlatformGlyph,
  StatCard,
} from "@/components/dashboard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { api } from "@/convex/_generated/api";
import { formatNumber, formatRelative } from "@/lib/format";
import { useAction, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { BarChart3, Eye, Heart, MessageCircle, MousePointerClick, RefreshCw } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

export default function Analytics() {
  const summary = useQuery(api.analytics.summary);
  const collect = useAction(api.publish.collectAnalytics);
  const [syncing, setSyncing] = useState(false);

  if (summary === undefined) return <Loading label="Loading analytics…" />;

  const rows = Object.entries(summary.byPlatform).map(([platform, v]) => ({
    platform,
    impressions: v.impressions,
    likes: v.likes,
    comments: v.comments,
    views: v.views,
  }));

  const unavailable = Object.entries(summary.byPlatform).filter(
    ([, v]) => v.unavailable > 0 && v.impressions + v.likes + v.views === 0,
  );

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await collect({ limit: 50 });
      toast("Analytics synced", {
        description: `${res.updated} updated · ${res.unavailable} unavailable from the platform API.`,
      });
    } catch (err) {
      toast.error("Sync failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <PageHeader
        title="Analytics"
        description="Metrics are pulled from each platform's official API where one exists. Platforms without a public metrics endpoint are listed as unavailable instead of being estimated."
        actions={
          <Button variant="outline" onClick={sync} disabled={syncing}>
            <RefreshCw className={syncing ? "size-4 animate-spin" : "size-4"} />
            Sync now
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Impressions"
          value={formatNumber(summary.totals.impressions)}
          icon={BarChart3}
        />
        <StatCard label="Likes" value={formatNumber(summary.totals.likes)} icon={Heart} />
        <StatCard
          label="Comments"
          value={formatNumber(summary.totals.comments)}
          icon={MessageCircle}
        />
        <StatCard
          label="Clicks"
          value={formatNumber(summary.totals.clicks)}
          icon={MousePointerClick}
        />
      </div>

      <Card className="border-border/70 shadow-none">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">Engagement by platform</CardTitle>
          <Badge variant="secondary">
            {summary.tracked} post(s) tracked
          </Badge>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={Eye}
              title="No metrics collected yet"
              description="Once a post publishes successfully through a connected account, its metrics are collected automatically."
            />
          ) : (
            <ChartContainer
              config={{
                impressions: { label: "Impressions", color: "var(--chart-1)" },
                likes: { label: "Likes", color: "var(--chart-2)" },
                comments: { label: "Comments", color: "var(--chart-4)" },
              }}
              className="h-72 w-full"
            >
              <BarChart data={rows} margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="platform" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={44} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="impressions" fill="var(--color-impressions)" radius={6} />
                <Bar dataKey="likes" fill="var(--color-likes)" radius={6} />
                <Bar dataKey="comments" fill="var(--color-comments)" radius={6} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Per-platform breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Nothing tracked yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {rows.map((row) => (
                  <li key={row.platform} className="flex items-center gap-3">
                    <PlatformGlyph platform={row.platform} size="sm" />
                    <span className="flex-1 text-sm font-medium capitalize">
                      {row.platform}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatNumber(row.impressions)} impressions ·{" "}
                      {formatNumber(row.likes)} likes
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">API availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {unavailable.length === 0 ? (
              <p>
                All tracked platforms returned metrics through their public API on
                the last sync
                {summary.lastCollectedAt
                  ? ` (${formatRelative(summary.lastCollectedAt)})`
                  : ""}
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {unavailable.map(([platform]) => (
                  <li key={platform} className="flex items-center gap-2">
                    <PlatformGlyph platform={platform} size="sm" />
                    <span className="capitalize">{platform}</span>
                    <Badge variant="outline">Metrics unavailable via API</Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs">
              LinkedIn requires approved marketing/partner scopes for
              organization-level metrics, so member posts report as unavailable.
            </p>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
