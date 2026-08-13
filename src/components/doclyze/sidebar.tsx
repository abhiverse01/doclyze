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

  // Deduplicate recent docs by id (persist layer can produce dupes on hydration race)
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

  const recent = (
    <div className="flex flex-col gap-1.5">
      {recentDocs.length === 0 ? (
        !collapsed && (
          <p className="px-3 py-6 text-xs text-muted-foreground/70 text-center leading-relaxed">
            No documents analyzed yet.
            <br />
            Upload one to get started.
          </p>
        )
      ) : (
        recentDocs.slice(0, 8).map((doc) => (
          <RecentDocRow
            key={doc.id}
            doc={doc}
            collapsed={collapsed}
            href={`/analyzer/${doc.id}`}
            onClick={onCloseMobile}
          />
        ))
      )}
    </div>
  );

  const footer = (
    <div className="flex flex-col gap-1 border-t border-sidebar-border pt-3">
      <NavItem
        collapsed={collapsed}
        icon={<SettingsIcon className="h-4 w-4" aria-hidden="true" />}
        label="Settings"
        active={false}
        onClick={handleOpenSettings}
      />
      {!collapsed && (
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 mx-2 mt-1 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 transition-colors"
          aria-label="Open command palette"
        >
          <Search className="h-3 w-3" />
          <span>Search...</span>
          <kbd className="ml-auto rounded border border-border/80 bg-background px-1 py-0.5 text-[9px] font-mono">Ctrl+K</kbd>
        </button>
      )}
      {collapsed && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={openCommandPalette}
                className="mx-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors"
                aria-label="Open command palette"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Command Palette</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      {!collapsed && (
        <div className="mt-2 px-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
          v1.0 - Local-only
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
          collapsed ? "w-[68px]" : "w-[260px]"
        )}
      >
        <SidebarHeader collapsed={collapsed} onToggle={toggleSidebar} />
        <ScrollArea className="flex-1 px-3">
          <div className="flex flex-col gap-6 py-4">
            {nav}
            <div className="flex flex-col gap-2">
              {!collapsed && (
                <div className="flex items-center justify-between px-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                    Recent
                  </span>
                  <Clock className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
                </div>
              )}
              {recent}
            </div>
          </div>
        </ScrollArea>
        {footer}
      </aside>

      {/* Mobile drawer with focus trap */}
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
                <Logo height={24} />
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
              <ScrollArea className="flex-1 px-3">
                <div className="flex flex-col gap-6 py-4">
                  {nav}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                        Recent
                      </span>
                      <Clock className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
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

      {/* Settings dialog is rendered by AppShell */}
    </>
  );
}

function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-sidebar-border px-3 py-4">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 text-sidebar-foreground hover:opacity-80 transition-opacity"
        aria-label="Doclyze dashboard"
      >
        {collapsed ? <Monogram size={26} /> : <Logo height={24} />}
      </Link>
      {!collapsed && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      )}
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
    "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
  );

  const content = (
    <>
      <span className={cn("shrink-0", active && "text-[var(--brand)]")} aria-hidden="true">
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
  const item = (
    <Link href={href} onClick={onClick} className={cn(
      "group flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left transition-colors outline-none",
      "focus-visible:ring-2 focus-visible:ring-ring",
      "hover:bg-sidebar-accent/60"
    )}>
      {!collapsed ? (
        <>
          <span className="truncate text-xs font-medium text-sidebar-foreground">{doc.filename}</span>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-semibold uppercase tracking-wide">
              {labelForType(doc.detectedType).split(" ")[0]}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{ago}</span>
            {doc.ocrUsed && (
              <span className="text-[9px] text-[var(--severity-notice)]" title="OCR was used">OCR</span>
            )}
          </div>
        </>
      ) : (
        <div className="flex justify-center">
          <FileSearch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{item}</TooltipTrigger>
          <TooltipContent side="right" className="max-w-[200px]">
            <p className="font-medium truncate">{doc.filename}</p>
            <p className="text-xs text-muted-foreground">{labelForType(doc.detectedType)} - {ago}</p>
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
