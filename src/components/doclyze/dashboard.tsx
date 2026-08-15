"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  FileSearch,
  Upload,
  Clock,
  Trash2,
  ArrowRight,
  FileText,
  Table2,
  FileType2,
  Receipt,
  ScrollText,
  GraduationCap,
  FileBarChart,
  Sparkles,
  Search,
  Filter,
  LayoutGrid,
  BarChart3,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useDoclyzeStore } from "@/lib/store";
import { labelForType } from "@/lib/extraction/orchestrator";
import type { DocType } from "@/lib/extraction/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<DocType, React.ReactNode> = {
  resume: <FileText className="h-4 w-4" />,
  invoice: <Receipt className="h-4 w-4" />,
  contract: <ScrollText className="h-4 w-4" />,
  research_paper: <GraduationCap className="h-4 w-4" />,
  spreadsheet: <Table2 className="h-4 w-4" />,
  general: <FileBarChart className="h-4 w-4" />,
  academic_transcript: <GraduationCap className="h-4 w-4" />,
  purchase_order: <Receipt className="h-4 w-4" />,
  financial_statement: <FileBarChart className="h-4 w-4" />,
  medical_report: <FileText className="h-4 w-4" />,
  correspondence: <FileText className="h-4 w-4" />,
};

const TYPE_OPTIONS: { value: DocType | "all"; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "resume", label: "Resume / CV" },
  { value: "invoice", label: "Invoice / Receipt" },
  { value: "contract", label: "Contract / Agreement" },
  { value: "research_paper", label: "Research Paper" },
  { value: "spreadsheet", label: "Spreadsheet" },
  { value: "general", label: "General Document" },
  { value: "academic_transcript", label: "Academic Transcript" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "financial_statement", label: "Financial Statement" },
  { value: "medical_report", label: "Medical Report" },
  { value: "correspondence", label: "Correspondence / Letter" },
];

const COMING_SOON: { label: string; tooltip: string }[] = [
  { label: ".pptx", tooltip: "PowerPoint parsing — on the roadmap. Stubbed for v1." },
];

interface DashboardProps {
  onOpenSettings?: () => void;
}

