import {
  EmptyState,
  Loading,
  PageHeader,
  PlatformGlyph,
  StatusBadge,
  ValidatorRow,
} from "@/components/dashboard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  Check,
  ExternalLink,
  FileText,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Status = "draft" | "scheduled" | "published";

const COPY: Record<Status, { title: string; description: string }> = {
  draft: {
    title: "Drafts",
    description:
      "AI-generated content waiting for your review. Approval mode stops here.",
  },
  scheduled: {
    title: "Scheduled posts",
    description:
      "Queued in the worker with a timezone-aware run time. Duplicate publishing is prevented by an idempotent job key.",
  },
  published: {
    title: "Published posts",
    description:
      "Live posts with their platform IDs, links and the latest metrics collected from each API.",
  },
};

function localInputValue(ms: number): string {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

function EditDialog({
  post,
  open,
  onOpenChange,
}: {
  post: Doc<"posts">;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const update = useMutation(api.posts.updateDraft);
  const [title, setTitle] = useState(post.title ?? "");
  const [caption, setCaption] = useState(post.caption);
  const [hashtags, setHashtags] = useState(post.hashtags.join(" "));
  const [mediaUrl, setMediaUrl] = useState(post.mediaUrl ?? "");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
          <DialogDescription>
            Saved text is re-validated against {post.platform} limits immediately.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caption">Caption</Label>
            <Textarea
              id="caption"
              rows={6}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hashtags">Hashtags</Label>
            <Input
              id="hashtags"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="media">Media URL</Label>
            <Input
              id="media"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await update({
                  postId: post._id,
                  title,
                  caption,
                  hashtags: hashtags.split(/[\s,]+/).filter(Boolean),
                  mediaUrl: mediaUrl || undefined,
                });
                toast.success("Post updated");
                onOpenChange(false);
              } catch (err) {
                toast.error("Update failed", {
                  description: err instanceof Error ? err.message : "Unknown error",
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({
  post,
  open,
  onOpenChange,
}: {
  post: Doc<"posts">;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const approve = useMutation(api.posts.approve);
  const [when, setWhen] = useState(
    localInputValue(post.scheduledFor ?? Date.now() + 60 * 60 * 1000),
  );
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve &amp; schedule</DialogTitle>
          <DialogDescription>
            Picks a run time for {post.platform}. The worker will publish it then.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="when">Publish at (your local time)</Label>
          <Input
            id="when"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await approve({
                  postId: post._id,
                  scheduledFor: new Date(when).getTime(),
                });
                toast.success("Scheduled");
                onOpenChange(false);
              } catch (err) {
                toast.error("Could not schedule", {
                  description: err instanceof Error ? err.message : "Unknown error",
                });
              } finally {
                setSaving(false);
              }
            }}
          >
            <CalendarClock className="size-4" />
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PostCard({
  post,
  status,
}: {
  post: Doc<"posts">;
  status: Status;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const publishNow = useAction(api.publish.publishNow);
  const retry = useMutation(api.posts.retry);
  const discard = useMutation(api.posts.discard);
  const analytics = useQuery(api.analytics.forPost, { postId: post._id });
  const [busy, setBusy] = useState(false);

  const metrics = analytics?.[0];

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <PlatformGlyph platform={post.platform} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {post.title ?? post.caption.slice(0, 70)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {post.contentPillar ? `${post.contentPillar} · ` : ""}
                {status === "published"
                  ? `published ${formatDateTime(post.publishedAt)}`
                  : post.scheduledFor
                    ? `scheduled ${formatDateTime(post.scheduledFor)}`
                    : `created ${formatDateTime(post.createdAt)}`}
                {post.aiProvider ? ` · ${post.aiProvider}` : ""}
              </p>
            </div>
          </div>
          <StatusBadge status={post.status} />
        </div>

        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
          {post.caption}
        </p>
        {post.hashtags.length ? (
          <p className="text-xs text-primary">{post.hashtags.join(" ")}</p>
        ) : null}

        {post.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {post.error}
          </p>
        ) : null}

        <ValidatorRow issues={post.validation} />

        {metrics ? (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>Impressions {formatNumber(metrics.metrics.impressions)}</span>
            <span>Likes {formatNumber(metrics.metrics.likes)}</span>
            <span>Comments {formatNumber(metrics.metrics.comments)}</span>
            <span>Views {formatNumber(metrics.metrics.views)}</span>
            {metrics.source === "unavailable" ? (
              <Badge variant="outline">Metrics unavailable via API</Badge>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {status === "draft" ? (
            <>
              <Button size="sm" onClick={() => setApproveOpen(true)}>
                <Check className="size-4" />
                Approve &amp; schedule
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Edit
              </Button>
            </>
          ) : null}

          {status !== "published" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await publishNow({ postId: post._id });
                  if (res.ok) toast.success("Publish attempted successfully");
                  else
                    toast.error("Publish failed", {
                      description: res.error ?? "See the activity log for details.",
                    });
                } catch (err) {
                  toast.error("Publish failed", {
                    description: err instanceof Error ? err.message : "Unknown error",
                  });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Send className="size-4" />
              Publish now
            </Button>
          ) : null}

          {post.status === "failed" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await retry({ postId: post._id });
                toast.success("Re-queued for publishing");
              }}
            >
              <RotateCcw className="size-4" />
              Retry
            </Button>
          ) : null}

          {post.platformPostUrl ? (
            <a
              href={post.platformPostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              View post <ExternalLink className="size-3" />
            </a>
          ) : null}

          {status !== "published" ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                await discard({ postId: post._id });
                toast.success("Post discarded");
              }}
            >
              <Trash2 className="size-4" />
              Discard
            </Button>
          ) : null}
        </div>
      </CardContent>

      {editOpen ? (
        <EditDialog post={post} open={editOpen} onOpenChange={setEditOpen} />
      ) : null}
      {approveOpen ? (
        <ApproveDialog post={post} open={approveOpen} onOpenChange={setApproveOpen} />
      ) : null}
    </Card>
  );
}

export default function Posts({ status }: { status: Status }) {
  const posts = useQuery(api.posts.list, { status, limit: 150 });
  const copy = COPY[status];

  if (posts === undefined) return <Loading label={`Loading ${copy.title.toLowerCase()}…`} />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={<Badge variant="secondary">{posts.length} posts</Badge>}
      />

      {posts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={`No ${copy.title.toLowerCase()}`}
          description={
            status === "draft"
              ? "Run an automation in approval mode and drafts will show up here."
              : status === "scheduled"
                ? "Approve a draft or switch an automation to autopilot to fill the queue."
                : "Published posts will appear here once a connected account accepts them."
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post._id} post={post} status={status} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

