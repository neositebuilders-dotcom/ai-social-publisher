import {
  EmptyState,
  Loading,
  PageHeader,
  PlatformGlyph,
  StatusBadge,
} from "@/components/dashboard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

export default function Calendar() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const range = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month));
    const gridEnd = endOfWeek(endOfMonth(month));
    return { gridStart, gridEnd };
  }, [month]);

  const posts = useQuery(api.posts.calendar, {
    from: range.gridStart.getTime(),
    to: range.gridEnd.getTime(),
  });

  const days = useMemo(
    () =>
      eachDayOfInterval({ start: range.gridStart, end: range.gridEnd }),
    [range],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, typeof posts>();
    for (const post of posts ?? []) {
      const key = format(new Date(post.scheduledFor ?? 0), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(post);
      map.set(key, list);
    }
    return map;
  }, [posts]);

  const monthPosts = (posts ?? []).filter(
    (p) => p.scheduledFor && isSameMonth(new Date(p.scheduledFor), month),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <PageHeader
        title="Content calendar"
        description="Everything currently queued, laid out in your workspace timezone."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous month"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Badge variant="secondary" className="px-3 py-1.5">
              {format(month, "MMMM yyyy")}
            </Badge>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next month"
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />

      {posts === undefined ? (
        <Loading label="Loading calendar…" />
      ) : monthPosts.length === 0 && posts.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled this month"
          description="Approve a draft or run an automation in autopilot to fill the calendar."
        />
      ) : (
        <>
          <Card className="border-border/70 shadow-none">
            <CardContent className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-7 gap-1.5 pb-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div
                      key={d}
                      className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {days.map((day) => {
                    const key = format(day, "yyyy-MM-dd");
                    const dayPosts = byDay.get(key) ?? [];
                    const inMonth = isSameMonth(day, month);
                    return (
                      <div
                        key={key}
                        className={cn(
                          "min-h-24 rounded-lg border p-2",
                          inMonth
                            ? "border-border/70 bg-card"
                            : "border-transparent bg-muted/30",
                          isToday(day) && "border-primary/40",
                        )}
                      >
                        <span
                          className={cn(
                            "text-xs font-medium",
                            inMonth
                              ? "text-foreground"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        <div className="mt-1.5 space-y-1">
                          {dayPosts.slice(0, 3).map((post) => (
                            <div
                              key={post._id}
                              className="flex items-center gap-1.5 rounded-md bg-muted/60 px-1.5 py-1"
                              title={post.caption}
                            >
                              <PlatformGlyph
                                platform={post.platform}
                                size="sm"
                                className="size-5 border-0 bg-transparent"
                              />
                              <span className="truncate text-[10px] font-medium">
                                {formatTime(post.scheduledFor)}
                              </span>
                            </div>
                          ))}
                          {dayPosts.length > 3 ? (
                            <span className="block text-[10px] text-muted-foreground">
                              +{dayPosts.length - 3} more
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">
                Scheduled in {format(month, "MMMM")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monthPosts.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No posts scheduled this month.
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {monthPosts
                    .sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0))
                    .map((post) => (
                      <li
                        key={post._id}
                        className="flex items-center gap-3 py-3 first:pt-0"
                      >
                        <PlatformGlyph platform={post.platform} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {post.title ?? post.caption.slice(0, 70)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(post.scheduledFor)}
                          </p>
                        </div>
                        <StatusBadge status={post.status} />
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </motion.div>
  );
}
