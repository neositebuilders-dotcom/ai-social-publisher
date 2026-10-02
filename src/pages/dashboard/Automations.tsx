import {
  EmptyState,
  Loading,
  PageHeader,
  PlatformGlyph,
} from "@/components/dashboard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { COMMON_TIMEZONES, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Pause, Pencil, Play, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PlatformId =
  | "instagram"
  | "facebook"
  | "youtube"
  | "linkedin"
  | "tiktok"
  | "x"
  | "picsart";
type ContentType = "text" | "image" | "carousel" | "story" | "short_video";

const CONTENT_TYPES: { id: ContentType; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "carousel", label: "Carousel" },
  { id: "story", label: "Story" },
  { id: "short_video", label: "Short video" },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface FormState {
  name: string;
  business: string;
  instructions: string;
  platforms: PlatformId[];
  contentTypes: ContentType[];
  frequency: "daily" | "weekdays" | "weekly" | "custom";
  postsPerDay: number;
  times: string;
  weekdays: number[];
  timezone: string;
  mode: "approval" | "autopilot";
  autoPublish: boolean;
  brandVoice: string;
  audience: string;
  topics: string;
  contentPillars: string;
  bannedWords: string;
  hashtagPrefs: string;
  ctaPrefs: string;
  platformInstructions: Record<string, string>;
}

const EMPTY: FormState = {
  name: "",
  business: "",
  instructions:
    "Promote the product with a clear benefit, avoid repeating previous angles, and end with a CTA.",
  platforms: ["linkedin", "x"],
  contentTypes: ["text", "image"],
  frequency: "daily",
  postsPerDay: 1,
  times: "09:00",
  weekdays: [1, 3, 5],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  mode: "approval",
  autoPublish: false,
  brandVoice: "",
  audience: "",
  topics: "",
  contentPillars: "",
  bannedWords: "",
  hashtagPrefs: "",
  ctaPrefs: "",
  platformInstructions: {},
};

function toList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function fromCampaign(c: Doc<"campaigns">): FormState {
  return {
    name: c.name,
    business: c.business,
    instructions: c.instructions,
    platforms: c.platforms as PlatformId[],
    contentTypes: c.contentTypes as ContentType[],
    frequency: c.frequency as FormState["frequency"],
    postsPerDay: c.postsPerDay,
    times: c.times.join(", "),
    weekdays: c.weekdays ?? [1, 3, 5],
    timezone: c.timezone,
    mode: c.mode,
    autoPublish: c.autoPublish,
    brandVoice: c.brandVoice ?? "",
    audience: c.audience ?? "",
    topics: c.topics.join(", "),
    contentPillars: c.contentPillars.join(", "),
    bannedWords: c.bannedWords.join(", "),
    hashtagPrefs: c.hashtagPrefs ?? "",
    ctaPrefs: c.ctaPrefs ?? "",
    platformInstructions: Object.fromEntries(
      c.platformInstructions.map((p) => [p.platform, p.instructions]),
    ),
  };
}

