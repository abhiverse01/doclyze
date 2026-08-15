"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FileSearch,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Clock,
  X,
  Search,
  FileText,
  Receipt,
  ScrollText,
  GraduationCap,
  Table2,
  FileBarChart,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, Monogram } from "./logo";
import { useDoclyzeStore } from "@/lib/store";
import { labelForType } from "@/lib/extraction/orchestrator";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { openCommandPalette } from "./command-palette";

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenSettings?: () => void;
}

/** Map document types to distinct, colorful icons */
const DOC_TYPE_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  resume: { icon: FileText, color: "text-blue-500" },
  invoice: { icon: Receipt, color: "text-emerald-500" },
  contract: { icon: ScrollText, color: "text-violet-500" },
  research_paper: { icon: GraduationCap, color: "text-orange-500" },
  spreadsheet: { icon: Table2, color: "text-cyan-500" },
  academic_transcript: { icon: GraduationCap, color: "text-pink-500" },
  purchase_order: { icon: Receipt, color: "text-amber-500" },
  financial_statement: { icon: FileBarChart, color: "text-teal-500" },
  medical_report: { icon: FileText, color: "text-red-400" },
  correspondence: { icon: FileText, color: "text-indigo-400" },
  general: { icon: FileBarChart, color: "text-muted-foreground" },
};

