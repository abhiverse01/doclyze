"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileSearch,
  Upload,
  Sun,
  Moon,
  Settings,
  PanelLeftClose,
  PanelLeft,
  FileText,
  Receipt,
  ScrollText,
  GraduationCap,
  FileBarChart,
  Table2,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useDoclyzeStore } from "@/lib/store";
import { labelForType } from "@/lib/extraction/orchestrator";
import type { DocType } from "@/lib/extraction/types";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  resume: <FileText className="h-3.5 w-3.5" />,
  invoice: <Receipt className="h-3.5 w-3.5" />,
  contract: <ScrollText className="h-3.5 w-3.5" />,
  research_paper: <GraduationCap className="h-3.5 w-3.5" />,
  spreadsheet: <Table2 className="h-3.5 w-3.5" />,
  general: <FileBarChart className="h-3.5 w-3.5" />,
  academic_transcript: <GraduationCap className="h-3.5 w-3.5" />,
  purchase_order: <Receipt className="h-3.5 w-3.5" />,
  financial_statement: <FileBarChart className="h-3.5 w-3.5" />,
  medical_report: <FileText className="h-3.5 w-3.5" />,
};

// ─── Global event-based open mechanism ────────────────────────────────────
// Any component can dispatch this event to open the command palette.
const COMMAND_PALETTE_OPEN = "doclyze:command-palette:open";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN));
}

// ─── Main component ──────────────────────────────────────────────────────

interface CommandPaletteProps {
  /** Called when "Open Settings" is selected. */
  onOpenSettings?: () => void;
}

export function CommandPalette({ onOpenSettings }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { openDocument, documents, toggleSidebar, settings } = useDoclyzeStore();
  const { theme, setTheme } = useTheme();
  const [hasMounted, setHasMounted] = React.useState(false);
  React.useEffect(() => setHasMounted(true), []);

  // Global keyboard shortcut
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Listen for programmatic open events
  React.useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(COMMAND_PALETTE_OPEN, handler);
    return () => window.removeEventListener(COMMAND_PALETTE_OPEN, handler);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const recentDocs = documents.slice(0, 8);

  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const modLabel = isMac ? "⌘" : "Ctrl";

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search documents…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => run(() => router.push("/dashboard"))}>
            <LayoutDashboard className="h-4 w-4" />
            <span>Go to Dashboard</span>
            <CommandShortcut>1</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/analyzer"))}>
            <FileSearch className="h-4 w-4" />
            <span>Go to Analyzer</span>
            <CommandShortcut>2</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Recent Documents */}
        {recentDocs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Documents">
              {recentDocs.map((doc) => (
                <CommandItem
                  key={doc.id}
                  value={`doc:${doc.filename}`}
                  onSelect={() => run(() => { openDocument(doc.id); router.push(`/analyzer/${doc.id}`); })}
                >
                  <span className="shrink-0">
                    {TYPE_ICONS[doc.detectedType] ?? <FileText className="h-3.5 w-3.5" />}
                  </span>
                  <span className="truncate flex-1">{doc.filename}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {labelForType(doc.detectedType).split(" ")[0]}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Actions */}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => router.push("/analyzer"))}>
            <Upload className="h-4 w-4" />
            <span>Upload Document</span>
            <CommandShortcut>U</CommandShortcut>
          </CommandItem>
          {hasMounted && (
            <CommandItem
              onSelect={() =>
                run(() => setTheme(theme === "dark" ? "light" : theme === "light" ? "dark" : "dark"))
              }
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>Toggle Theme</span>
            </CommandItem>
          )}
          <CommandItem onSelect={() => run(toggleSidebar)}>
            {settings.sidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
            <span>Toggle Sidebar</span>
            <CommandShortcut>[</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {/* Settings */}
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => run(() => onOpenSettings?.())}>
            <Settings className="h-4 w-4" />
            <span>Open Settings</span>
            <CommandShortcut>,</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
