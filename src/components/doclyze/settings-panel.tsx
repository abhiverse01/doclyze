"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sparkles, Sun, Moon, Monitor, Info, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useDoclyzeStore } from "@/lib/store";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

/** Only real, tested shortcuts — verified from command-palette.tsx implementation */
const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["\u2318", "K"], label: "Open command palette" },
  { keys: ["1"], label: "Go to Dashboard (in palette)" },
  { keys: ["2"], label: "Go to Analyzer (in palette)" },
  { keys: ["U"], label: "Upload document (in palette)" },
  { keys: ["["], label: "Toggle sidebar (in palette)" },
  { keys: [","], label: "Open Settings (in palette)" },
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

  // Check AI provider status when panel opens
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
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure Doclyze appearance and AI-assisted insights.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-2">
          {/* Theme */}
          <section className="flex flex-col gap-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Appearance
            </Label>
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
          </section>

          {/* AI Insights */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                AI Insights (Beta)
              </Label>
              <AIBadge status={aiStatus} />
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <Sparkles className="h-4 w-4 mt-0.5 text-[var(--brand)] shrink-0" />
              <div className="flex-1">
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
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                  When enabled, Doclyze sends the structured extraction to an LLM
                  to surface non-obvious patterns and tailored suggestions.
                  Deterministic insights always work — this is an additive layer.
                </p>
                {aiStatus === "not_configured" && (
                  <p className="mt-2 text-xs text-[var(--severity-notice)] leading-relaxed">
                    Not configured. Add a free-tier API key to{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px]">.env.local</code>{" "}
                    and restart the server. See{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px]">.env.example</code>.
                  </p>
                )}
                {aiStatus === "configured" && (
                  <p className="mt-2 text-xs text-[var(--confidence-high)] leading-relaxed">
                    Provider ready — AI insights will be generated on demand.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section className="flex flex-col gap-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Keyboard Shortcuts
            </Label>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex flex-col gap-2">
                {SHORTCUTS.map(({ keys, label }) => (
                  <div key={label} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((k, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-[10px] text-muted-foreground/50">+</span>}
                          <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border bg-background px-1 text-[10px] font-mono text-muted-foreground">
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* About */}
          <section className="flex flex-col gap-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              About
            </Label>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-3 mb-3">
                <Logo height={20} />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Doclyze is a document intelligence tool that ingests any file and
                returns clean, spreadsheet-grade structured data plus narrative
                insight. Extraction runs entirely in your browser — no file
                leaves the device except the structured payload sent to the
                optional AI insight provider.
              </p>
              <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <Info className="h-3 w-3" />
                <span>v1.0 · Local-first · No account required</span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span>Abhishek Shah</span>
                <a
                  href="https://github.com/abhiverse01"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="mailto:abhishek.aimarine@gmail.com"
                  className="hover:text-foreground transition-colors"
                >
                  Email
                </a>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
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
        "flex flex-col items-center gap-1.5 rounded-md border px-3 py-2.5 text-xs font-medium transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-[var(--brand)] bg-[var(--brand-soft)] text-foreground"
          : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
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
        <XCircle className="h-3 w-3" /> Not configured
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--severity-warning)]">
      <XCircle className="h-3 w-3" /> Error
    </span>
  );
}
