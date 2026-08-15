"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Info,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  Loader2,
  RefreshCw,
  AlertOctagon,
  ArrowRight,
} from "lucide-react";
import { ExportReport } from "./export-report";
import type { Insight, Severity } from "@/lib/extraction/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDoclyzeStore } from "@/lib/store";
import type { DoclyzeExtractionResult } from "@/lib/extraction/types";
import { toast } from "sonner";

interface InsightsPanelProps {
  insights: Insight[];
  extraction: DoclyzeExtractionResult;
  /** v4: Callback to scroll to a specific table/row in the sheet tab */
  onJumpToCell?: (target: string) => void;
}

export function InsightsPanel({ insights, extraction, onJumpToCell }: InsightsPanelProps) {
  const { settings, aiInsights, setAIInsights } = useDoclyzeStore();
  const aiState = aiInsights[extraction.documentId];

  // Auto-fetch AI insights once if enabled and not yet fetched.
  React.useEffect(() => {
    if (!settings.aiInsightsEnabled) return;
    if (aiState && aiState.status !== "idle") return;
    let cancelled = false;
    const run = async () => {
      setAIInsights(extraction.documentId, { status: "loading", insights: [] });
      try {
        const res = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(extraction),
        });
        if (cancelled) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Request failed" }));
          if (res.status === 503) {
            setAIInsights(extraction.documentId, {
              status: "not_configured",
              insights: [],
              error: data.detail ?? data.error,
            });
          } else {
            setAIInsights(extraction.documentId, {
              status: "error",
              insights: [],
              error: data.detail ?? data.error ?? `HTTP ${res.status}`,
            });
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setAIInsights(extraction.documentId, {
          status: "ready",
          insights: data.insights as Insight[],
        });
        toast.success(`Generated ${data.insights.length} AI insights`);
      } catch (err) {
        if (cancelled) return;
        setAIInsights(extraction.documentId, {
          status: "error",
          insights: [],
          error: err instanceof Error ? err.message : "Network error",
        });
      }
    };
    run();
    return () => { cancelled = true; };
  }, [settings.aiInsightsEnabled, extraction.documentId]);

  const fetchAIInsights = async () => {
    setAIInsights(extraction.documentId, { status: "loading", insights: [] });
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extraction),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        if (res.status === 503) {
          setAIInsights(extraction.documentId, {
            status: "not_configured",
            insights: [],
            error: data.detail ?? data.error,
          });
        } else {
          setAIInsights(extraction.documentId, {
            status: "error",
            insights: [],
            error: data.detail ?? data.error ?? `HTTP ${res.status}`,
          });
        }
        return;
      }
      const data = await res.json();
      setAIInsights(extraction.documentId, {
        status: "ready",
        insights: data.insights as Insight[],
      });
      toast.success(`Generated ${data.insights.length} AI insights`);
    } catch (err) {
      setAIInsights(extraction.documentId, {
        status: "error",
        insights: [],
        error: err instanceof Error ? err.message : "Network error",
      });
    }
  };

  const deterministic = insights.filter((i) => !i.aiGenerated);
  const aiGenerated = aiState?.insights ?? [];
  const allInsights = [...deterministic, ...aiGenerated];

  // Group by category
  const byCategory = React.useMemo(() => {
    const map = new Map<string, Insight[]>();
    for (const ins of allInsights) {
      const arr = map.get(ins.category) ?? [];
      arr.push(ins);
      map.set(ins.category, arr);
    }
    return Array.from(map.entries());
  }, [allInsights]);

  // Severity counts
  const counts = React.useMemo(() => {
    const c = { info: 0, notice: 0, warning: 0 };
    for (const i of allInsights) c[i.severity]++;
    return c;
  }, [allInsights]);

  /**
   * v4: Resolve an insight to a table/row target for cell linking.
   * Uses a simple heuristic: scan insight body for references to table data.
   * For now, deterministically links invoice reconciliation, resume gaps, etc.
   */
  const resolveTarget = (insight: Insight): string | null => {
    const body = insight.body.toLowerCase();
    // Invoice reconciliation: link to last row of line items table
    if (body.includes("reconcil") || body.includes("total") || body.includes("subtotal")) {
      const lineItemsTable = extraction.tables.findIndex(
        (t) => t.id.includes("line") || t.title.toLowerCase().includes("line item")
      );
      if (lineItemsTable !== -1) {
        const rowCount = extraction.tables[lineItemsTable].rows.length;
        return `${lineItemsTable}-${Math.max(0, rowCount - 1)}`;
      }
    }
    // Employment gap: link to experience table
    if (body.includes("gap") || body.includes("employment")) {
      const expTable = extraction.tables.findIndex(
        (t) => t.id.includes("experience") || t.title.toLowerCase().includes("experience")
      );
      if (expTable !== -1) return `${expTable}-0`;
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Summary */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold">Insights</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {allInsights.length} observation{allInsights.length !== 1 ? "s" : ""} · grounded in extracted data
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <SeverityBadge severity="info" count={counts.info} />
            <SeverityBadge severity="notice" count={counts.notice} />
            <SeverityBadge severity="warning" count={counts.warning} />
            <ExportReport result={extraction} className="h-7 text-[11px]" />
          </div>
        </div>
      </Card>

      {/* AI insights section */}
      {settings.aiInsightsEnabled && (
        <Card className="p-4 border-[var(--brand)]/30 bg-[var(--brand-soft)]/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--brand)] text-[var(--brand-foreground)] shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">AI deep insights</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  Generated from the structured extraction by an LLM. Always
                  grounded in the extracted data — no hallucinated facts.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAIInsights}
              disabled={aiState?.status === "loading"}
              className="h-7 text-xs"
            >
              <RefreshCw className={cn("h-3 w-3 mr-1", aiState?.status === "loading" && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="mt-3">
            <AnimatePresence mode="wait">
              {aiState?.status === "loading" && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-xs text-muted-foreground py-2"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Asking the model to synthesize deeper observations…
                </motion.div>
              )}
              {aiState?.status === "not_configured" && (
                <motion.div
                  key="not-configured"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-md border border-[var(--severity-notice)]/40 bg-background/60 p-3 text-xs"
                >
                  <p className="font-medium text-[var(--severity-notice)]">AI insights not configured</p>
                  <p className="mt-1 text-muted-foreground leading-relaxed">
                    Add a free-tier API key to{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px]">.env.local</code>{" "}
                    and restart the server. See{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-[10px]">.env.example</code>.
                  </p>
                </motion.div>
              )}
              {aiState?.status === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="rounded-md border border-[var(--severity-warning)]/40 bg-background/60 p-3 text-xs"
                >
                  <p className="font-medium text-[var(--severity-warning)] flex items-center gap-1.5">
                    <AlertOctagon className="h-3.5 w-3.5" />
                    AI insight generation failed
                  </p>
                  <p className="mt-1 text-muted-foreground">{aiState.error}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>
      )}

      {/* Insights grouped by category */}
      {byCategory.map(([category, items]) => (
        <section key={category} aria-labelledby={`cat-${category}`}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {category}
          </h3>
          <div className="flex flex-col gap-2">
            {items.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                jumpTarget={resolveTarget(insight)}
                onJump={onJumpToCell}
              />
            ))}
          </div>
        </section>
      ))}

      {allInsights.length === 0 && (
        <Card className="p-8 text-center">
          <Info className="mx-auto h-7 w-7 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium">No insights generated</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This document didn&apos;t trigger any deterministic observations.
          </p>
        </Card>
      )}
    </div>
  );
}

