/**
 * Extraction orchestrator — runs the full pipeline:
 *   parse → classify → detect language → route to type-specific extractor → PII scan → calibrate confidence → assemble result.
 */

import { classifyDocument } from "./classifier";
import { parseFile, ParseOutput } from "./parsers";
import { extractResume } from "./extractors/resume";
import { extractInvoice } from "./extractors/invoice";
import { extractContract } from "./extractors/contract";
import { extractResearchPaper } from "./extractors/research-paper";
import { extractGeneral } from "./extractors/general";
import { extractSpreadsheet } from "./extractors/spreadsheet";
import { extractAcademicTranscript } from "./extractors/academic-transcript";
import { extractPurchaseOrder } from "./extractors/purchase-order";
import { extractFinancialStatement } from "./extractors/financial-statement";
import { extractMedicalReport } from "./extractors/medical-report";
import { detectPII, summarizePII } from "./pii-detector";
import { detectLanguage } from "./lang-detect";
import {
  DoclyzeExtractionResult,
  FieldGroup,
  ExtractedField,
  ExtractedTable,
  Insight,
  TypeDetails,
  Severity,
} from "./types";

export type ProgressStage =
  | "reading_file"
  | "extracting_text"
  | "running_ocr"
  | "classifying_document"
  | "extracting_structured_data"
  | "scoring_and_generating_insights"
  | "complete"
  | "error";

export interface ProgressUpdate {
  stage: ProgressStage;
  /** 0-1 progress within the pipeline */
  progress: number;
  /** Human-readable label */
  label: string;
}

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

/**
 * Per-type field importance weights for confidence calibration.
 * Fields listed here matter more; if they have low confidence, the
 * completeness penalty is higher.
 */
const TYPE_IMPORTANT_FIELDS: Record<string, string[]> = {
  resume: ["contact.name", "contact.email", "contact.phone"],
  invoice: ["vendor.name", "billTo.name", "total"],
  contract: ["parties", "effectiveDate", "sections"],
  research_paper: ["title", "authors", "abstract"],
  academic_transcript: ["studentName", "institution", "overallGPA"],
  purchase_order: ["poNumber", "vendor", "total"],
  financial_statement: ["companyName", "statementType", "revenue"],
  medical_report: ["patientName", "dateOfReport", "testResults"],
};

