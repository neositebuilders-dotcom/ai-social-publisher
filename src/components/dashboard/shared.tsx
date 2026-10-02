import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Facebook,
  FileText,
  Instagram,
  Linkedin,
  Loader2,
  Music2,
  Radio,
  Send,
  Sparkles,
  Twitter,
  XCircle,
  Youtube,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export const PLATFORM_ICONS: Record<string, LucideIcon> = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  linkedin: Linkedin,
  tiktok: Music2,
  x: Twitter,
  picsart: Sparkles,
};

export const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C",
  facebook: "#1877F2",
  youtube: "#FF0000",
  linkedin: "#0A66C2",
  tiktok: "#00B8B0",
  x: "#4B5563",
  picsart: "#C209C1",
};

export function PlatformGlyph({
  platform,
  className,
  size = "md",
}: {
  platform: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const Icon = PLATFORM_ICONS[platform] ?? Sparkles;
  const color = PLATFORM_COLORS[platform] ?? "currentColor";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card",
        size === "sm" ? "size-7" : "size-9",
        className,
      )}
      style={{ color }}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
    </span>
  );
}

type Status =
  | "draft"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

const STATUS_META: Record<
  Status,
  { label: string; className: string; icon: LucideIcon }
> = {
  draft: {
    label: "Draft",
    className: "border-border bg-muted text-muted-foreground",
    icon: FileText,
  },
  approved: {
    label: "Approved",
    className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300",
    icon: CheckCircle2,
  },
  scheduled: {
    label: "Scheduled",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300",
    icon: Clock,
  },
  publishing: {
    label: "Publishing",
    className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
    icon: Loader2,
  },
  published: {
    label: "Published",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
    icon: Send,
  },
  failed: {
    label: "Failed",
    className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
    icon: XCircle,
  },
};

export function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 rounded-full font-medium", meta.className)}
    >
      <Icon
        className={cn("size-3", status === "publishing" && "animate-spin")}
      />
      {meta.label}
    </Badge>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
          {hint ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" />
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Radio,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card/50 px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 font-semibold tracking-tight">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function ValidatorRow({
  issues,
}: {
  issues: Array<{ level: "error" | "warning"; code: string; message: string }>;
}) {
  if (!issues.length) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        Passes platform validation
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {issues.map((issue) => (
        <li
          key={`${issue.code}-${issue.message}`}
          className={cn(
            "flex items-start gap-1.5 text-xs",
            issue.level === "error"
              ? "text-red-600 dark:text-red-400"
              : "text-amber-600 dark:text-amber-400",
          )}
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function RequirementChip({
  status,
  label,
}: {
  status: "available" | "approval_required" | "quota" | "paid" | "unavailable";
  label: string;
}) {
  const map = {
    available: {
      text: "Available",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
    },
    approval_required: {
      text: "Approval required",
      className:
        "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
    },
    quota: {
      text: "Quota",
      className:
        "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300",
    },
    paid: {
      text: "Paid",
      className:
        "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300",
    },
    unavailable: {
      text: "Unavailable",
      className:
        "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
    },
  } as const;
  const meta = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        meta.className,
      )}
    >
      {meta.text}
      <span className="sr-only">: {label}</span>
    </span>
  );
}
