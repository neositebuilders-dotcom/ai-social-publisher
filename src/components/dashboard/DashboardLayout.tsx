import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogoDropdown } from "@/components/LogoDropdown";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  BarChart3,
  CalendarDays,
  Clock,
  FolderOpen,
  ImageIcon,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Send,
  Settings,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";

const NAV = [
  {
    group: "Workspace",
    items: [
      { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "/dashboard/automations", label: "AI automations", icon: Sparkles },
      { to: "/dashboard/accounts", label: "Connected accounts", icon: UserRoundCheck },
      { to: "/dashboard/calendar", label: "Content calendar", icon: CalendarDays },
    ],
  },
  {
    group: "Content",
    items: [
      { to: "/dashboard/drafts", label: "Drafts", icon: FolderOpen },
      { to: "/dashboard/scheduled", label: "Scheduled", icon: Clock },
      { to: "/dashboard/published", label: "Published", icon: Send },
      { to: "/dashboard/media", label: "Media library", icon: ImageIcon },
    ],
  },
  {
    group: "Insights",
    items: [
      { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-6">
      {NAV.map((section) => (
        <div key={section.group} className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section.group}
          </p>
          {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function BrandMark() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5 px-1">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Sparkles className="size-4" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-bold tracking-tight">Cadence</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Social autopilot
        </span>
      </span>
    </NavLink>
  );
}

export function DashboardLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const overview = useQuery(api.dashboard.overview);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const queue = overview?.queuedJobs ?? 0;
  const unread = overview?.unreadNotifications ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col justify-between border-r border-sidebar-border bg-sidebar px-3 py-5 lg:flex">
        <div className="space-y-7">
          <BrandMark />
          <NavList />
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-border/70 bg-card px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Queue</span>
              <Badge variant={queue > 0 ? "default" : "secondary"}>
                {queue}
              </Badge>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              Publish jobs waiting to run.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user?.name ?? "Signed in"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email ?? "Guest session"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Open navigation">
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto p-5">
                <SheetHeader className="px-0">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                </SheetHeader>
                <div className="mt-1">
                  <BrandMark />
                </div>
                <div className="mt-7">
                  <NavList onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <BrandMark />
          </div>
          <span className="flex items-center gap-2">
            {unread > 0 ? (
              <Badge variant="secondary">{unread} new</Badge>
            ) : null}
            <LogoDropdown />
          </span>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
