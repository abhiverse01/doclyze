/**
 * Spreadsheet extractor — for CSV/TSV files routed directly to tabular view.
 * Infers column types from sample values.
 */

import {
  CellType,
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  Insight,
  SpreadsheetDetails,
} from "../types";
import { countWords, fleschKincaid, readingTimeMinutes, splitSentences } from "../normalize";

function inferColumnType(values: (string | number | null)[]): CellType {
  const nonNull = values.filter((v) => v !== null && v !== "") as string[];
  if (nonNull.length === 0) return "text";
  // Currency — requires either a currency symbol prefix OR a 2-decimal-place suffix.
  // Pure integers should NOT be classified as currency.
  const currencyRe = /^[$€£¥₹]\s?-?\d[\d,]*(?:\.\d{2})?$|^-?\d[\d,]*\.\d{2}$/;
  if (nonNull.every((v) => currencyRe.test(String(v)))) {
    return "currency";
  }
  // Number — integers or decimals without currency markers
  if (nonNull.every((v) => /^-?\d+(?:\.\d+)?$/.test(String(v)))) {
    return "number";
  }
  // Date
  if (
    nonNull.every((v) =>
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(String(v)) ||
      /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(String(v)) ||
      /^[A-Z][a-z]+ \d{1,2},? \d{4}$/.test(String(v))
    )
  ) {
    return "date";
  }
  // Email
  if (nonNull.every((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)))) {
    return "email";
  }
  // URL
  if (nonNull.every((v) => /^https?:\/\//.test(String(v)))) {
    return "url";
  }
  return "text";
}

export function extractSpreadsheet(
  headers: string[],
  rows: Record<string, string | number | null>[]
): {
  details: SpreadsheetDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  const inferredTypes: Record<string, CellType> = {};
  for (const h of headers) {
    inferredTypes[h] = inferColumnType(rows.map((r) => r[h]));
  }

  const preview = rows.slice(0, 100);

  const details: SpreadsheetDetails = {
    headers,
    rowCount: rows.length,
    columnCount: headers.length,
    inferredTypes,
    preview,
  };

  const statsGroup: FieldGroup = {
    id: "stats",
    title: "Dataset Overview",
    fields: [
      f("rowCount", "Row count", `${rows.length.toLocaleString()}`, "high"),
      f("columnCount", "Column count", `${headers.length}`, "high"),
      f(
        "columns",
        "Columns",
        headers.map((h) => `${h} [${inferredTypes[h]}]`).join("\n"),
        "high"
      ),
      f(
        "completeness",
        "Cell completeness",
        `${computeCellCompleteness(rows, headers)}%`,
        "high",
        "Percentage of non-null cells"
      ),
    ],
  };

  const sheetTable: ExtractedTable = {
    id: "sheet",
    title: "Spreadsheet",
    description: `${rows.length} row(s) × ${headers.length} column(s)`,
    columns: headers.map((h) => ({
      id: h,
      label: h,
      type: inferredTypes[h],
      sortable: true,
    })),
    rows: rows.slice(0, 500), // Cap at 500 rows for the Presentor — full export still works
  };

  // Insights
  const insights: Insight[] = [];

  const nullRate = 1 - computeCellCompletenessRaw(rows, headers);
  if (nullRate > 0.2) {
    insights.push({
      id: "high-null-rate",
      title: `${(nullRate * 100).toFixed(1)}% of cells are empty`,
      body: "More than 20% of cells are null. Consider filtering or imputing missing values before analysis.",
      severity: "notice",
      category: "Data quality",
    });
  }

  // Duplicate rows
  const seen = new Set<string>();
  let dupes = 0;
  for (const r of rows) {
    const k = JSON.stringify(r);
    if (seen.has(k)) dupes++;
    else seen.add(k);
  }
  if (dupes > 0) {
    insights.push({
      id: "duplicate-rows",
      title: `${dupes} duplicate row(s) detected`,
      body: "Exact duplicate rows can skew aggregates. Consider deduplication.",
      severity: dupes > rows.length * 0.05 ? "warning" : "notice",
      category: "Data quality",
    });
  }

  // Per-column nulls
  for (const h of headers) {
    const colNulls = rows.filter((r) => r[h] === null || r[h] === "").length;
    if (colNulls === rows.length) {
      insights.push({
        id: `empty-col-${h}`,
        title: `Column "${h}" is entirely empty`,
        body: "All values in this column are null. Consider removing it.",
        severity: "warning",
        category: "Data quality",
      });
    } else if (colNulls > rows.length * 0.5) {
      insights.push({
        id: `sparse-col-${h}`,
        title: `Column "${h}" is sparse (${((colNulls / rows.length) * 100).toFixed(0)}% null)`,
        body: "More than half of this column's values are missing.",
        severity: "notice",
        category: "Data quality",
      });
    }
  }

  if (rows.length > 0 && headers.length > 0) {
    insights.push({
      id: "summary",
      title: `Dataset: ${rows.length} rows × ${headers.length} columns`,
      body: `Inferred column types: ${headers.map((h) => `${h}=${inferredTypes[h]}`).join(", ")}.`,
      severity: "info",
      category: "Summary",
    });
  }

  const expected = [
    rows.length > 0 ? "rows" : null,
    headers.length > 0 ? "columns" : null,
    headers.length > 0 ? "types" : null,
  ];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  return {
    details,
    fieldGroups: [statsGroup],
    tables: [sheetTable],
    insights,
    completeness,
  };
}

function computeCellCompleteness(
  rows: Record<string, string | number | null>[],
  headers: string[]
): number {
  if (rows.length === 0 || headers.length === 0) return 0;
  return Math.round(computeCellCompletenessRaw(rows, headers) * 100);
}

function computeCellCompletenessRaw(
  rows: Record<string, string | number | null>[],
  headers: string[]
): number {
  if (rows.length === 0 || headers.length === 0) return 0;
  let total = 0;
  let nonNull = 0;
  for (const r of rows) {
    for (const h of headers) {
      total++;
      if (r[h] !== null && r[h] !== "") nonNull++;
    }
  }
  return nonNull / total;
}

function f(
  key: string,
  label: string,
  value: string | null,
  confidence: "high" | "medium" | "low",
  provenance?: string
): ExtractedField {
  return { key, label, value, confidence, provenance };
}

// Re-export general extractor parts so the orchestrator can also produce
// general-document statistics for non-spreadsheet text.
export { countWords, fleschKincaid, readingTimeMinutes, splitSentences };
