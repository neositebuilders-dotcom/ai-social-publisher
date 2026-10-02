import { LogoDropdown } from "@/components/LogoDropdown";
import { RequirementChip } from "@/components/dashboard/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Cpu,
  ImageIcon,
  Layers,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  Workflow,
} from "lucide-react";
import { useNavigate } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
};

const FEATURES = [
  {
    icon: Sparkles,
    title: "Campaign-aware AI",
    body: "Give the AI a brief — business, voice, audience, pillars and banned words. It writes for you, not at you.",
  },
  {
    icon: Layers,
    title: "Platform-native output",
    body: "One idea becomes a LinkedIn insight, a tight X post, a visual IG caption and a short-form video script.",
  },
  {
    icon: ListChecks,
    title: "Validated before it ships",
    body: "Every post is checked against real platform limits — caption length, hashtags, required media — before queueing.",
  },
  {
    icon: Timer,
    title: "Timezone-true scheduler",
    body: "Multiple posts per day, IANA timezones, retries with backoff and idempotent jobs that never double-publish.",
  },
  {
    icon: RefreshCw,
    title: "Content memory",
    body: "Cadence records what it already published and rotates topics so your feed never repeats itself.",
  },
  {
    icon: BarChart3,
    title: "Honest analytics",
    body: "Metrics are pulled from each platform's official API. Where none exists, we say so instead of guessing.",
  },
];

const STEPS = [
  {
    title: "Connect",
    body: "OAuth 2.0 only. Tokens are encrypted at rest and never touch the browser.",
  },
  {
    title: "Describe the campaign",
    body: "Platforms, cadence, times, timezone, voice, pillars and what to avoid.",
  },
  {
    title: "Generate & validate",
    body: "The AI drafts a platform-specific version of each post and checks it against the rules.",
  },
  {
    title: "Publish & learn",
    body: "Approve manually or let autopilot ship it — then collect what the API reports back.",
  },
];

