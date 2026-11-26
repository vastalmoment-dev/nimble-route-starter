import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AdSlot } from "@/components/ads/AdSlot";
import { ShadowMark, ShadowWordmark } from "@/components/branding/ShadowLogo";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useWatchlist } from "@/lib/watchlist/store";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

export const DISCORD_URL = "https://discord.gg/uKtF6Efs2";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function NavLinks({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const savedCount = useWatchlist().length;
  return (
    <nav className="space-y-1" aria-label="Main">
      {NAV_ITEMS.map(({ to, label, icon: Icon, accent }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          activeOptions={{ exact: to === "/" }}
          title={collapsed ? label : undefined}
          className={cn(
            "group/nav relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground",
            "data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-gradient opacity-0 transition group-data-[status=active]/nav:opacity-100" />
          <Icon className={cn("size-5 shrink-0 transition", accent)} />
          {!collapsed && <span className="flex-1 truncate">{label}</span>}
          {!collapsed && to === "/watchlist" && savedCount > 0 && (
            <span className="text-xs font-semibold tabular-nums text-cerulean">{savedCount}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 lg:flex",
        collapsed ? "w-[76px]" : "w-[232px]",
      )}
    >
      <div className={cn("flex h-20 items-center", collapsed ? "justify-center" : "px-5")}>
        <Link to="/" aria-label="Shadow home">
          {collapsed ? <ShadowMark className="size-8" /> : <ShadowWordmark />}
        </Link>
      </div>
      <div className={cn("flex-1 overflow-y-auto", collapsed ? "px-3" : "px-3")}>
        <NavLinks collapsed={collapsed} />
        {!collapsed && (
          <div className="mt-8 flex justify-center">
            <AdSlot slot="sidebar" />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "m-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-foreground",
          collapsed && "justify-center px-0",
        )}
      >
        {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const urlQ = useRouterState({
    select: (s) => {
      if (s.location.pathname !== "/search") return "";
      const raw = (s.location.search as { q?: unknown } | undefined)?.q;
      return typeof raw === "string" ? raw : raw != null ? String(raw) : "";
    },
  });
  const [value, setValue] = useState(urlQ);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef<string>(urlQ);

  useEffect(() => {
    if (pathname === "/search" && urlQ !== lastPushed.current) {
      lastPushed.current = urlQ;
      setValue(urlQ);
    }
  }, [urlQ, pathname]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const commit = (q: string) => {
    lastPushed.current = q;
    const trimmed = q.trim();
    void navigate({
      to: "/search",
      search: (prev) => {
        const existingGenres =
          pathname === "/search" && prev && typeof prev === "object"
            ? (prev as { genres?: string }).genres
            : undefined;
        return {
          ...(typeof existingGenres === "string" && existingGenres
            ? { genres: existingGenres }
            : {}),
          ...(trimmed ? { q } : {}),
        };
      },
      replace: pathname === "/search",
    }).catch(() => {});
  };

  const push = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(q), 220);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        commit(value);
      }}
      className="group/search relative flex h-11 w-full min-w-0 max-w-md items-center rounded-full border border-foreground/10 bg-scrim/60 backdrop-blur-xl transition focus-within:border-cerulean/60 focus-within:shadow-glow sm:h-10"
    >
      <Search className="ml-3 size-4 shrink-0 text-muted-foreground sm:ml-3.5" />
      <input
        type="search"
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          if (pathname === "/search" || next.trim().length > 0) {
            push(next);
          }
        }}
        onFocus={() => {
          if (pathname !== "/search" && value.trim().length > 0) {
            commit(value);
          }
        }}
        placeholder="Search anime, cartoons, dramas, movies…"
        aria-label="Search titles"
        className="h-full min-w-0 w-full bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground sm:px-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          className="mr-1.5 flex min-h-[36px] min-w-[36px] items-center justify-center rounded-full p-1 text-muted-foreground hover:text-foreground sm:mr-2"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            setValue("");
            if (pathname === "/search") commit("");
          }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </form>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={cn(
        "fixed right-0 top-0 z-30 flex h-16 items-center gap-2 px-3 transition-colors duration-300 sm:gap-3 sm:px-8 lg:left-[var(--sidebar-w)] lg:px-12",
        "left-0",
        scrolled
          ? "border-b border-foreground/5 bg-background/85 backdrop-blur-xl"
          : "bg-transparent",
      )}
    >
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full hover:bg-foreground/10 lg:hidden"
      >
        <Menu className="size-5" />
      </button>
      <Link to="/" className="shrink-0 lg:hidden" aria-label="Shadow home">
        <ShadowWordmark className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
        <SearchBox />
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Join Discord"
          className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-[#5865F2]/40 bg-[#5865F2]/15 px-3 text-xs font-semibold text-foreground backdrop-blur-xl transition hover:border-[#5865F2] hover:bg-[#5865F2] hover:text-white sm:h-10 sm:min-h-0 sm:px-4"
        >
          <DiscordIcon className="text-[#7289DA] group-hover:text-white" />
          <span className="hidden sm:inline">Join Discord</span>
          <span className="sm:hidden">Discord</span>
        </a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-foreground/5 px-4 py-10 text-xs text-muted-foreground sm:px-8 lg:px-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <ShadowWordmark />
        <p className="max-w-lg">
          Live streaming &amp; free manga library for anime, cartoons, K-dramas, Hollywood,
          Bollywood, Tollywood and Nollywood. New releases appear automatically.
        </p>
        <nav aria-label="Footer" className="flex shrink-0 flex-wrap items-center gap-4 sm:gap-5">
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center whitespace-nowrap transition hover:text-foreground sm:min-h-0"
          >
            Home
          </Link>
          <Link
            to="/watchlist"
            className="inline-flex min-h-[44px] items-center whitespace-nowrap transition hover:text-foreground sm:min-h-0"
          >
            My Watchlist
          </Link>
          <Link
            to="/policy"
            className="inline-flex min-h-[44px] items-center whitespace-nowrap transition hover:text-foreground sm:min-h-0"
          >
            Policy & DMCA
          </Link>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap font-semibold text-foreground transition hover:text-cerulean sm:min-h-0"
          >
            <DiscordIcon className="text-[#5865F2]" />
            <span>Join Discord</span>
          </a>
        </nav>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div
      className="flex min-h-screen"
      style={{ "--sidebar-w": collapsed ? "76px" : "232px" } as React.CSSProperties}
    >
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="min-w-0 flex-1 overflow-x-clip">
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main>{children}</main>
        <Footer />
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-4">
          <SheetTitle className="mb-6 mt-1 px-2">
            <ShadowWordmark />
          </SheetTitle>
          <NavLinks onNavigate={() => setMobileOpen(false)} />
          <div className="mt-6 flex flex-col gap-1 border-t border-sidebar-border px-2 pt-4">
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileOpen(false)}
              className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-2 text-xs font-semibold text-sidebar-foreground transition hover:bg-sidebar-accent"
            >
              <DiscordIcon className="text-[#5865F2]" />
              <span>Join Discord</span>
            </a>
            <Link
              to="/policy"
              onClick={() => setMobileOpen(false)}
              className="flex min-h-[44px] items-center rounded-lg px-2 text-xs font-medium text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              Policy & DMCA
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