export function Dashboard({ onOpenSettings }: DashboardProps) {
  const router = useRouter();
  const { documents, openDocument, removeDocument, clearDocuments } = useDoclyzeStore();

  // Search & filter state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<DocType | "all">("all");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; filename: string } | null>(null);

  // Filtered documents
  const filteredDocs = React.useMemo(() => {
    return documents.filter((doc) => {
      // Text search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!doc.filename.toLowerCase().includes(q) && !labelForType(doc.detectedType).toLowerCase().includes(q)) {
          return false;
        }
      }
      // Type filter
      if (typeFilter !== "all" && doc.detectedType !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [documents, searchQuery, typeFilter]);

  // Stats
  const totalDocs = documents.length;
  const typeBreakdown = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const doc of documents) {
      counts[doc.detectedType] = (counts[doc.detectedType] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [documents]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-14">
        {/* Header / Hero */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Analyze documents, explore structured extractions, and surface insights —
            all running locally in your browser.
          </p>
        </motion.div>

        {/* Stats Cards */}
        {documents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            <StatCard
              icon={<BarChart3 className="h-4 w-4" />}
              label="Total Analyzed"
              value={String(totalDocs)}
            />
            <StatCard
              icon={<LayoutGrid className="h-4 w-4" />}
              label="Types Detected"
              value={String(typeBreakdown.length)}
            />
            <StatCard
              icon={<Sparkles className="h-4 w-4" />}
              label="Avg Completeness"
              value={`${Math.round(
                documents.reduce((acc, d) => acc + d.completenessScore, 0) / documents.length
              )}%`}
            />
            <StatCard
              icon={<FileBarChart className="h-4 w-4" />}
              label="Most Common"
              value={typeBreakdown.length > 0 ? labelForType(typeBreakdown[0][0]).split(" ")[0] : "—"}
            />
          </motion.div>
        )}

        {/* Analytics Charts — only shown when documents exist */}
        {documents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            {/* Documents by type bar chart */}
            <Card className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Documents by type
              </h3>
              {typeBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={typeBreakdown.map(([type, count]) => ({ name: labelForType(type).split(" ")[0], count }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }} />
                    <Bar dataKey="count" fill="var(--brand, #b45309)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">No data yet</p>
              )}
            </Card>

            {/* Completeness trend line chart */}
            <Card className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Completeness trend
              </h3>
              {documents.length >= 2 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={documents.slice(0, 10).reverse().map((d, i) => ({ name: d.filename.length > 12 ? d.filename.slice(0, 12) + "..." : d.filename, score: d.completenessScore }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <RTooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }} />
                    <Line type="monotone" dataKey="score" stroke="var(--brand, #b45309)" strokeWidth={2} dot={{ r: 3, fill: "var(--brand, #b45309)" }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">Analyze at least 2 documents to see a trend</p>
              )}
            </Card>
          </motion.div>
        )}

        {/* Quick upload card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="mt-8"
        >
          <Card className="p-0 overflow-hidden border-border cursor-pointer" onClick={() => router.push("/analyzer")} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/analyzer'); } }}>
            <div className="group flex w-full flex-col items-center gap-3 px-6 py-10 text-left transition-colors hover:bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Upload a document">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)] transition-transform group-hover:scale-105">
                <Upload className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold">Drop a document here to get started</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  PDF · DOCX · TXT · MD · CSV · Images — up to 25 MB each · Batch upload supported
                </p>
              </div>
              <Button size="sm" className="mt-2 bg-foreground text-background hover:bg-foreground/90" onClick={(e) => { e.stopPropagation(); router.push('/analyzer'); }}>
                Open analyzer
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* Supported types */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Supported types
          </h2>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {(Object.keys(TYPE_ICONS) as DocType[]).map((t) => (
              <div
                key={t}
                className="flex flex-col items-start gap-2 rounded-lg border border-border bg-background p-3"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-foreground">
                  {TYPE_ICONS[t]}
                </div>
                <div>
                  <p className="text-xs font-medium leading-tight">{labelForType(t)}</p>
                </div>
              </div>
            ))}
          </div>
          {/* Coming soon */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Coming soon:</span>
            {COMING_SOON.map((c) => (
              <TooltipProvider key={c.label} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground/70 cursor-not-allowed">
                      {c.label}
                      <span className="text-[9px] uppercase">soon</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{c.tooltip}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
        </div>

        {/* Recent documents with search/filter */}
        <div className="mt-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              Recent documents
              {documents.length > 0 && filteredDocs.length !== documents.length && (
                <span className="text-[10px] font-normal text-muted-foreground/70">
                  ({filteredDocs.length} shown)
                </span>
              )}
            </h2>
            {documents.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("Clear all recent documents? This cannot be undone.")) {
                    clearDocuments();
                    setSearchQuery("");
                    setTypeFilter("all");
                  }
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear all
              </Button>
            )}
          </div>

          {/* Search & filter controls */}
          {documents.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by filename…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <Filter className="h-3 w-3" />
                    {typeFilter === "all" ? "All types" : labelForType(typeFilter).split("/")[0].trim()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-1" align="start">
                  <div className="flex flex-col gap-0.5">
                    {TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setTypeFilter(opt.value)}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors text-left w-full",
                          typeFilter === opt.value
                            ? "bg-[var(--brand-soft)] text-foreground font-medium"
                            : "text-muted-foreground hover:bg-muted/60"
                        )}
                      >
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{
                          backgroundColor: typeFilter === opt.value ? "var(--brand)" : "transparent",
                          border: typeFilter === opt.value ? "none" : "1px solid var(--border)",
                        }} />
                        {opt.label}
                        {opt.value !== "all" && documents.filter((d) => d.detectedType === opt.value).length > 0 && (
                          <span className="ml-auto text-[10px] text-muted-foreground/60">
                            {documents.filter((d) => d.detectedType === opt.value).length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {(searchQuery || typeFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setSearchQuery("");
                    setTypeFilter("all");
                  }}
                >
                  Reset
                </Button>
              )}
            </div>
          )}

          {documents.length === 0 ? (
            <Card className="mt-3 p-8 text-center">
              <FileSearch className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">No documents yet</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Once you analyze a document, it will appear here. Recent docs are
                stored locally in your browser.
              </p>
              <Button
                size="sm"
                onClick={() => router.push("/analyzer")}
                className="mt-4 bg-foreground text-background hover:bg-foreground/90"
              >
                Analyze your first document
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Card>
          ) : filteredDocs.length === 0 ? (
            <Card className="mt-3 p-8 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">No matching documents</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Try adjusting your search or filter to find what you&apos;re looking for.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setTypeFilter("all");
                }}
                className="mt-4"
              >
                Clear filters
              </Button>
            </Card>
          ) : (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredDocs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/analyzer/${doc.id}`}
                  onClick={() => openDocument(doc.id)}
                  className="block"
                >
                  <Card className="group p-0 hover:border-foreground/20 transition-colors">
                    <div className="flex items-start gap-3 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)] shrink-0">
                        {TYPE_ICONS[doc.detectedType as DocType] ?? <FileText className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.filename}</p>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide">
                            {labelForType(doc.detectedType)}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {relativeTime(doc.extractedAt)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">·</span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatSize(doc.fileSizeBytes)}
                          </span>
                          {doc.ocrUsed && (
                            <Badge variant="outline" className="text-[9px] uppercase border-[var(--severity-notice)]/40 text-[var(--severity-notice)]">
                              OCR
                            </Badge>
                          )}
                        </div>
                        {/* Completeness bar */}
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                doc.completenessScore >= 75
                                  ? "bg-[var(--confidence-high)]"
                                  : doc.completenessScore >= 50
                                  ? "bg-[var(--confidence-medium)]"
                                  : "bg-[var(--severity-warning)]"
                              )}
                              style={{ width: `${doc.completenessScore}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {doc.completenessScore}%
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setDeleteTarget({ id: doc.id, filename: doc.filename });
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded"
                        aria-label={`Remove ${doc.filename}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Hint */}
        <div className="mt-12 flex items-center gap-2 text-xs text-muted-foreground/70">
          <Sparkles className="h-3.5 w-3.5" />
          Tip: enable AI Insights in Settings to surface non-obvious patterns from your extractions.
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove document?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove &quot;{deleteTarget?.filename}&quot; from your recent documents? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  removeDocument(deleteTarget.id);
                  toast.success("Document removed");
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-bold tracking-tight">{value}</p>
    </Card>
  );
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
