"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  FileText,
  Table2,
  Sparkles,
  Code2,
  RotateCcw,
  FileWarning,
  Type,
  XCircle,
  Files,
  Upload,
  RefreshCw,
  AlertTriangle,
  TreePine,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useDoclyzeStore } from "@/lib/store";
import { Dropzone } from "./dropzone";
import { DocumentPresentor } from "./document-presentor";
import { StructureView } from "./presentor/structure-view";
import { DocumentPresentorSkeleton, InsightsPanelSkeleton } from "./presentor/skeletons";
import { InsightsPanel } from "./insights-panel";
import { runExtractionPipeline, ProgressUpdate, ProgressStage } from "@/lib/extraction/orchestrator";
import { labelForType } from "@/lib/extraction/orchestrator";
import type { DoclyzeExtractionResult, DocType } from "@/lib/extraction/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STAGE_ORDER: ProgressStage[] = [
  "reading_file",
  "extracting_text",
  "running_ocr",
  "classifying_document",
  "extracting_structured_data",
  "scoring_and_generating_insights",
  "complete",
];

const STAGE_LABELS: Record<ProgressStage, string> = {
  reading_file: "Reading file",
  extracting_text: "Extracting text",
  running_ocr: "Running OCR",
  classifying_document: "Classifying document",
  extracting_structured_data: "Extracting structured data",
  scoring_and_generating_insights: "Scoring & generating insights",
  complete: "Complete",
  error: "Error",
};

type BatchFileStatus = "queued" | "processing" | "complete" | "error";

interface BatchItem {
  file: File;
  status: BatchFileStatus;
  result?: DoclyzeExtractionResult;
  error?: string;
  progress?: ProgressUpdate;
}