function InsightCard({
  insight,
  jumpTarget,
  onJump,
}: {
  insight: Insight;
  jumpTarget: string | null;
  onJump?: (target: string) => void;
}) {
  const icons: Record<Severity, React.ReactNode> = {
    info: <Info className="h-4 w-4 text-[var(--severity-info)]" />,
    notice: <AlertCircle className="h-4 w-4 text-[var(--severity-notice)]" />,
    warning: <AlertTriangle className="h-4 w-4 text-[var(--severity-warning)]" />,
  };
  const borders: Record<Severity, string> = {
    info: "border-l-[var(--severity-info)]",
    notice: "border-l-[var(--severity-notice)]",
    warning: "border-l-[var(--severity-warning)]",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={cn("p-3.5 border-l-2", borders[insight.severity])}>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 shrink-0">{icons[insight.severity]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold leading-snug">{insight.title}</h4>
              {insight.aiGenerated && (
                <Badge variant="outline" className="text-[9px] uppercase tracking-wide border-[var(--brand)]/40 text-[var(--brand)]">
                  <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                  AI
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {insight.body}
            </p>
            {jumpTarget && onJump && (
              <button
                onClick={() => onJump(jumpTarget)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--brand)] hover:underline transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <ArrowRight className="h-3 w-3" />
                View in sheet
              </button>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function SeverityBadge({ severity, count }: { severity: Severity; count: number }) {
  const colors: Record<Severity, string> = {
    info: "text-[var(--severity-info)]",
    notice: "text-[var(--severity-notice)]",
    warning: "text-[var(--severity-warning)]",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono", colors[severity])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {count} {severity}
    </span>
  );
}
