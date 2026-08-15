"use client";

import * as React from "react";
import { Trash2, Download, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDoclyzeStore } from "@/lib/store";
import { toast } from "sonner";

export function DataManagementSection() {
  const { documents, clearDocuments, clearAllData } = useDoclyzeStore();
  const docCount = documents.length;

  // Estimate localStorage usage (rough: each stored doc is ~200-500 bytes)
  const estimatedBytes = docCount * 400;
  const estimatedKB = (estimatedBytes / 1024).toFixed(1);
  const usagePercent = Math.min(100, Math.round((estimatedBytes / (5 * 1024 * 1024)) * 100));

  const handleExport = () => {
    const exportData = documents.map((d) => ({
      filename: d.filename,
      type: d.detectedType,
      confidence: d.classificationConfidence,
      completeness: d.completenessScore,
      ocrUsed: d.ocrUsed,
      extractedAt: d.extractedAt,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doclyze-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${docCount} document(s) to JSON`);
  };

  const handleClearHistory = () => {
    clearDocuments();
    toast.success("Document history cleared");
  };

  const handleClearAll = () => {
    clearAllData();
    toast.success("All Doclyze data cleared");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Stored documents</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {docCount} / 20 · ~{estimatedKB} KB estimated
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Document analysis history is stored locally in your browser.
        It is never sent to any server.
      </p>
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          className="justify-start"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export document history
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearHistory}
          className="justify-start"
          disabled={docCount === 0}
        >
          Clear document history
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClearAll}
        className="text-destructive hover:text-destructive border-destructive/50 hover:bg-destructive/10 justify-start"
      >
        Clear all data
        <HardDrive className="h-3.5 w-3.5" />
      </Button>
      <p className="mt-1 text-[10px] text-muted-foreground/60">
        This removes all documents, annotations, field corrections,
        and settings. It cannot be undone.
      </p>
    </div>
  );
}