function ToggleRow<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: { id: T; label: string; icon?: React.ReactNode }[];
  selected: T[];
  onToggle: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onToggle(opt.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function AutomationDialog({
  campaign,
  open,
  onOpenChange,
}: {
  campaign?: Doc<"campaigns">;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const catalog = useQuery(api.platforms.catalog);
  const create = useMutation(api.campaigns.create);
  const update = useMutation(api.campaigns.update);
  const [form, setForm] = useState<FormState>(
    campaign ? fromCampaign(campaign) : EMPTY,
  );
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggle = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Give the automation a name.");
    if (!form.business.trim())
      return toast.error("Tell the AI what the business or product is.");
    if (!form.platforms.length) return toast.error("Select at least one platform.");

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        business: form.business,
        instructions: form.instructions,
        platforms: form.platforms,
        contentTypes: form.contentTypes,
        frequency: form.frequency,
        postsPerDay: form.postsPerDay,
        times: toList(form.times),
        weekdays: form.weekdays,
        timezone: form.timezone,
        mode: form.mode,
        autoPublish: form.mode === "autopilot" ? form.autoPublish : false,
        status: "active" as const,
        brandVoice: form.brandVoice || undefined,
        audience: form.audience || undefined,
        topics: toList(form.topics),
        contentPillars: toList(form.contentPillars),
        bannedWords: toList(form.bannedWords),
        hashtagPrefs: form.hashtagPrefs || undefined,
        ctaPrefs: form.ctaPrefs || undefined,
        platformInstructions: form.platforms
          .filter((p) => (form.platformInstructions[p] ?? "").trim())
          .map((p) => ({
            platform: p,
            instructions: form.platformInstructions[p].trim(),
          })),
      };

      if (campaign) {
        await update({ campaignId: campaign._id, ...payload });
        toast.success("Automation updated");
      } else {
        await create(payload);
        toast.success("Automation created", {
          description:
            form.mode === "autopilot"
              ? "Autopilot is on — content will generate and publish on schedule."
              : "It will fill your drafts for approval.",
        });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not save", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {campaign ? "Edit automation" : "New AI automation"}
          </DialogTitle>
          <DialogDescription>
            Each automation generates platform-specific content, validates it
            against every network&apos;s rules, then schedules it in your timezone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Automation name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Daily SaaS promotion"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="business">Business / product / topic</Label>
              <Input
                id="business"
                value={form.business}
                onChange={(e) => set("business", e.target.value)}
                placeholder="Nimbus Analytics — product analytics for small teams"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instructions">Campaign instructions</Label>
            <Textarea
              id="instructions"
              rows={3}
              value={form.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              placeholder="Every day, create promotional content… keep LinkedIn professional, X short and engaging…"
            />
          </div>

          <div className="space-y-2">
            <Label>Platforms</Label>
            <ToggleRow
              options={(catalog ?? []).map((p) => ({
                id: p.id as PlatformId,
                label: p.label,
                icon: <PlatformGlyph platform={p.id} size="sm" className="size-5 border-0" />,
              }))}
              selected={form.platforms}
              onToggle={(id) => set("platforms", toggle(form.platforms, id))}
            />
          </div>

          <div className="space-y-2">
            <Label>Content types</Label>
            <ToggleRow
              options={CONTENT_TYPES}
              selected={form.contentTypes}
              onToggle={(id) => set("contentTypes", toggle(form.contentTypes, id))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.frequency}
                onChange={(e) =>
                  set("frequency", e.target.value as FormState["frequency"])
                }
              >
                <option value="daily">Every day</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly</option>
                <option value="custom">Custom days</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ppd">Posts per day</Label>
              <Input
                id="ppd"
                type="number"
                min={1}
                max={12}
                value={form.postsPerDay}
                onChange={(e) => set("postsPerDay", Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={form.timezone}
                onChange={(e) => set("timezone", e.target.value)}
              >
                {[form.timezone, ...COMMON_TIMEZONES.filter((t) => t !== form.timezone)].map(
                  (tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="times">Posting times (HH:MM, comma separated)</Label>
              <Input
                id="times"
                value={form.times}
                onChange={(e) => set("times", e.target.value)}
                placeholder="09:00, 13:30, 18:00"
              />
              <p className="text-xs text-muted-foreground">
                Local to the timezone above. Up to {form.postsPerDay} slots are used.
              </p>
            </div>
            {form.frequency === "weekly" || form.frequency === "custom" ? (
              <div className="space-y-1.5">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day, index) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => set("weekdays", toggle(form.weekdays, index))}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-xs font-medium",
                        form.weekdays.includes(index)
                          ? "border-primary/40 bg-accent text-accent-foreground"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Autopilot</Label>
                <p className="text-xs text-muted-foreground">
                  Generate → validate → schedule → publish with no review.
                </p>
              </div>
              <Switch
                checked={form.mode === "autopilot"}
                onCheckedChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    mode: v ? "autopilot" : "approval",
                    autoPublish: v,
                  }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {form.mode === "autopilot"
                ? "Autopilot is on. Content still passes platform validation before it is queued."
                : "Approval mode: posts land in Drafts until you approve them."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="voice">Brand voice</Label>
              <Input
                id="voice"
                value={form.brandVoice}
                onChange={(e) => set("brandVoice", e.target.value)}
                placeholder="Confident, plain-spoken, no jargon"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audience">Target audience</Label>
              <Input
                id="audience"
                value={form.audience}
                onChange={(e) => set("audience", e.target.value)}
                placeholder="Indie founders and marketing leads"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topics">Topics</Label>
              <Input
                id="topics"
                value={form.topics}
                onChange={(e) => set("topics", e.target.value)}
                placeholder="Automation, analytics, growth"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pillars">Content pillars</Label>
              <Input
                id="pillars"
                value={form.contentPillars}
                onChange={(e) => set("contentPillars", e.target.value)}
                placeholder="Education, Product, Story"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="banned">Banned topics / words</Label>
              <Input
                id="banned"
                value={form.bannedWords}
                onChange={(e) => set("bannedWords", e.target.value)}
                placeholder="guarantee, cheapest"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hashtags">Hashtag preferences</Label>
              <Input
                id="hashtags"
                value={form.hashtagPrefs}
                onChange={(e) => set("hashtagPrefs", e.target.value)}
                placeholder="#buildinpublic #saas"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cta">CTA preferences</Label>
              <Input
                id="cta"
                value={form.ctaPrefs}
                onChange={(e) => set("ctaPrefs", e.target.value)}
                placeholder="Start a free trial"
              />
            </div>
          </div>

          {form.platforms.length ? (
            <div className="space-y-3 rounded-xl border border-border/70 p-4">
              <Label>Platform-specific instructions</Label>
              {form.platforms.map((p) => (
                <div key={p} className="flex items-start gap-3">
                  <PlatformGlyph platform={p} size="sm" />
                  <Textarea
                    rows={2}
                    className="flex-1"
                    value={form.platformInstructions[p] ?? ""}
                    onChange={(e) =>
                      set("platformInstructions", {
                        ...form.platformInstructions,
                        [p]: e.target.value,
                      })
                    }
                    placeholder={`How should ${p} posts read?`}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : campaign ? "Save changes" : "Create automation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Automations() {
  const campaigns = useQuery(api.campaigns.list);
  const setStatus = useMutation(api.campaigns.setStatus);
  const remove = useMutation(api.campaigns.remove);
  const generate = useAction(api.ai.generateForCampaign);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"campaigns"> | undefined>();
  const [running, setRunning] = useState<string | null>(null);

  if (campaigns === undefined) return <Loading label="Loading automations…" />;

  const runNow = async (campaignId: Id<"campaigns">, name: string) => {
    setRunning(campaignId);
    try {
      const res = await generate({ campaignId });
      toast.success(`Generated ${res.created} post(s) for "${name}"`, {
        description: `${res.scheduled} scheduled · ${res.blocked} blocked by validation · via ${res.provider}`,
      });
    } catch (err) {
      toast.error("Generation failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setRunning(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <PageHeader
        title="AI automations"
        description="Reusable campaigns. Each one reads your brief, remembers what it has already published, and produces fresh platform-native content every run."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
            New automation
          </Button>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No automations yet"
          description="Describe what you sell and how you want to sound. AI Social Publisher handles the rest, on your schedule."
          action={
            <Button
              onClick={() => {
                setEditing(undefined);
                setDialogOpen(true);
              }}
            >
              <Sparkles className="size-4" />
              Create your first automation
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {campaigns.map((campaign) => (
            <Card key={campaign._id} className="border-border/70 shadow-none">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {campaign.name}
                    </CardTitle>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {campaign.business}
                    </p>
                  </div>
                  <Badge
                    variant={campaign.status === "active" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {campaign.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {campaign.platforms.map((p) => (
                    <PlatformGlyph key={p} platform={p} size="sm" />
                  ))}
                  <Badge variant="outline" className="capitalize">
                    {campaign.mode}
                  </Badge>
                  <Badge variant="outline">
                    {campaign.postsPerDay}/day · {campaign.times.join(", ")}
                  </Badge>
                  <Badge variant="outline">{campaign.timezone}</Badge>
                </div>

                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {campaign.instructions}
                </p>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Next run: {formatRelative(campaign.nextRunAt)} ({campaign.timezone})
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={running === campaign._id}
                    onClick={() => runNow(campaign._id, campaign.name)}
                  >
                    <Zap className="size-4" />
                    {running === campaign._id ? "Generating…" : "Generate now"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setStatus({
                        campaignId: campaign._id,
                        status: campaign.status === "active" ? "paused" : "active",
                      })
                    }
                  >
                    {campaign.status === "active" ? (
                      <>
                        <Pause className="size-4" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="size-4" /> Activate
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(campaign);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      await remove({ campaignId: campaign._id });
                      toast.success("Automation deleted");
                    }}
                  >
                    <Trash2 className="size-4" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialogOpen ? (
        <AutomationDialog
          key={editing?._id ?? "new"}
          campaign={editing}
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) setEditing(undefined);
          }}
        />
      ) : null}
    </motion.div>
  );
}
