"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sparkles, Sun, Moon, Monitor, Info, CheckCircle2, XCircle, Loader2, Palette, Keyboard, Database, Shield, User } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useDoclyzeStore } from "@/lib/store";
import { Logo, Monogram } from "./logo";
import { cn } from "@/lib/utils";
import { DataManagementSection } from "./data-management";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["\u2318", "K"], label: "Open command palette" },
  { keys: ["1"], label: "Go to Dashboard" },
  { keys: ["2"], label: "Go to Analyzer" },
  { keys: ["U"], label: "Upload document" },
  { keys: ["["], label: "Toggle sidebar" },
  { keys: [","], label: "Open Settings" },
];

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AIStatus = "checking" | "configured" | "not_configured" | "error";

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings } = useDoclyzeStore();
  const [aiStatus, setAIStatus] = React.useState<AIStatus>("checking");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAIStatus("checking");
    fetch("/api/insights/status")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.configured) setAIStatus("configured");
        else if (data.reason === "NO_API_KEY") setAIStatus("not_configured");
        else setAIStatus("error");
      })
      .catch(() => !cancelled && setAIStatus("error"));
    return () => { cancelled = true; };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] gap-0 p-0 overflow-hidden">
        {/* Modern header with gradient accent */}
        <div className="relative px-6 pt-6 pb-4 border-b border-border">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[var(--brand)] via-[var(--brand)]/60 to-transparent" />
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="text-lg font-semibold flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-soft)]">
                <Monogram size={18} />
              </div>
              Settings
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure appearance, AI insights, and data management.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col gap-0 max-h-[65vh] overflow-y-auto px-6 py-4">
          {/* Appearance Section */}
          <SettingsSection icon={<Palette className="h-4 w-4" />} title="Appearance">
            <div className="grid grid-cols-3 gap-2">
              <ThemeOption
                label="Light"
                icon={<Sun className="h-4 w-4" />}
                active={mounted && theme === "light"}
                onClick={() => setTheme("light")}
              />
              <ThemeOption
                label="Dark"
                icon={<Moon className="h-4 w-4" />}
                active={mounted && theme === "dark"}
                onClick={() => setTheme("dark")}
              />
              <ThemeOption
                label="System"
                icon={<Monitor className="h-4 w-4" />}
                active={mounted && theme === "system"}
                onClick={() => setTheme("system")}
              />
            </div>
          </SettingsSection>

          {/* AI Insights Section */}
          <SettingsSection icon={<Sparkles className="h-4 w-4" />} title="AI Insights" badge={<AIBadge status={aiStatus} />}>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand-soft)] mt-0.5">
                <Sparkles className="h-4 w-4 text-[var(--brand)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="ai-toggle" className="text-sm font-medium cursor-pointer">
                    Enable AI deep insights
                  </Label>
                  <Switch
                    id="ai-toggle"
                    checked={settings.aiInsightsEnabled}
                    onCheckedChange={(v) => updateSettings({ aiInsightsEnabled: v })}
                    disabled={aiStatus !== "configured"}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                  Sends structured extraction to an LLM to surface non-obvious patterns.
                  Deterministic insights always work independently.
                </p>
                {aiStatus === "not_configured" && (
                  <p className="mt-2 text-[11px] text-[var(--severity-notice)] leading-relaxed bg-[var(--severity-notice)]/5 rounded-md px-2.5 py-1.5 border border-[var(--severity-notice)]/10">
                    Not configured. Add a free-tier API key to{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">.env.local</code>
                  </p>
                )}
                {aiStatus === "configured" && (
                  <p className="mt-2 text-[11px] text-[var(--confidence-high)] leading-relaxed">
                    Provider ready — AI insights generated on demand.
                  </p>
                )}
              </div>
            </div>
          </SettingsSection>

          {/* Keyboard Shortcuts Section */}
          <SettingsSection icon={<Keyboard className="h-4 w-4" />} title="Keyboard Shortcuts">
            <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border">
              {SHORTCUTS.map(({ keys, label }) => (
                <div key={label} className="flex items-center justify-between px-3 py-2 first:pt-2.5 last:pb-2.5">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <div className="flex items-center gap-1">
                    {keys.map((k, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span className="text-[10px] text-muted-foreground/40">+</span>}
                        <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-background px-1.5 text-[10px] font-mono text-muted-foreground shadow-sm">
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SettingsSection>

          {/* Data Management Section */}
          <SettingsSection icon={<Database className="h-4 w-4" />} title="Data">
            <DataManagementSection />
          </SettingsSection>

          {/* About Section */}
          <SettingsSection icon={<Info className="h-4 w-4" />} title="About">
            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center gap-2.5 mb-2.5">
                <Logo height={18} />
                <span className="text-sm font-semibold">Doclyze</span>
                <span className="text-[10px] font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">v1.0</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Document intelligence that ingests any file and returns clean,
                spreadsheet-grade structured data plus narrative insight.
                Extraction runs entirely in your browser.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>Abhishek Shah</span>
                </div>
                <a
                  href="https://github.com/abhiverse01"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[var(--brand)] hover:underline"
                >
                  GitHub
                </a>
                <a
                  href="mailto:abhishek.aimarine@gmail.com"
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Email
                </a>
              </div>
            </div>
          </SettingsSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSection({
  icon,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 py-3 first:pt-0 border-b border-border/60 last:border-b-0">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground/80 flex items-center gap-2">
          <span className="text-muted-foreground/60">{icon}</span>
          {title}
        </Label>
        {badge}
      </div>
      {children}
    </div>
  );
}

function ThemeOption({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-all duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-[var(--brand)] bg-[var(--brand-soft)] text-foreground shadow-sm"
          : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-border"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function AIBadge({ status }: { status: AIStatus }) {
  if (status === "checking") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking
      </span>
    );
  }
  if (status === "configured") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--confidence-high)]">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </span>
    );
  }
  if (status === "not_configured") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--severity-notice)]">
        <XCircle className="h-3 w-3" /> Not set
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--severity-warning)]">
      <XCircle className="h-3 w-3" /> Error
    </span>
  );
}