const PIPELINE = [
  { label: "Draft", tone: "bg-muted text-muted-foreground" },
  { label: "Approved", tone: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  { label: "Scheduled", tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" },
  { label: "Publishing", tone: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  { label: "Published", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  { label: "Failed", tone: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
];

const PHASES = [
  {
    phase: "Phase 1",
    title: "Core platform",
    body: "Auth, dashboard, database, automations, calendar and the scheduler.",
    done: true,
  },
  {
    phase: "Phase 2",
    title: "Meta + LinkedIn + YouTube",
    body: "Instagram, Facebook, LinkedIn and YouTube adapters via official OAuth.",
    done: true,
  },
  {
    phase: "Phase 3",
    title: "TikTok + X",
    body: "Content Posting API and X API v2 write access, honestly gated.",
    done: true,
  },
  {
    phase: "Phase 4",
    title: "Content intelligence",
    body: "Provider-agnostic AI generation, media prep and content-history memory.",
    done: true,
  },
  {
    phase: "Phase 5",
    title: "Production hardening",
    body: "Analytics sync, retries, notifications and billing-ready architecture.",
    done: true,
  },
];

function Nav() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5"
          aria-label="Cadence home"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="text-sm font-bold tracking-tight">Cadence</span>
        </button>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#platforms" className="transition-colors hover:text-foreground">
            Platforms
          </a>
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
          <a href="#roadmap" className="transition-colors hover:text-foreground">
            Roadmap
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <Button size="sm" onClick={() => navigate("/dashboard")}>
                Open dashboard
              </Button>
              <LogoDropdown />
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate("/auth")}
                className="hidden sm:inline-flex"
              >
                Sign in
              </Button>
              <Button size="sm" onClick={() => navigate("/auth")}>
                Get started
                <ArrowRight className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function PlatformGrid() {
  const catalog = useQuery(api.platforms.catalog);
  return (
    <section id="platforms" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
      <motion.div {...fadeUp} className="max-w-2xl">
        <Badge variant="outline" className="gap-1.5">
          <ShieldCheck className="size-3.5" />
          Official APIs only
        </Badge>
        <h2 className="mt-4 text-3xl font-bold tracking-tight">
          Every integration is a real, documented API
        </h2>
        <p className="mt-3 text-muted-foreground">
          Each adapter declares its capabilities and the real-world gating between
          the docs and your feed — app review, audits, quotas and paid tiers. No
          scraping, no password flows, no fake buttons.
        </p>
      </motion.div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(catalog ?? []).map((platform, index) => (
          <motion.div
            key={platform.id}
            {...fadeUp}
            transition={{ delay: index * 0.04 }}
          >
            <Card className="h-full border-border/70 shadow-none">
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex size-9 items-center justify-center rounded-lg border border-border/70 text-sm font-semibold"
                    style={{ color: platform.accent }}
                  >
                    {platform.label.slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{platform.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {platform.tagline}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {platform.requirements.slice(0, 2).map((req) => (
                    <RequirementChip
                      key={req.label}
                      status={req.status}
                      label={req.label}
                    />
                  ))}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {platform.requirements[0]?.note}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const go = () => navigate(isAuthenticated ? "/dashboard" : "/auth");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 grid-backdrop opacity-[0.35]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] accent-glow" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col justify-center"
          >
            <Badge variant="outline" className="w-fit gap-1.5">
              <Timer className="size-3.5" />
              AI social autopilot · runs at $0 in development
            </Badge>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Your social engine,
              <br />
              on autopilot.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Describe your campaign once. Cadence generates platform-specific
              content every day, validates it against each network&apos;s rules,
              schedules it in your timezone and publishes through official APIs —
              then tells you exactly what happened.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={go}>
                {isAuthenticated ? "Open dashboard" : "Start building"}
                <ArrowRight className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  document
                    .getElementById("how")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                See how it works
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card. Local AI provider by default — add a hosted model
              whenever you want.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="flex items-center"
          >
            <Card className="w-full border-border/70 shadow-none">
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Automation
                    </p>
                    <p className="text-sm font-semibold">Daily SaaS promotion</p>
                  </div>
                  <Badge className="gap-1.5">
                    <span className="size-1.5 animate-pulse rounded-full bg-primary-foreground" />
                    Autopilot
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Cadence", value: "Every day" },
                    { label: "Times", value: "09:00 · 17:00" },
                    { label: "Timezone", value: "Europe/Berlin" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {[
                    { platform: "LinkedIn", text: "Insight-led post, 3 hashtags" },
                    { platform: "X", text: "Sharp 240-char version" },
                    { platform: "Instagram", text: "Visual caption + 12 tags" },
                    { platform: "TikTok", text: "Short-form video script" },
                  ].map((row, i) => (
                    <motion.div
                      key={row.platform}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.12 }}
                      className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2.5"
                    >
                      <span className="size-1.5 rounded-full bg-primary" />
                      <span className="w-20 text-xs font-semibold">
                        {row.platform}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {row.text}
                      </span>
                    </motion.div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-4">
                  {PIPELINE.map((stage, i) => (
                    <span
                      key={stage.label}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stage.tone}`}
                    >
                      {stage.label}
                      {i < PIPELINE.length - 1 ? "" : ""}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div {...fadeUp} className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight">
            Built like a product, not a demo
          </h2>
          <p className="mt-3 text-muted-foreground">
            A modular platform-adapter architecture keeps the core independent of
            any single network — swap or add a platform without touching the engine.
          </p>
        </motion.div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <motion.div
              key={feature.title}
              {...fadeUp}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="h-full border-border/70 shadow-none">
                <CardContent className="space-y-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <feature.icon className="size-5" />
                  </span>
                  <p className="font-semibold tracking-tight">{feature.title}</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {feature.body}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <motion.div {...fadeUp} className="max-w-2xl">
            <Badge variant="outline" className="gap-1.5">
              <Workflow className="size-3.5" />
              The workflow
            </Badge>
            <h2 className="mt-4 text-3xl font-bold tracking-tight">
              From brief to published in four steps
            </h2>
          </motion.div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <motion.div
                key={step.title}
                {...fadeUp}
                transition={{ delay: index * 0.07 }}
                className="relative rounded-xl border border-border/70 bg-card p-5"
              >
                <span className="text-xs font-semibold text-primary">
                  0{index + 1}
                </span>
                <p className="mt-2 font-semibold tracking-tight">{step.title}</p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {step.body}
                </p>
              </motion.div>
            ))}
          </div>

          <motion.div
            {...fadeUp}
            className="mt-12 flex flex-wrap items-center gap-2"
          >
            <span className="text-sm text-muted-foreground">
              Every post moves through a single, auditable pipeline:
            </span>
            {PIPELINE.map((stage, i) => (
              <span key={stage.label} className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${stage.tone}`}
                >
                  {stage.label}
                </span>
                {i < PIPELINE.length - 1 ? (
                  <ArrowRight className="size-3 text-muted-foreground" />
                ) : null}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      <PlatformGrid />

      {/* Dashboard teaser */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <motion.div {...fadeUp}>
          <Card className="border-border/70 shadow-none">
            <CardContent className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold tracking-tight">
                  A workspace for the whole operation
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Overview, connected accounts, automations, calendar, drafts,
                  scheduled and published posts, analytics, a media library and
                  settings — with clear statuses at every step.
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { icon: CalendarDays, label: "Content calendar" },
                    { icon: Cpu, label: "AI provider of your choice" },
                    { icon: ImageIcon, label: "Media library" },
                    { icon: BarChart3, label: "API-sourced analytics" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <item.icon className="size-4 text-primary" />
                      <span className="text-muted-foreground">{item.label}</span>
                    </div>
                  ))}
                </div>
                <Button onClick={go} className="mt-2">
                  {isAuthenticated ? "Go to dashboard" : "Create your workspace"}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Drafts ready", value: "12" },
                  { label: "Scheduled", value: "8" },
                  { label: "Published this week", value: "21" },
                  { label: "Failed to review", value: "1" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-border/70 bg-muted/40 p-4"
                  >
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <motion.div {...fadeUp} className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight">
              Shipped in phases
            </h2>
            <p className="mt-3 text-muted-foreground">
              A fully working local MVP first, then real integrations, then
              intelligence and hardening.
            </p>
          </motion.div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PHASES.map((phase, index) => (
              <motion.div
                key={phase.phase}
                {...fadeUp}
                transition={{ delay: index * 0.06 }}
                className="rounded-xl border border-border/70 bg-card p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {phase.phase}
                  </span>
                  {phase.done ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-semibold tracking-tight">
                  {phase.title}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {phase.body}
                </p>
              </motion.div>
            ))}
          </div>

          <motion.div
            {...fadeUp}
            className="mt-10 flex items-start gap-3 rounded-xl border border-border/70 bg-card p-5"
          >
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <p className="text-sm leading-6 text-muted-foreground">
              <span className="font-medium text-foreground">
                Honest by design.
              </span>{" "}
              Publishing to Instagram, Facebook, YouTube and TikTok requires app
              review or audits, and X limits free-tier writes — those gates are
              surfaced in the product, never hidden. Picsart&apos;s official API
              edits images but cannot publish, so it is marked unavailable for
              publishing rather than faked.
            </p>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <motion.div
          {...fadeUp}
          className="relative overflow-hidden rounded-2xl border border-border/70 bg-card px-6 py-14 text-center sm:px-12"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 accent-glow" />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
            Put your social on a cadence
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-muted-foreground">
            Create a workspace, describe your campaign and watch the calendar fill
            itself.
          </p>
          <div className="relative mt-7 flex justify-center">
            <Button size="lg" onClick={go}>
              {isAuthenticated ? "Open dashboard" : "Get started free"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-3.5" />
            </span>
            <span className="font-medium text-foreground">Cadence</span>
          </div>
          <p>Official APIs only · OAuth 2.0 · Encrypted tokens</p>
        </div>
      </footer>
    </div>
  );
}