export function Sidebar({ mobileOpen, onCloseMobile, onOpenSettings }: SidebarProps) {
  const pathname = usePathname();
  const { documents, settings, toggleSidebar } = useDoclyzeStore();
  const collapsed = settings.sidebarCollapsed;
  const mobileDrawerRef = React.useRef<HTMLElement>(null);

  const handleOpenSettings = () => {
    onOpenSettings?.();
  };

  // Focus trap for mobile drawer
  const handleDrawerKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab" && e.key !== "Shift") return;
      const drawer = mobileDrawerRef.current;
      if (!drawer) return;
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    },
    []
  );

  // Deduplicate recent docs by id
  const recentDocs = React.useMemo(() => {
    const seen = new Set<string>();
    return documents.filter((d) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }, [documents]);

  const nav = (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      {/*
        NAVIGATION MODEL (documented v10):
        - Logo/wordmark (sidebar header, mobile header) → /dashboard (app home)
        - "Dashboard" nav item → /dashboard
        - "Analyzer" nav item → /analyzer
        - "Homepage" nav item (ExternalLink icon) → / (public marketing page)
        This separation means the logo always stays within the app context,
        while the marketing page is accessible via an explicit, visually-
        distinct affordance.
      */}
      <NavItem
        collapsed={collapsed}
        icon={<LayoutDashboard className="h-4 w-4" aria-hidden="true" />}
        label="Dashboard"
        href="/dashboard"
        active={pathname === "/dashboard"}
        onClick={onCloseMobile}
      />
      <NavItem
        collapsed={collapsed}
        icon={<FileSearch className="h-4 w-4" aria-hidden="true" />}
        label="Analyzer"
        href="/analyzer"
        active={pathname === "/analyzer" || pathname.startsWith("/analyzer/")}
        onClick={onCloseMobile}
      />
    </nav>
  );

  // v10: Time-based grouping for recent documents
  const groupedDocs = React.useMemo(() => {
    const now = Date.now();
    const today: typeof recentDocs = [];
    const thisWeek: typeof recentDocs = [];
    const older: typeof recentDocs = [];
    for (const doc of recentDocs.slice(0, 8)) {
      const diffMs = now - new Date(doc.extractedAt).getTime();
      const diffHr = diffMs / 3_600_000;
      if (diffHr < 24) today.push(doc);
      else if (diffHr < 168) thisWeek.push(doc);
      else older.push(doc);
    }
    const groups: { label: string; docs: typeof recentDocs }[] = [];
    if (today.length) groups.push({ label: 'Today', docs: today });
    if (thisWeek.length) groups.push({ label: 'Earlier this week', docs: thisWeek });
    if (older.length) groups.push({ label: 'Older', docs: older });
    return groups;
  }, [recentDocs]);

  const recent = (
    <div className="flex flex-col gap-1">
      {recentDocs.length === 0 ? (
        !collapsed && (
          <p className="px-3 py-6 text-xs text-muted-foreground/70 text-center leading-relaxed">
            No documents analyzed yet.
            <br />
            Upload one to get started.
          </p>
        )
      ) : collapsed ? (
        // Collapsed: flat list (no room for group headers)
        recentDocs.slice(0, 8).map((doc) => (
          <RecentDocRow
            key={doc.id}
            doc={doc}
            collapsed={collapsed}
            href={`/analyzer/${doc.id}`}
            onClick={onCloseMobile}
          />
        ))
      ) : (
        // Expanded: time-grouped
        groupedDocs.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <span className="px-2.5 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50">
              {group.label}
            </span>
            {group.docs.map((doc) => (
              <RecentDocRow
                key={doc.id}
                doc={doc}
                collapsed={collapsed}
                href={`/analyzer/${doc.id}`}
                onClick={onCloseMobile}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );

  const footer = (
    <div className="flex flex-col gap-1.5 border-t border-sidebar-border pt-3">
      {/* Search + Settings side by side when collapsed */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-1">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={openCommandPalette}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors"
                  aria-label="Open command palette"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Search</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleOpenSettings}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors"
                  aria-label="Settings"
                >
                  <SettingsIcon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : (
        <>
          <NavItem
            collapsed={collapsed}
            icon={<SettingsIcon className="h-4 w-4" aria-hidden="true" />}
            label="Settings"
            active={false}
            onClick={handleOpenSettings}
          />
          <button
            onClick={openCommandPalette}
            className="flex items-center gap-2 mx-2 mt-0.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 transition-colors"
            aria-label="Open command palette"
          >
            <Search className="h-3 w-3" />
            <span>Search...</span>
            <kbd className="ml-auto rounded border border-border/80 bg-background px-1 py-0.5 text-[9px] font-mono">Ctrl+K</kbd>
          </button>
        </>
      )}
      {!collapsed && (
        <Link
          href="/"
          onClick={onCloseMobile}
          className="mx-2 mt-0.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          aria-label="Go to Doclyze homepage"
        >
          <ExternalLink className="h-3 w-3" />
          <span>Homepage</span>
        </Link>
      )}
      {collapsed && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/"
                className="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-sidebar-accent/60 transition-colors"
                aria-label="Go to Doclyze homepage"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Homepage</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {!collapsed && (
        <div className="mt-1 px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
          v1.0 · Local-only
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside
        aria-label="Sidebar"
        className={cn(
          "hidden md:flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out",
          collapsed ? "w-[60px]" : "w-[256px]"
        )}
      >
        <SidebarHeader collapsed={collapsed} onToggle={toggleSidebar} />
        <ScrollArea className="flex-1 px-2">
          <div className="flex flex-col gap-5 py-3">
            {nav}
            <div className="flex flex-col gap-1.5">
              {!collapsed && (
                <div className="flex items-center justify-between px-2.5 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                    Recent
                  </span>
                  <Clock className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" />
                </div>
              )}
              {recent}
            </div>
          </div>
        </ScrollArea>
        {footer}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={onCloseMobile}
              aria-hidden="true"
            />
            <motion.aside
              ref={mobileDrawerRef}
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="md:hidden fixed inset-y-0 left-0 z-50 w-[280px] flex flex-col border-r border-sidebar-border bg-sidebar"
              role="dialog"
              aria-modal="true"
              aria-label="Sidebar navigation"
              onKeyDown={handleDrawerKeyDown}
            >
              <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
                {/* Mobile: Logo goes to dashboard (app home) */}
                <Link href="/dashboard" onClick={onCloseMobile} className="flex items-center gap-2">
                  <Logo height={24} />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onCloseMobile}
                  aria-label="Close sidebar"
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1 px-2">
                <div className="flex flex-col gap-5 py-3">
                  {nav}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between px-2.5 py-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
                        Recent
                      </span>
                      <Clock className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" />
                    </div>
                    {recent}
                  </div>
                </div>
              </ScrollArea>
              {footer}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-3 py-3">
      {/* Navigation model: Logo inside the app always goes to /dashboard (app home) */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 text-sidebar-foreground hover:opacity-80 transition-opacity"
        aria-label="Doclyze dashboard"
      >
        {collapsed ? <Monogram size={24} /> : <Logo height={22} />}
      </Link>
      {/* FIX #1: Always show toggle button — PanelLeftClose when open, PanelLeft when collapsed */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "h-7 w-7 text-muted-foreground hover:text-foreground transition-all",
          collapsed && "mx-auto"
        )}
      >
        {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function NavItem({
  icon, label, active, collapsed, href, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const sharedClass = cn(
    "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground active:bg-sidebar-accent/80 active:scale-[0.995]"
  );

  const content = (
    <>
      <span className={cn("shrink-0 transition-colors", active && "text-[var(--brand)]")} aria-hidden="true">
        {icon}
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </>
  );

  const item = href ? (
    <Link href={href} onClick={onClick} aria-current={active ? "page" : undefined} className={sharedClass}>
      {content}
    </Link>
  ) : (
    <button onClick={onClick} aria-current={active ? "page" : undefined} className={sharedClass}>
      {content}
    </button>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{item}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return item;
}

function RecentDocRow({ doc, collapsed, href, onClick }: {
  doc: { id: string; filename: string; detectedType: string; extractedAt: string; completenessScore: number; ocrUsed: boolean };
  collapsed: boolean;
  href: string;
  onClick?: () => void;
}) {
  const ago = relativeTime(doc.extractedAt);
  const typeInfo = DOC_TYPE_ICONS[doc.detectedType] ?? { icon: FileBarChart, color: "text-muted-foreground" };
  const IconComponent = typeInfo.icon;

  const item = (
    <Link href={href} onClick={onClick} className={cn(
      "group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150 outline-none",
      "focus-visible:ring-2 focus-visible:ring-ring",
      "hover:bg-sidebar-accent/60 active:bg-sidebar-accent/80 active:scale-[0.995]",
      collapsed && "justify-center px-1"
    )}>
      {/* FIX #4: Colorful type-specific icon instead of boring generic icon */}
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/60 transition-colors group-hover:bg-muted",
        collapsed && "h-8 w-8"
      )}>
        <IconComponent className={cn("h-3.5 w-3.5", typeInfo.color)} aria-hidden="true" />
      </div>
      {!collapsed ? (
        <div className="flex-1 min-w-0">
          <span className="block truncate text-xs font-medium text-sidebar-foreground group-hover:text-foreground transition-colors">
            {doc.filename}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn(
              "text-[10px] font-semibold",
              doc.completenessScore >= 75 ? "text-[var(--confidence-high)]" : doc.completenessScore >= 50 ? "text-[var(--confidence-medium)]" : "text-[var(--severity-warning)]"
            )}>
              {doc.completenessScore}%
            </span>
            <span className="text-[10px] text-muted-foreground/60">·</span>
            <span className="text-[10px] text-muted-foreground/60">{ago}</span>
            {doc.ocrUsed && (
              <Badge variant="outline" className="h-3.5 px-1 text-[8px] border-[var(--severity-notice)]/40 text-[var(--severity-notice)] leading-none">
                OCR
              </Badge>
            )}
          </div>
        </div>
      ) : null}
    </Link>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{item}</TooltipTrigger>
          <TooltipContent side="right" className="max-w-[200px]">
            <p className="font-medium truncate">{doc.filename}</p>
            <p className="text-xs text-muted-foreground">{labelForType(doc.detectedType)} · {ago}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return item;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}