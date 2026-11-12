import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AdSlot } from "@/components/ads/AdSlot";
import { ShadowMark, ShadowWordmark } from "@/components/branding/ShadowLogo";
import { DownloadsTray } from "@/components/media/DownloadsTray";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

function NavLinks({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
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
          {!collapsed && <span className="truncate">{label}</span>}
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
    select: (s) => (s.location.pathname === "/search" ? String((s.location.search as { q?: string }).q ?? "") : ""),
  });
  const [value, setValue] = useState(urlQ);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pathname === "/search") setValue(urlQ);
  }, [urlQ, pathname]);

  const push = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void navigate({
        to: "/search",
        search: (prev: Record<string, unknown>) => ({ ...(pathname === "/search" ? prev : {}), q: q || undefined }),
        replace: pathname === "/search",
      });
    }, 250);
  };

  return (
    <label className="group/search relative flex h-10 w-full max-w-md items-center rounded-full border border-foreground/10 bg-scrim/60 backdrop-blur-xl transition focus-within:border-cerulean/60 focus-within:shadow-glow">
      <Search className="ml-3.5 size-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          push(e.target.value);
        }}
        onFocus={() => {
          if (pathname !== "/search") void navigate({ to: "/search", search: { q: value || undefined } });
        }}
        placeholder="Search anime, dramas, movies…"
        aria-label="Search titles"
        className="h-full w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" aria-label="Clear search" className="mr-2 rounded-full p-1 text-muted-foreground hover:text-foreground" onClick={() => { setValue(""); push(""); }}>
          <X className="size-3.5" />
        </button>
      )}
    </label>
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
        "fixed right-0 top-0 z-30 flex h-16 items-center gap-3 px-4 transition-colors duration-300 sm:px-8 lg:left-[var(--sidebar-w)] lg:px-12",
        "left-0",
        scrolled ? "border-b border-foreground/5 bg-background/85 backdrop-blur-xl" : "bg-transparent",
      )}
    >
      <button type="button" onClick={onMenu} aria-label="Open menu" className="rounded-full p-2 hover:bg-foreground/10 lg:hidden">
        <Menu className="size-5" />
      </button>
      <Link to="/" className="lg:hidden" aria-label="Shadow home">
        <ShadowWordmark className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
      </Link>
      <div className="flex flex-1 justify-end">
        <SearchBox />
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
          Anime data from AniList. Show data from TMDB or TVmaze. Playback uses sample streams until a licensed stream
          source is connected.
        </p>
      </div>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-screen" style={{ "--sidebar-w": collapsed ? "76px" : "232px" } as React.CSSProperties}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="min-w-0 flex-1">
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
        </SheetContent>
      </Sheet>
      <DownloadsTray />
    </div>
  );
}