export async function runExtractionPipeline(
  file: File,
  onProgress?: (update: ProgressUpdate) => void
): Promise<DoclyzeExtractionResult> {
  const emit = (stage: ProgressStage, progress: number) =>
    onProgress?.({ stage, progress, label: STAGE_LABELS[stage] });

  emit("reading_file", 0.05);
  const mimeType = file.type || "application/octet-stream";
  let parsed: ParseOutput;
  try {
    parsed = await parseFile(file, mimeType, (stage, pct) => emit(stage as ProgressStage, pct));
  } catch (err) {
    emit("error", 0);
    throw err;
  }

  emit("classifying_document", 0.75);
  const classification = classifyDocument({
    text: parsed.text,
    filename: file.name,
    tabular: !!parsed.tabular,
  });

  // ─── Language detection ────────────────────────────────────────────────────
  const langResult = detectLanguage(parsed.text);

  emit("extracting_structured_data", 0.82);
  let fieldGroups: FieldGroup[];
  let tables: ExtractedTable[];
  let insights: Insight[];
  let completeness: number;
  let typed: TypeDetails;

  switch (classification.type) {
    case "resume": {
      const r = extractResume(parsed.text, file.name);
      fieldGroups = r.fieldGroups;
      tables = r.tables;
      insights = r.insights;
      completeness = r.completeness;
      typed = { type: "resume", details: r.details };
      break;
    }
    case "invoice": {
      const r = extractInvoice(parsed.text, file.name);
      fieldGroups = r.fieldGroups;
      tables = r.tables;
      insights = r.insights;
      completeness = r.completeness;
      typed = { type: "invoice", details: r.details };
      break;
    }
    case "contract": {
      const r = extractContract(parsed.text, file.name);
      fieldGroups = r.fieldGroups;
      tables = r.tables;
      insights = r.insights;
      completeness = r.completeness;
      typed = { type: "contract", details: r.details };
      break;
    }
    case "research_paper": {
      const r = extractResearchPaper(parsed.text, file.name);
      fieldGroups = r.fieldGroups;
      tables = r.tables;
      insights = r.insights;
      completeness = r.completeness;
      typed = { type: "research_paper", details: r.details };
      break;
    }
    case "academic_transcript": {
      const r = extractAcademicTranscript(parsed.text, file.name);
      fieldGroups = r.fieldGroups;
      tables = r.tables;
      insights = r.insights;
      completeness = r.completeness;
      typed = { type: "academic_transcript", details: r.details };
      break;
    }
    case "purchase_order": {
      const r = extractPurchaseOrder(parsed.text, file.name);
      fieldGroups = r.fieldGroups;
      tables = r.tables;
      insights = r.insights;
      completeness = r.completeness;
      typed = { type: "purchase_order", details: r.details };
      break;
    }
    case "financial_statement": {
      const r = extractFinancialStatement(parsed.text, file.name);
      fieldGroups = r.fieldGroups;
      tables = r.tables;
      insights = r.insights;
      completeness = r.completeness;
      typed = { type: "financial_statement", details: r.details };
      break;
    }
    case "medical_report": {
      const r = extractMedicalReport(parsed.text, file.name);
      fieldGroups = r.fieldGroups;
      tables = r.tables;
      insights = r.insights;
      completeness = r.completeness;
      typed = { type: "medical_report", details: r.details };
      break;
    }
    case "spreadsheet": {
      const headers = parsed.tabular?.headers ?? [];
      const rows = parsed.tabular?.rows ?? [];
      const r = extractSpreadsheet(headers, rows);
      fieldGroups = r.fieldGroups;
      tables = r.tables;
      insights = r.insights;
      completeness = r.completeness;
      typed = { type: "spreadsheet", details: r.details };
      break;
    }
    case "general":
    default: {
      const r = extractGeneral(parsed.text, file.name);
      fieldGroups = r.fieldGroups;
      tables = r.tables;
      insights = r.insights;
      completeness = r.completeness;
      typed = { type: "general", details: r.details };
      break;
    }
  }

  emit("scoring_and_generating_insights", 0.94);

  // ─── Confidence calibration ─────────────────────────────────────────────
  // 1. OCR penalty: reduce confidence by 10 points
  if (parsed.ocrUsed) {
    completeness = Math.max(0, completeness - 10);
  }

  // 2. Low-confidence fields: count as half-missing for completeness
  const importantFields = TYPE_IMPORTANT_FIELDS[classification.type] ?? [];
  if (importantFields.length > 0) {
    let lowConfCount = 0;
    let importantCount = 0;
    for (const fg of fieldGroups) {
      for (const field of fg.fields) {
        importantCount++;
        if (field.confidence === "low" && field.value !== null) {
          // Count as half-missing: reduce completeness proportionally
          lowConfCount++;
        }
      }
    }
    // Penalty: each low-confidence field reduces by (100 / total_fields) * 0.5
    if (importantCount > 0 && lowConfCount > 0) {
      const penalty = Math.round((lowConfCount / importantCount) * 15);
      completeness = Math.max(0, completeness - penalty);
    }
  }

  // 3. Non-English penalty: reduce by 15 points
  if (langResult.code !== "en" && (langResult.confidence === "high" || langResult.confidence === "medium")) {
    completeness = Math.max(0, completeness - 15);
    insights.push({
      id: "non-english-content",
      title: `Non-English content detected: ${langResult.name}`,
      body: `Non-English content detected: ${langResult.name}. Extraction accuracy may be reduced for non-English documents.`,
      severity: "notice",
      category: "Language",
    });
  }

  // ─── PII detection ───────────────────────────────────────────────────────
  const piiFindings = (() => {
    try {
      return detectPII(parsed.text);
    } catch {
      return [];
    }
  })();

  if (piiFindings.length > 0) {
    const highSeverity = piiFindings.filter((f) => f.severity === "high").length;
    const mediumSeverity = piiFindings.filter((f) => f.severity === "medium").length;
    const piiSeverity: Severity = highSeverity > 0 ? "warning" : "notice";
    insights.push({
      id: "pii-detected",
      title: `PII / Sensitive Data: ${summarizePII(piiFindings)}`,
      body: `Doclyze detected ${piiFindings.length} instance(s) of potentially sensitive information (${highSeverity} high severity, ${mediumSeverity} medium severity). Review before sharing or storing.`,
      severity: piiSeverity,
      category: "PII / Sensitive Data",
    });
  }

  // ─── Insert classification as the first insight ──────────────────────────
  const classificationInsight: Insight = {
    id: "classification",
    title: `Classified as: ${labelForType(classification.type)} (confidence: ${classification.confidence})`,
    body: classification.signals.join(" · "),
    severity: "info",
    category: "Classification",
  };

  // OCR notice
  if (parsed.ocrUsed) {
    insights.push({
      id: "ocr-used",
      title: "OCR fallback was used to extract text",
      body: "The document had no native text layer (scanned PDF or image). Text was extracted via Tesseract OCR — confidence in positional details may be lower than for digital-native files.",
      severity: "notice",
      category: "Extraction method",
    });
  }

  const result: DoclyzeExtractionResult = {
    schemaVersion: 1,
    documentId: crypto.randomUUID(),
    filename: file.name,
    fileType: mimeType,
    fileSizeBytes: file.size,
    detectedType: classification.type,
    extractedAt: new Date().toISOString(),
    ocrUsed: parsed.ocrUsed,
    fieldGroups,
    tables,
    insights: [classificationInsight, ...insights],
    completenessScore: completeness,
    typed,
    rawText: parsed.text,
    pages: parsed.pages,
  };

  emit("complete", 1);
  return result;
}

export function labelForType(type: string): string {
  const labels: Record<string, string> = {
    resume: "Resume / CV",
    invoice: "Invoice / Receipt",
    contract: "Contract / Agreement",
    research_paper: "Research Paper",
    spreadsheet: "Spreadsheet / Tabular",
    general: "General Document",
    academic_transcript: "Academic Transcript",
    purchase_order: "Purchase Order",
    financial_statement: "Financial Statement",
    medical_report: "Medical / Lab Report",
  };
  return labels[type] ?? type;
}
