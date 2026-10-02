import { Loading, PageHeader, PlatformGlyph } from "@/components/dashboard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { COMMON_TIMEZONES } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Cpu, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Settings() {
  const settings = useQuery(api.settings.get);
  const aiStatus = useQuery(api.settings.aiStatus);
  const catalog = useQuery(api.platforms.catalog);
  const upsert = useMutation(api.settings.upsert);

  const [form, setForm] = useState({
    timezone: "UTC",
    defaultMode: "approval" as "approval" | "autopilot",
    brandVoice: "",
    audience: "",
    hashtagPrefs: "",
    ctaPrefs: "",
    bannedWords: "",
    notifyOnFailure: true,
    notifyOnPublish: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      timezone: settings.timezone,
      defaultMode: settings.defaultMode,
      brandVoice: settings.brandVoice ?? "",
      audience: settings.audience ?? "",
      hashtagPrefs: settings.hashtagPrefs ?? "",
      ctaPrefs: settings.ctaPrefs ?? "",
      bannedWords: settings.bannedWords.join(", "),
      notifyOnFailure: settings.notifyOnFailure,
      notifyOnPublish: settings.notifyOnPublish,
    });
  }, [settings]);

  if (settings === undefined) return <Loading label="Loading settings…" />;

  const save = async () => {
    setSaving(true);
    try {
      await upsert({
        timezone: form.timezone,
        defaultMode: form.defaultMode,
        brandVoice: form.brandVoice || undefined,
        audience: form.audience || undefined,
        hashtagPrefs: form.hashtagPrefs || undefined,
        ctaPrefs: form.ctaPrefs || undefined,
        bannedWords: form.bannedWords
          .split(",")
          .map((w) => w.trim())
          .filter(Boolean),
        notifyOnFailure: form.notifyOnFailure,
        notifyOnPublish: form.notifyOnPublish,
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Could not save settings", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <PageHeader
        title="Settings"
        description="Workspace defaults that new automations inherit, plus the runtime state of your AI provider."
        actions={
          <Button onClick={save} disabled={saving}>
            <Save className="size-4" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/70 shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Content defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Default timezone</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                >
                  {[
                    form.timezone,
                    ...COMMON_TIMEZONES.filter((t) => t !== form.timezone),
                  ].map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Default mode</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={form.defaultMode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultMode: e.target.value as "approval" | "autopilot",
                    })
                  }
                >
                  <option value="approval">Approval — review before publishing</option>
                  <option value="autopilot">Autopilot — publish automatically</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand">Brand voice</Label>
                <Input
                  id="brand"
                  value={form.brandVoice}
                  onChange={(e) => setForm({ ...form, brandVoice: e.target.value })}
                  placeholder="Confident, plain-spoken"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aud">Target audience</Label>
                <Input
                  id="aud"
                  value={form.audience}
                  onChange={(e) => setForm({ ...form, audience: e.target.value })}
                  placeholder="Indie founders"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hash">Hashtag preferences</Label>
                <Input
                  id="hash"
                  value={form.hashtagPrefs}
                  onChange={(e) => setForm({ ...form, hashtagPrefs: e.target.value })}
                  placeholder="#buildinpublic"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cta">CTA preferences</Label>
                <Input
                  id="cta"
                  value={form.ctaPrefs}
                  onChange={(e) => setForm({ ...form, ctaPrefs: e.target.value })}
                  placeholder="Start a free trial"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="banned">Banned words</Label>
              <Textarea
                id="banned"
                rows={2}
                value={form.bannedWords}
                onChange={(e) => setForm({ ...form, bannedWords: e.target.value })}
                placeholder="guarantee, cheapest, hack"
              />
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Notify on publish failure</Label>
                  <p className="text-xs text-muted-foreground">
                    Creates an in-app notification when a job exhausts its retries.
                  </p>
                </div>
                <Switch
                  checked={form.notifyOnFailure}
                  onCheckedChange={(v) => setForm({ ...form, notifyOnFailure: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Notify on publish</Label>
                  <p className="text-xs text-muted-foreground">
                    Creates a notification for every successful publish.
                  </p>
                </div>
                <Switch
                  checked={form.notifyOnPublish}
                  onCheckedChange={(v) => setForm({ ...form, notifyOnPublish: v })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="size-4 text-primary" />
                AI provider
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiStatus === undefined ? (
                <p className="text-sm text-muted-foreground">Resolving…</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">
                      {aiStatus.provider}
                    </span>
                    <Badge variant={aiStatus.costsMoney ? "outline" : "default"}>
                      {aiStatus.costsMoney ? "Paid usage" : "$0 local"}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {aiStatus.model}
                  </p>
                  <p className="text-xs text-muted-foreground">{aiStatus.note}</p>
                </>
              )}
              <p className="text-xs text-muted-foreground">
                Point <code className="rounded bg-muted px-1 py-0.5 font-mono">AI_BASE_URL</code>{" "}
                at any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, Ollama)
                to swap providers — no code changes required.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Platform configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(catalog ?? []).map((platform) => (
                <div key={platform.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <PlatformGlyph platform={platform.id} size="sm" />
                    <span className="text-sm font-medium">{platform.label}</span>
                    <Badge variant="outline" className="ml-auto">
                      {platform.oauthSupported ? "OAuth" : "No publishing API"}
                    </Badge>
                  </div>
                  <p className="pl-9 font-mono text-[11px] leading-4 text-muted-foreground">
                    {platform.setupEnv.join(" · ")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
