import {
  Loading,
  PageHeader,
  PlatformGlyph,
  RequirementChip,
} from "@/components/dashboard/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/lib/format";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ExternalLink, Link2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

export default function Accounts() {
  const catalog = useQuery(api.platforms.catalog);
  const accounts = useQuery(api.accounts.list);
  const startConnect = useAction(api.oauthConnect.start);
  const disconnect = useMutation(api.accounts.disconnect);
  const [searchParams, setSearchParams] = useSearchParams();
  const [pending, setPending] = useState<string | null>(null);

  // Surface the result of an OAuth round-trip.
  useEffect(() => {
    const connect = searchParams.get("connect");
    if (!connect) return;
    if (connect === "ok") {
      toast.success(`Connected ${searchParams.get("platform") ?? "account"}`, {
        description: searchParams.get("name") ?? undefined,
      });
    } else {
      toast.error("Connection failed", {
        description: searchParams.get("reason") ?? "The platform rejected the request.",
      });
    }
    searchParams.delete("connect");
    searchParams.delete("platform");
    searchParams.delete("name");
    searchParams.delete("reason");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  if (catalog === undefined || accounts === undefined) {
    return <Loading label="Loading platforms…" />;
  }

  const byPlatform = new Map(accounts.map((a) => [a.platform, a]));

  const handleConnect = async (platform: string) => {
    setPending(platform);
    try {
      const res = await startConnect({
        platform: platform as
          | "instagram"
          | "facebook"
          | "youtube"
          | "linkedin"
          | "tiktok"
          | "x"
          | "picsart",
      });
      if (res.ok) {
        window.location.href = res.authUrl;
      } else if (res.reason === "unsupported") {
        toast.error("Not supported", { description: res.message });
      } else {
        toast.error("Backend not configured yet", {
          description: `Set these Convex environment variables: ${res.missing.join(", ")}`,
        });
      }
    } catch (err) {
      toast.error("Could not start the connection", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <PageHeader
        title="Connected accounts"
        description="Publishing goes only through official OAuth 2.0 APIs. Access tokens are encrypted at rest and never leave the server."
      />

      <div className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-accent/40 px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-foreground" />
        <p className="text-muted-foreground">
          No password-based logins, no scraping, no browser automation. Every
          integration below uses the platform&apos;s documented authorization-code
          flow.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {catalog.map((platform) => {
          const account = byPlatform.get(platform.id);
          const connected = account?.status === "connected";
          return (
            <Card key={platform.id} className="border-border/70 shadow-none">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <PlatformGlyph platform={platform.id} />
                    <div>
                      <CardTitle className="text-base">{platform.label}</CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {platform.tagline}
                      </p>
                    </div>
                  </div>
                  {account ? (
                    <Badge
                      variant={connected ? "default" : "outline"}
                      className="capitalize"
                    >
                      {account.status.replace("_", " ")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not connected</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {account ? (
                  <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5">
                    <p className="text-sm font-medium">
                      {account.displayName ?? account.handle ?? platform.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.handle ? `@${account.handle} · ` : ""}
                      connected {formatDate(account.connectedAt)}
                    </p>
                    {account.lastError ? (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                        <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                        {account.lastError}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  {platform.requirements.map((req) => (
                    <div key={req.label} className="flex items-start gap-2">
                      <RequirementChip status={req.status} label={req.label} />
                      <p className="text-xs leading-5 text-muted-foreground">
                        {req.note}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {platform.oauthSupported ? (
                    <Button
                      variant={connected ? "outline" : "default"}
                      size="sm"
                      disabled={pending === platform.id}
                      onClick={() => handleConnect(platform.id)}
                    >
                      <Link2 className="size-4" />
                      {connected ? "Reconnect" : "Connect"}
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="outline" size="sm" disabled>
                            <Link2 className="size-4" />
                            OAuth unavailable
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {platform.label} has no public publishing API, so there is
                        nothing to connect.
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {account ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Disconnect
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Disconnect {platform.label}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Stored tokens are deleted immediately. Scheduled posts
                            for this platform will fail until you reconnect.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              await disconnect({ accountId: account._id });
                              toast.success(`${platform.label} disconnected`);
                            }}
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}

                  <a
                    href={platform.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    API docs
                    <ExternalLink className="size-3" />
                  </a>
                </div>

                {!connected && platform.oauthSupported ? (
                  <p className="text-xs text-muted-foreground">
                    Backend env required:{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                      {platform.setupEnv.join(", ")}
                    </code>
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}