export function Analyzer() {
  const router = useRouter();
  const { activeDocumentId, documents, addDocument } = useDoclyzeStore();
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState("sheet");
  const fabInputRef = React.useRef<HTMLInputElement>(null);

  // v4: Insight-to-cell linking state
  const [highlightTarget, setHighlightTarget] = React.useState<string | null>(null);

  // Batch state
  const [batchQueue, setBatchQueue] = React.useState<BatchItem[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = React.useState(false);

  // Single file progress state (for single file backwards compat)
  const [progress, setProgress] = React.useState<ProgressUpdate | null>(null);

  // Get the active document — re-load full result if missing (e.g. after refresh)
  const activeDoc = documents.find((d) => d.id === activeDocumentId);
  const [fullResult, setFullResult] = React.useState<DoclyzeExtractionResult | null>(null);

  React.useEffect(() => {
    // If we have an active doc but no full result, check if the doc has one
    if (activeDoc?.result) {
      setFullResult(activeDoc.result);
    } else if (!activeDocumentId) {
      setFullResult(null);
    } else {
      // Result was stripped from persistence — user needs to re-analyze
      setFullResult(null);
    }
    // activeDoc.result is intentionally not in deps — we want this to fire only
    // when the active document ID changes, not when the documents array updates.
  }, [activeDocumentId]);

  const handleFile = async (file: File) => {
    setError(null);
    setProgress({ stage: "reading_file", progress: 0.05, label: "Reading file" });
    setFullResult(null);
    try {
      const result = await runExtractionPipeline(file, (update) => {
        setProgress(update);
      });
      setProgress(null);
      setFullResult(result);
      addDocument({
        id: result.documentId,
        filename: result.filename,
        detectedType: result.detectedType,
        classificationConfidence: result.classificationConfidence,
        fileSizeBytes: result.fileSizeBytes,
        extractedAt: result.extractedAt,
        completenessScore: result.completenessScore,
        ocrUsed: result.ocrUsed,
        result,
      });
      router.push(`/analyzer/${result.documentId}`);
      toast.success(`Analyzed as ${labelForType(result.detectedType)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setProgress(null);
      // Content-blocking error — the inline error state below handles display.
      // No toast needed: the full-page error card is the sole feedback mechanism.
    }
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (files.length === 1) {
      handleFile(files[0]);
      return;
    }

    setError(null);
    setFullResult(null);
    setProgress(null);
    setIsBatchProcessing(true);

    const queue: BatchItem[] = files.map((file) => ({
      file,
      status: "queued" as BatchFileStatus,
    }));
    setBatchQueue(queue);

    // Process files sequentially
    let completedCount = 0;
    for (let i = 0; i < queue.length; i++) {
      setBatchQueue((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: "processing" as BatchFileStatus } : item
        )
      );

      try {
        const result = await runExtractionPipeline(queue[i].file, (update) => {
          setBatchQueue((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, progress: update } : item
            )
          );
        });
        setBatchQueue((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? { ...item, status: "complete" as BatchFileStatus, result, progress: { stage: "complete", progress: 1, label: "Complete" } }
              : item
          )
        );
        addDocument({
          id: result.documentId,
          filename: result.filename,
          detectedType: result.detectedType,
          classificationConfidence: result.classificationConfidence,
          fileSizeBytes: result.fileSizeBytes,
          extractedAt: result.extractedAt,
          completenessScore: result.completenessScore,
          ocrUsed: result.ocrUsed,
          result,
        });
        completedCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setBatchQueue((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? { ...item, status: "error" as BatchFileStatus, error: message }
              : item
          )
        );
      }
    }

    // Switch to the last completed document
    if (completedCount > 0) {
      // We look at the latest added doc from the store
      const latestDoc = useDoclyzeStore.getState().documents[0];
      if (latestDoc) {
        setFullResult(latestDoc.result ?? null);
        router.push(`/analyzer/${latestDoc.id}`);
      }
    }

    const successCount = queue.filter((_, idx) => {
      // check final state
      return true; // We'll count based on completedCount
    }).length;

    setIsBatchProcessing(false);
    toast.success(
      `Batch complete: ${completedCount} of ${files.length} file${files.length !== 1 ? "s" : ""} analyzed`
    );
  };

  // v5: Manual reclassification — re-run extraction with a forced type
  const [isReclassifying, setIsReclassifying] = React.useState(false);

  // Store the raw file for reclassification
  const pendingFileRef = React.useRef<File | null>(null);

  const handleReclassify = React.useCallback(async (newType: DocType) => {
    if (!fullResult || isReclassifying) return;
    setIsReclassifying(true);
    try {
      // Re-run the pipeline with a classification override
      // We create a synthetic file-like object from the raw text
      const blob = new Blob([fullResult.rawText], { type: fullResult.fileType });
      const syntheticFile = new File([blob], fullResult.filename, { type: fullResult.fileType });

      const result = await runExtractionPipeline(syntheticFile, (update) => {
        // Suppress progress for reclassification
      }, newType);

      setFullResult(result);
      addDocument({
        id: result.documentId,
        filename: result.filename,
        detectedType: result.detectedType,
        classificationConfidence: result.classificationConfidence,
        fileSizeBytes: result.fileSizeBytes,
        extractedAt: result.extractedAt,
        completenessScore: result.completenessScore,
        ocrUsed: result.ocrUsed,
        result,
      });
      toast.success(`Reclassified as ${labelForType(result.detectedType)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reclassification failed";
      toast.error(message);
    } finally {
      setIsReclassifying(false);
    }
  }, [fullResult, isReclassifying, addDocument]);

  // ─── Empty state: no file uploaded yet ─────────────────────────────────────
  if (!fullResult && !progress && !error && batchQueue.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10 md:py-14">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to dashboard
          </button>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Document Analyzer
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Drop one or more files and Doclyze will classify, extract, score, and surface
            insights — all in your browser.
          </p>
          <div className="mt-8">
            <Dropzone onFiles={handleFiles} />
          </div>

          {/* What happens next */}
          <Card className="mt-8 p-5">
            <h2 className="text-sm font-semibold mb-3">What happens after upload</h2>
            <ol className="space-y-2.5">
              {STAGE_ORDER.slice(0, -1).map((stage, i) => (
                <li key={stage} className="flex items-center gap-3 text-sm">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-mono font-semibold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span>{STAGE_LABELS[stage]}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Batch progress state ──────────────────────────────────────────────────
  if (batchQueue.length > 1 || isBatchProcessing) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10 md:py-14">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to dashboard
          </button>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Batch Processing
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Analyzing {batchQueue.length} file{batchQueue.length !== 1 ? "s" : ""} sequentially.
          </p>

          {/* Overall progress */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-muted-foreground font-medium">
                {batchQueue.filter((f) => f.status === "complete").length} of {batchQueue.length} complete
                {batchQueue.some((f) => f.status === "error") && (
                  <span className="ml-2 text-[var(--severity-warning)]">
                    · {batchQueue.filter((f) => f.status === "error").length} failed
                  </span>
                )}
              </span>
              <span className="font-mono text-muted-foreground">
                {Math.round(
                  (batchQueue.filter((f) => f.status === "complete" || f.status === "error").length / batchQueue.length) * 100
                )}%
              </span>
            </div>
            <Progress
              value={
                (batchQueue.filter((f) => f.status === "complete" || f.status === "error").length / batchQueue.length) * 100
              }
              className="h-2"
            />
          </div>

          {/* Per-file list */}
          <div className="mt-6 flex flex-col gap-2">
            {batchQueue.map((item, i) => (
              <BatchFileCard key={`${item.file.name}-${i}`} item={item} index={i} />
            ))}
          </div>

          {/* Done actions */}
          {!isBatchProcessing && batchQueue.every((f) => f.status === "complete" || f.status === "error") && (
            <div className="mt-8 flex items-center gap-3">
              <Button
                onClick={() => {
                  setBatchQueue([]);
                  setError(null);
                  setFullResult(null);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Analyze more files
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/dashboard")}
              >
                Back to dashboard
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────────
  if (error && !progress && !fullResult) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10 md:py-14">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to dashboard
          </button>
          <Card className="p-8 border-[var(--severity-warning)]/40">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--severity-warning)]/10 text-[var(--severity-warning)] shrink-0">
                <FileWarning className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">Couldn&apos;t analyze that file</h2>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {error}
                </p>
                <Button
                  onClick={() => {
                    setError(null);
                  }}
                  className="mt-4"
                  variant="outline"
                  size="sm"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Try another file
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Progress state with structural skeleton ───────────────────────────
  if (progress && !fullResult) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="flex flex-col items-center text-center">
            <div className="relative h-16 w-16">
              <Loader2 className="absolute inset-0 h-16 w-16 animate-spin text-muted-foreground/30" />
              <div className="absolute inset-0 flex items-center justify-center">
                <FileText className="h-7 w-7 text-[var(--brand)]" />
              </div>
            </div>
            <h2 className="mt-6 text-xl font-semibold">Analyzing…</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {progress.label}
            </p>

            {/* Progress bar */}
            <div className="mt-6 w-full max-w-sm">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[var(--brand)]"
                  animate={{ width: `${progress.progress * 100}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
              <p className="mt-2 text-[10px] font-mono text-muted-foreground text-right">
                {Math.round(progress.progress * 100)}%
              </p>
            </div>

            {/* Stage list */}
            <div className="mt-8 w-full max-w-sm space-y-1.5">
              {STAGE_ORDER.filter((s) => s !== "complete" && s !== "error").map((stage) => {
                const currentIdx = STAGE_ORDER.indexOf(progress.stage);
                const stageIdx = STAGE_ORDER.indexOf(stage);
                const done = stageIdx < currentIdx;
                const current = stage === progress.stage;
                const skipped = stage === "running_ocr" && currentIdx > STAGE_ORDER.indexOf("running_ocr") && !done;
                return (
                  <div
                    key={stage}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs transition-colors",
                      current && "bg-[var(--brand-soft)] text-foreground",
                      done && "text-muted-foreground",
                      !current && !done && "text-muted-foreground/60",
                      skipped && "opacity-40"
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--confidence-high)]" />
                    ) : current ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--brand)]" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-current" />
                    )}
                    <span>{STAGE_LABELS[stage]}</span>
                    {skipped && <span className="ml-auto text-[10px] italic">skipped</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Results state ─────────────────────────────────────────────────────────
  if (!fullResult) return null;

  const docTypeLabel = labelForType(fullResult.detectedType);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="min-w-0 flex-1">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight truncate">
                {fullResult.filename}
              </h1>
              <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wide">
                {docTypeLabel}
              </Badge>
              {/* v5: Classification confidence badge */}
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-mono",
                  fullResult.classificationConfidence >= 70
                    ? "border-[var(--confidence-high)]/40 text-[var(--confidence-high)]"
                    : fullResult.classificationConfidence >= 40
                    ? "border-[var(--confidence-medium)]/40 text-[var(--confidence-medium)]"
                    : "border-[var(--severity-warning)]/40 text-[var(--severity-warning)]"
                )}
              >
                confidence {fullResult.classificationConfidence}/100
              </Badge>
              {fullResult.ocrUsed && (
                <Badge variant="outline" className="text-[10px] uppercase border-[var(--severity-notice)]/40 text-[var(--severity-notice)]">
                  OCR
                </Badge>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {formatSize(fullResult.fileSizeBytes)} · analyzed {new Date(fullResult.extractedAt).toLocaleString()} ·{" "}
              <span className={
                fullResult.completenessScore >= 75
                  ? "text-[var(--confidence-high)]"
                  : fullResult.completenessScore >= 50
                  ? "text-[var(--confidence-medium)]"
                  : "text-[var(--severity-warning)]"
              }>
                {fullResult.completenessScore}% completeness
              </span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFullResult(null);
              setProgress(null);
              setError(null);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Analyze another
          </Button>
        </div>

        {/* Completeness bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-muted-foreground font-medium">Extraction completeness</span>
            <span className="font-mono text-muted-foreground">{fullResult.completenessScore}/100</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className={cn(
                "h-full rounded-full",
                fullResult.completenessScore >= 75
                  ? "bg-[var(--confidence-high)]"
                  : fullResult.completenessScore >= 50
                  ? "bg-[var(--confidence-medium)]"
                  : "bg-[var(--severity-warning)]"
              )}
              initial={{ width: 0 }}
              animate={{ width: `${fullResult.completenessScore}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* v5: Document-level extraction quality summary + reclassification control */}
        <ClassificationControl fullResult={fullResult} onReclassify={handleReclassify} />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-muted/40 p-1 h-auto">
            <TabsTrigger value="structure" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1.5">
              <TreePine className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Structure</span>
              <span className="sm:hidden">Tree</span>
            </TabsTrigger>
            <TabsTrigger value="sheet" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1.5">
              <Table2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Structured Sheet</span>
              <span className="sm:hidden">Sheet</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Insights</span>
              <span className="sm:hidden">Insights</span>
              {fullResult.insights.length > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground text-background text-[9px] font-mono px-1">
                  {fullResult.insights.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="raw" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1.5">
              <Code2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Raw Text</span>
              <span className="sm:hidden">Text</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="structure" className="mt-6 focus-visible:outline-none">
            {fullResult.structureTree && fullResult.structureTree.length > 0 ? (
              <StructureView tree={fullResult.structureTree} />
            ) : (
              <Card className="p-8 text-center">
                <TreePine className="mx-auto h-6 w-6 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No hierarchical structure was extracted. This view is available for documents where heading detection succeeded (e.g. PDFs with varying font sizes, or documents with Markdown headings).
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sheet" className="mt-6 focus-visible:outline-none">
            <DocumentPresentor
              tables={fullResult.tables}
              fieldGroups={fullResult.fieldGroups}
              filename={fullResult.filename.replace(/\.[^.]+$/, "")}
              documentId={fullResult.documentId}
              rawText={fullResult.rawText}
              highlightTarget={highlightTarget}
              onClearHighlight={() => setHighlightTarget(null)}
            />
          </TabsContent>

          <TabsContent value="insights" className="mt-6 focus-visible:outline-none">
            <InsightsPanel
              insights={fullResult.insights}
              extraction={fullResult}
              onJumpToCell={(target) => {
                setHighlightTarget(target);
                setActiveTab("sheet");
              }}
            />
          </TabsContent>

          <TabsContent value="raw" className="mt-6 focus-visible:outline-none">
            <RawTextView result={fullResult} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Mobile FAB for quick upload */}
      <input
        ref={fabInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.doc,.txt,.md,.markdown,.csv,.tsv,.xlsx,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => fabInputRef.current?.click()}
        className="md:hidden fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-foreground)] shadow-lg hover:opacity-90 active:scale-95 transition-all [bottom:calc(1.25rem+env(safe-area-inset-bottom,0px))]"
        aria-label="Upload new file"
      >
        <Upload className="h-5 w-5" />
      </button>
    </div>
  );
}

function BatchFileCard({ item, index }: { item: BatchItem; index: number }) {
  const statusColors: Record<BatchFileStatus, string> = {
    queued: "text-muted-foreground",
    processing: "text-[var(--brand)]",
    complete: "text-[var(--confidence-high)]",
    error: "text-[var(--severity-warning)]",
  };

  const statusIcons: Record<BatchFileStatus, React.ReactNode> = {
    queued: <div className="h-3.5 w-3.5 rounded-full border border-current" />,
    processing: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    complete: <CheckCircle2 className="h-3.5 w-3.5" />,
    error: <XCircle className="h-3.5 w-3.5" />,
  };

  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <span className={cn("shrink-0", statusColors[item.status])}>
          {statusIcons[item.status]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{item.file.name}</p>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatSize(item.file.size)}
            </span>
          </div>
          {item.status === "processing" && item.progress && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {item.progress.label} · {Math.round(item.progress.progress * 100)}%
            </p>
          )}
          {item.status === "complete" && (
            <p className="text-[11px] text-[var(--confidence-high)] mt-0.5">
              Analyzed as {labelForType(item.result?.detectedType ?? "general")}
            </p>
          )}
          {item.status === "error" && (
            <p className="text-[11px] text-[var(--severity-warning)] mt-0.5 truncate">
              {item.error}
            </p>
          )}
          {item.status === "queued" && (
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              Waiting in queue…
            </p>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
          #{index + 1}
        </span>
      </div>
    </Card>
  );
}

function RawTextView({ result }: { result: DoclyzeExtractionResult }) {
  const [view, setView] = React.useState<"text" | "pages">("text");
  const [redactEnabled, setRedactEnabled] = React.useState(false);
  const wordCount = result.rawText.split(/\s+/).filter(Boolean).length;

  // Redaction logic
  const [redactedText, setRedactedText] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!redactEnabled) {
      setRedactedText(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const { detectPII } = await import("@/lib/extraction/pii-detector");
        const { redactText } = await import("@/lib/extraction/redact");
        const findings = detectPII(result.rawText);
        const redacted = redactText(result.rawText, findings);
        if (!cancelled) setRedactedText(redacted);
      } catch {
        if (!cancelled) setRedactedText(null);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [redactEnabled, result.rawText]);

  const displayText = redactEnabled ? (redactedText ?? result.rawText) : result.rawText;
  const displayPages = redactEnabled && redactedText
    ? redactedText.split("\n\n") // Simple page split
    : result.pages;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Type className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            {wordCount.toLocaleString()} words · {result.rawText.length.toLocaleString()} chars
          </span>
          <button
            onClick={() => setRedactEnabled(!redactEnabled)}
            className={cn(
              "ml-2 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              redactEnabled
                ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]"
                : "border-border text-muted-foreground hover:bg-muted/60"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", redactEnabled ? "bg-[var(--brand)]" : "bg-muted-foreground/40")} />
            {redactEnabled ? "PII masked" : "Mask PII"}
          </button>
        </div>
        {result.pages.length > 1 && !redactEnabled && (
          <div className="flex items-center gap-1 text-[11px]">
            <button
              onClick={() => setView("text")}
              className={cn(
                "px-2 py-1 rounded",
                view === "text" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
              )}
            >
              All text
            </button>
            <button
              onClick={() => setView("pages")}
              className={cn(
                "px-2 py-1 rounded",
                view === "pages" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
              )}
            >
              By page ({result.pages.length})
            </button>
          </div>
        )}
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {view === "text" || redactEnabled ? (
          <pre className="p-4 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words leading-relaxed">
            {displayText || "(no text extracted)"}
          </pre>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {result.pages.map((page, i) => (
              <div key={i} className="border border-border rounded-md">
                <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Page {i + 1}
                </div>
                <pre className="p-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-words leading-relaxed">
                  {page || "(no text on this page)"}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** v5: Classification confidence display + manual reclassification control */
const RECLASSIFY_OPTIONS: { value: DocType; label: string }[] = [
  { value: "resume", label: "Resume / CV" },
  { value: "invoice", label: "Invoice / Receipt" },
  { value: "contract", label: "Contract / Agreement" },
  { value: "research_paper", label: "Research Paper" },
  { value: "academic_transcript", label: "Academic Transcript" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "financial_statement", label: "Financial Statement" },
  { value: "medical_report", label: "Medical / Lab Report" },
  { value: "general", label: "General Document" },
];

function ClassificationControl({
  fullResult,
  onReclassify,
}: {
  fullResult: DoclyzeExtractionResult;
  onReclassify: (type: DocType) => void;
}) {
  const [showPicker, setShowPicker] = React.useState(false);
  const conf = fullResult.classificationConfidence;
  const isLow = conf < 40;

  // Count fields for quality summary
  const totalFields = fullResult.fieldGroups.reduce((s, fg) => s + fg.fields.length, 0);
  const filledFields = fullResult.fieldGroups.reduce(
    (s, fg) => s + fg.fields.filter((f) => f.value !== null).length,
    0
  );
  const lowConfFields = fullResult.fieldGroups.reduce(
    (s, fg) => s + fg.fields.filter((f) => f.confidence === "low" && f.value !== null).length,
    0
  );

  return (
    <div className={cn(
      "mb-6 rounded-lg border p-3 text-xs",
      isLow
        ? "border-[var(--severity-warning)]/40 bg-[var(--severity-warning)]/5"
        : "border-border bg-muted/30"
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isLow && <AlertTriangle className="h-3.5 w-3.5 text-[var(--severity-warning)] shrink-0" />}
            <span className="font-medium">{isLow ? "Low classification confidence" : "Extraction quality"}</span>
          </div>
          <p className="mt-0.5 text-muted-foreground">
            {filledFields} of {totalFields} fields found{lowConfFields > 0 ? `, ${lowConfFields} low-confidence` : ""}
            {isLow && " — consider reclassifying manually"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showPicker ? (
            <div className="flex items-center gap-1.5">
              <select
                autoFocus
                className="h-7 rounded-md border border-border bg-background px-2 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                defaultValue={fullResult.detectedType}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowPicker(false);
                }}
                onChange={(e) => {
                  onReclassify(e.target.value as DocType);
                  setShowPicker(false);
                }}
              >
                {RECLASSIFY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => setShowPicker(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cancel reclassification"
              >
                <XCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] gap-1"
              onClick={() => setShowPicker(true)}
            >
              <RefreshCw className="h-3 w-3" />
              Reclassify
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
