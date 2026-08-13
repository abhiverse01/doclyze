"use client";

import * as React from "react";
import { Download, FileJson, FileText, FileOutput } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { DoclyzeExtractionResult, Insight } from "@/lib/extraction/types";
import { labelForType } from "@/lib/extraction/orchestrator";
import { useDoclyzeStore } from "@/lib/store";

interface ExportReportProps {
  result: DoclyzeExtractionResult;
  /** Optional className for the trigger button */
  className?: string;
}

export function ExportReport({ result, className }: ExportReportProps) {
  const { fieldCorrections, annotations } = useDoclyzeStore();

  const exportJSON = () => {
    try {
      const data = JSON.stringify(result, null, 2);
      const blob = new Blob([data], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.filename.replace(/\.[^.]+$/, "")}_report.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported full report as JSON");
    } catch {
      toast.error("Failed to export JSON");
    }
  };

  const exportText = () => {
    try {
      const lines: string[] = [];

      // Header
      const separator = "═".repeat(60);
      const thinSeparator = "─".repeat(60);
      lines.push(separator);
      lines.push(`  DOCLYZE EXTRACTION REPORT`);
      lines.push(separator);
      lines.push("");
      lines.push(`  Document:   ${result.filename}`);
      lines.push(`  Type:       ${labelForType(result.detectedType)}`);
      lines.push(`  Size:       ${result.fileSizeBytes.toLocaleString()} bytes`);
      lines.push(`  Analyzed:   ${new Date(result.extractedAt).toLocaleString()}`);
      lines.push(`  OCR:        ${result.ocrUsed ? "Yes" : "No"}`);
      lines.push(`  Score:      ${result.completenessScore}/100`);
      lines.push("");
      lines.push(separator);
      lines.push("");

      // Field Groups (with corrections)
      for (const group of result.fieldGroups) {
        lines.push(`  ┌─ ${group.title}`);
        lines.push(`  │`);
        for (const field of group.fields) {
          const ck = `${result.documentId}::${field.key}`;
          const correction = fieldCorrections[ck];
          const val = correction ? correction.value : (field.value ?? "—");
          const conf = `[${field.confidence.toUpperCase()}]`;
          const editedTag = correction ? " [EDITED]" : "";
          lines.push(`  │  ${field.label}: ${val} ${conf}${editedTag}`);
        }
        lines.push(`  └── (${group.fields.filter((f) => f.value !== null).length}/${group.fields.length} found)`);
        lines.push("");
      }

      // Tables
      for (const table of result.tables) {
        lines.push(separator);
        lines.push(`  TABLE: ${table.title}`);
        if (table.description) {
          lines.push(`  ${table.description}`);
        }
        lines.push(thinSeparator);
        lines.push("");

        const colWidths = table.columns.map((col) => {
          const labelLen = col.label.length;
          const maxDataLen = table.rows.reduce((max, row) => {
            const v = row[col.id];
            return Math.max(max, v !== null && v !== undefined ? String(v).length : 2);
          }, 0);
          return Math.min(Math.max(labelLen, maxDataLen, 4), 40);
        });

        const header = table.columns
          .map((col, i) => col.label.padEnd(colWidths[i]))
          .join(" | ");
        lines.push("  " + header);
        lines.push("  " + colWidths.map((w) => "─".repeat(w)).join("-+-"));

        for (const row of table.rows) {
          const dataRow = table.columns
            .map((col, i) => {
              const v = row[col.id];
              const s = v !== null && v !== undefined ? String(v) : "—";
              return s.length > colWidths[i] ? s.slice(0, colWidths[i] - 1) + "..." : s.padEnd(colWidths[i]);
            })
            .join(" | ");
          lines.push("  " + dataRow);
        }
        lines.push("");
        lines.push(`  (${table.rows.length} rows x ${table.columns.length} columns)`);
        lines.push("");
      }

      // Insights
      if (result.insights.length > 0) {
        lines.push(separator);
        lines.push(`  INSIGHTS (${result.insights.length})`);
        lines.push(separator);
        lines.push("");

        for (const insight of result.insights) {
          const severityTag = `[${insight.severity.toUpperCase()}]`;
          lines.push(`  ${severityTag} ${insight.title}`);
          lines.push(`  ${" ".repeat(severityTag.length + 1)}${insight.body}`);
          lines.push(`  Category: ${insight.category}`);
          if (insight.aiGenerated) {
            lines.push(`  Source: AI-generated`);
          }
          lines.push("");
        }
      }

      // Annotations
      const docAnns = annotations[result.documentId] ?? [];
      if (docAnns.length > 0) {
        lines.push(separator);
        lines.push(`  DOCUMENT NOTES (${docAnns.length})`);
        lines.push(separator);
        lines.push("");
        for (const a of docAnns) {
          lines.push(`  - ${a.text} (${new Date(a.createdAt).toLocaleString()})`);
        }
        lines.push("");
      }

      // Footer
      lines.push(separator);
      lines.push(`  Generated by Doclyze on ${new Date().toLocaleString()}`);
      lines.push(separator);

      const text = lines.join("\n");
      const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.filename.replace(/\.[^.]+$/, "")}_report.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported full report as text");
    } catch {
      toast.error("Failed to export text report");
    }
  };

  /**
   * v4: Export as a polished, human-readable HTML report.
   * Opens in a new tab with print-ready styling.
   */
  const exportPrintReport = () => {
    try {
      const docAnns = annotations[result.documentId] ?? [];
      const severityColors: Record<string, string> = {
        info: "#3b82f6",
        notice: "#f59e0b",
        warning: "#ef4444",
      };

      const fieldGroupsHtml = result.fieldGroups
        .map(
          (group) => `
        <div class="field-group">
          <h3>${escapeHtml(group.title)}</h3>
          <table class="field-table">
            <thead><tr><th>Field</th><th>Value</th><th>Confidence</th></tr></thead>
            <tbody>
              ${group.fields
                .map((field) => {
                  const ck = `${result.documentId}::${field.key}`;
                  const correction = fieldCorrections[ck];
                  const val = correction ? correction.value : (field.value ?? "<em>Not found</em>");
                  const editedBadge = correction
                    ? ' <span class="edited-badge">Edited</span>'
                    : "";
                  return `<tr>
                    <td class="field-label">${escapeHtml(field.label)}${editedBadge}</td>
                    <td class="field-value">${correction ? escapeHtml(val) : (field.value ? escapeHtml(val as string) : val)}</td>
                    <td class="field-confidence"><span class="conf-dot ${field.confidence}"></span> ${field.confidence}</td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>`
        )
        .join("");

      const tablesHtml = result.tables
        .map(
          (table) => `
        <div class="table-section">
          <h3>${escapeHtml(table.title)}</h3>
          ${table.description ? `<p class="table-desc">${escapeHtml(table.description)}</p>` : ""}
          <div class="table-scroll">
          <table>
            <thead><tr>${table.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
            <tbody>
              ${table.rows
                .map(
                  (row) =>
                    `<tr>${table.columns.map((c) => {
                      const v = row[c.id];
                      return `<td>${v !== null && v !== undefined ? escapeHtml(String(v)) : "<em>--</em>"}</td>`;
                    }).join("")}</tr>`
                )
                .join("")}
            </tbody>
          </table>
          </div>
          <p class="table-footer">${table.rows.length} rows x ${table.columns.length} columns</p>
        </div>`
        )
        .join("");

      const insightsHtml =
        result.insights.length > 0
          ? `
        <div class="insights-section">
          <h2>Insights (${result.insights.length})</h2>
          <div class="insights-list">
            ${result.insights
              .map(
                (ins) => `
              <div class="insight-card" style="border-left-color: ${severityColors[ins.severity] ?? "#999"}">
                <div class="insight-header">
                  <span class="insight-severity [${ins.severity}]">[${ins.severity.toUpperCase()}]</span>
                  <strong>${escapeHtml(ins.title)}</strong>
                  ${ins.aiGenerated ? '<span class="ai-badge">AI</span>' : ""}
                </div>
                <p>${escapeHtml(ins.body)}</p>
                <span class="insight-category">${escapeHtml(ins.category)}</span>
              </div>`
              )
              .join("")}
          </div>
        </div>`
          : "";

      const annotationsHtml =
        docAnns.length > 0
          ? `
        <div class="annotations-section">
          <h2>Document Notes</h2>
          <ul class="annotations-list">
            ${docAnns.map((a) => `<li>${escapeHtml(a.text)} <span class="ann-date">${new Date(a.createdAt).toLocaleString()}</span></li>`).join("")}
          </ul>
        </div>`
          : "";

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Doclyze Report - ${escapeHtml(result.filename)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e5e5e5; }
    h3 { font-size: 14px; margin: 16px 0 8px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
    .meta { font-size: 13px; color: #888; margin-bottom: 24px; }
    .meta span { margin-right: 16px; }
    .score { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .score.high { background: #dcfce7; color: #166534; }
    .score.medium { background: #fef3c7; color: #92400e; }
    .score.low { background: #fee2e2; color: #991b1b; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0 16px; }
    th { text-align: left; padding: 8px 12px; background: #f5f5f5; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #666; border-bottom: 2px solid #e5e5e5; }
    td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    tr:hover td { background: #fafafa; }
    .field-table td.field-label { font-weight: 500; width: 200px; }
    .field-table td.field-confidence { width: 100px; font-size: 12px; color: #888; }
    .conf-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
    .conf-dot.high { background: #22c55e; }
    .conf-dot.medium { background: #f59e0b; }
    .conf-dot.low { background: #ef4444; }
    .edited-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #fef3c7; color: #92400e; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; vertical-align: middle; margin-left: 6px; }
    .insight-card { padding: 12px 16px; border-left: 3px solid #ccc; background: #fafafa; margin-bottom: 8px; border-radius: 0 6px 6px 0; }
    .insight-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .insight-severity { font-size: 10px; font-family: monospace; color: #888; }
    .ai-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #f0e6ff; color: #7c3aed; font-size: 9px; text-transform: uppercase; font-weight: 600; }
    .insight-card p { font-size: 13px; color: #444; }
    .insight-category { font-size: 11px; color: #aaa; }
    .table-desc { font-size: 12px; color: #888; margin-bottom: 8px; }
    .table-footer { font-size: 11px; color: #aaa; margin-top: 8px; }
    .annotations-section ul { padding-left: 20px; }
    .annotations-section li { font-size: 13px; margin-bottom: 4px; }
    .ann-date { color: #aaa; font-size: 11px; margin-left: 8px; }
    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 11px; color: #bbb; }
    .table-scroll { overflow-x: auto; }
    @media print { body { padding: 20px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:right; margin-bottom:16px;">
    <button onclick="window.print()" style="padding:8px 20px;border:1px solid #ccc;border-radius:6px;background:white;cursor:pointer;font-size:13px;">Print / Save as PDF</button>
  </div>
  <h1>${escapeHtml(result.filename)}</h1>
  <div class="meta">
    <span>Type: ${escapeHtml(labelForType(result.detectedType))}</span>
    <span>Size: ${result.fileSizeBytes.toLocaleString()} bytes</span>
    <span>Analyzed: ${new Date(result.extractedAt).toLocaleString()}</span>
    ${result.ocrUsed ? '<span>OCR: Yes</span>' : ""}
    <span class="score ${result.completenessScore >= 75 ? "high" : result.completenessScore >= 50 ? "medium" : "low"}">${result.completenessScore}/100 completeness</span>
  </div>

  ${fieldGroupsHtml}
  ${tablesHtml}
  ${insightsHtml}
  ${annotationsHtml}

  <div class="footer">
    Generated by Doclyze on ${new Date().toLocaleString()} · Document Intelligence Platform
  </div>
</body>
</html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success("Report opened in new tab — use Print to save as PDF");
    } catch {
      toast.error("Failed to generate report");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download Report
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportPrintReport}>
          <FileOutput className="h-4 w-4 mr-2" />
          Print Report (PDF)
          <span className="ml-auto text-[10px] text-muted-foreground">Human-readable</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportJSON}>
          <FileJson className="h-4 w-4 mr-2" />
          Export as JSON
          <span className="ml-auto text-[10px] text-muted-foreground">Full structured data</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportText}>
          <FileText className="h-4 w-4 mr-2" />
          Export as Text
          <span className="ml-auto text-[10px] text-muted-foreground">Formatted text</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
