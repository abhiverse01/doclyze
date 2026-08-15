/**
 * Deterministic document-type classifier (v5)
 * ===========================================
 * Keyword + structural heuristics with normalized scoring.
 * No ML, no API calls, fully re-runnable.
 *
 * v5 changes:
 * - Scores are normalized by keyword-list size (prevents large lists from dominating)
 * - Structural signals weighted alongside keywords
 * - Real numeric confidence score (0-100) replaces coarse high/medium/low
 * - Low-confidence documents (score < threshold) route to "general" extractor
 * - Keyword overlap reduced by removing ultra-generic terms from resume
 * - Cross-type disambiguation for ambiguous documents
 */

import { DocType } from "./types";

interface ClassifyInput {
  text: string;
  filename: string;
  /** True if the file came in as CSV/TSV with a tabular parse. */
  tabular?: boolean;
}

export interface ClassifyResult {
  type: DocType;
  /** Numeric confidence 0-100. Below CONFIDENCE_THRESHOLD routes to general. */
  confidence: number;
  signals: string[];
}

// ─── Configuration ────────────────────────────────────────────────────────────

/** Below this confidence, route to general extractor instead of guessing. */
const CONFIDENCE_THRESHOLD = 25;

/** ─── Keyword lists (v5: trimmed of generic overlap terms) ──────────────────── */

const RESUME_KW = [
  // Contact / personal info patterns (resume-specific)
  "work history",
  "professional experience",
  "professional summary",
  "career objective",
  "work experience",
  "linkedin",
  "github",
  "portfolio",
  "certifications",
  "references",
  "achievements",
  // Strongly resume-specific phrases (not just individual words)
  "years of experience",
  "responsible for",
  "developed and maintained",
];

const INVOICE_KW = [
  "invoice",
  "bill to",
  "ship to",
  "subtotal",
  "total due",
  "amount due",
  "balance due",
  "payment terms",
  "po number",
  "purchase order",
  "remit",
  "unit price",
  "line item",
  "net 30",
  "net 60",
  "invoice no",
  "invoice date",
  "due date",
  "qty",
  "total",
];

const CONTRACT_KW = [
  "whereas",
  "the parties",
  "party a",
  "party b",
  "effective date",
  "termination",
  "indemnify",
  "indemnification",
  "herein",
  "hereby",
  "thereof",
  "force majeure",
  "governing law",
  "severability",
  "non-compete",
  "confidential information",
  "limited liability",
  "binding arbitration",
  "entire agreement",
];

const PAPER_KW = [
  "abstract",
  "methodology",
  "et al",
  "doi",
  "arxiv",
  "fig.",
  "figure 1",
  "table 1",
  "citations",
  "acknowledgements",
  "peer review",
  "related work",
  "proposed method",
  "experimental results",
  "contribution",
  "we propose",
  "we present",
];

const TRANSCRIPT_KW = [
  "transcript",
  "dean's list",
  "academic record",
  "grade report",
  "cumulative",
  "credit hours",
  "academic standing",
  "grade point average",
  "registrar",
  "academic year",
  "fall semester",
  "spring semester",
  "course grade",
  "earned credits",
];

const PURCHASE_ORDER_KW = [
  "purchase order",
  "po number",
  "requisition",
  "authorized by",
  "delivery date",
  "requisitioner",
  "purchaser",
  "ordered by",
  "ship date",
  "freight",
  "po #",
  "qty",
  "unit price",
];

const FINANCIAL_STATEMENT_KW = [
  "balance sheet",
  "income statement",
  "cash flow",
  "total assets",
  "net income",
  "shareholders' equity",
  "fiscal year",
  "10-k",
  "financial statement",
  "consolidated",
  "total liabilities",
  "revenue",
  "earnings",
  "depreciation",
  "operating income",
  "gross profit",
  "net profit",
  "fiscal",
  "audited",
  "footnotes",
];

const MEDICAL_REPORT_KW = [
  "lab report",
  "laboratory",
  "specimen",
  "reference range",
  "patient",
  "diagnosis",
  "clinical",
  "blood work",
  "pathology",
  "hematology",
  "chemistry",
  "urinalysis",
  "culture",
  "biopsy",
  "radiology",
  "imaging",
  "test results",
  "abnormal",
  "critical",
  "physician",
  "specimen type",
  "collection date",
  "ordering physician",
];
const CORRESPONDENCE_KW = [
  "dear sir",
  "dear madam",
  "yours sincerely",
  "yours faithfully",
  "yours truly",
  "best regards",
  "warm regards",
  "kind regards",
  "subject:",
  "ref:",
  "reference:",
  "we are writing",
  "i am writing",
  "we wish to",
  "i wish to",
  "please find",
  "thank you for",
  "looking forward",
  "sincerely",
  "regards,",
];

// ─── Scoring ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalized keyword score.
 * Returns (matchedKeywords / totalKeywords) * 100, with a per-keyword cap.
 * This normalizes for different keyword-list sizes.
 */
function keywordScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let matched = 0;
  for (const kw of keywords) {
    const re = new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`, "g");
    const matches = lower.match(re);
    if (matches && matches.length > 0) {
      matched++;
    }
  }
  // Normalize: what fraction of this type's keywords were found?
  return (matched / keywords.length) * 100;
}

// ─── Structural signal detection ─────────────────────────────────────────────

interface StructuralSignals {
  /** Contact block near top (name + email/phone within first ~500 chars) */
  hasContactBlock: boolean;
  /** Section headers in ALL-CAPS or Title Case near line starts */
  sectionHeaders: string[];
  /** Tabular line-item pattern (description + quantity + price on same/near lines) */
  hasLineItemTable: boolean;
  /** Numbered clauses (1., 2., 3. or Section 1, Article I) */
  hasNumberedClauses: boolean;
  /** "WHEREAS" or "IN WITNESS WHEREOF" pattern */
  hasWhereas: boolean;
  /** Abstract block ("Abstract" header + paragraph) */
  hasAbstract: boolean;
  /** References/bibliography section */
  hasReferences: boolean;
  /** Grade/course table pattern (course code + credits + grade) */
  hasGradeTable: boolean;
  /** Medical reference ranges (e.g. "4.0-10.0 mg/dL") */
  hasReferenceRanges: boolean;
  /** Financial table patterns (assets = liabilities + equity) */
  hasFinancialTable: boolean;
  /** v8: Salutation pattern (Dear Sir/Madam, To:) */
  hasSalutation: boolean;
}

function detectStructuralSignals(text: string): StructuralSignals {
  const lines = text.split("\n");
  const first500 = text.slice(0, 500).toLowerCase();

  // Contact block: name-like line followed by email/phone within 500 chars
  const hasContactBlock =
    /[a-z]+ [a-z]+/.test(first500) &&
    (/[\w.+-]+@[\w-]+\.[\w.]+/.test(first500) ||
      /\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/.test(first500) ||
      /\+?\d[\d\s-]{7,}/.test(first500));

  // Section headers: ALL-CAPS or Title Case words at line starts
  const sectionHeaders: string[] = [];
  const headerRe = /^(?:#{1,4}\s+)?([A-Z][A-Z\s&/'-]{2,30})$/;
  const titleCaseRe = /^(?:#{1,4}\s+)?([A-Z][a-z]+(?: [A-Z][a-z]+){1,5})$/;
  for (const line of lines.slice(0, 80)) {
    const trimmed = line.trim();
    if (headerRe.test(trimmed)) sectionHeaders.push(trimmed.replace(/^#+\s*/, ""));
    else if (titleCaseRe.test(trimmed) && trimmed.length < 40) sectionHeaders.push(trimmed.replace(/^#+\s*/, ""));
  }

  // Line-item table: lines with quantity + price pattern
  const hasLineItemTable = /\d+\s*(?:x|@|×)\s*\$?[\d,.]+|\$[\d,.]+\s*(?:each|per|\/)/i.test(text) ||
    /(?:qty|quantity)\s*[\:.]\s*\d/i.test(text);

  // Numbered clauses
  const hasNumberedClauses =
    /^\s*(?:section|article|clause)\s+\d+/im.test(text) ||
    /^\s*\d+\.\s+[A-Z]/m.test(text);

  // WHEREAS
  const hasWhereas = /\bWHEREAS\b/i.test(text);

  // Abstract block
  let hasAbstract = false;
  const abstractRe = /(?:^|\n)\s*(?:abstract|summary)\s*[:\n]/i;
  if (abstractRe.test(text)) {
    // Check it's followed by a substantive paragraph (not just a one-liner)
    const match = text.match(/(?:^|\n)\s*(?:abstract|summary)\s*[:\n]?\s*([\s\S]{50,500}?)(?:\n\s*(?:introduction|keywords|1\.|1[\.\s]introduction))/i);
    if (match) hasAbstract = true;
  }

  // References/bibliography
  const hasReferences =
    /(?:^|\n)\s*(?:references|bibliography|works cited)\s*[:\n]/i.test(text) ||
    /\[\d+\]/.test(text); // citation markers like [1]

  // Grade table: course code pattern (e.g. CS 101, MATH 200) + grade letters
  const hasGradeTable =
    /(?:[A-Z]{2,4}\s+\d{3}|[A-Z]{2,4}\s+\d{2}[A-Z]?)\s+.*?\s+(?:A|B\+?|C\+?|D|F|P|NP|W)\b/i.test(text) ||
    /(?:GPA|grade point)/i.test(text) && /(?:semester|term|quarter)/i.test(text);

  // Medical reference ranges: patterns like "4.0-10.0 mg/dL" or "< 200"
  const hasReferenceRanges =
    /\d+\.?\d*\s*[-–—]\s*\d+\.?\d*\s*(?:mg|g|ml|l|mmol|iu|u\/l|%)/i.test(text) ||
    /(?:normal|abnormal|critical|high|low)\s*(?:range|value|result)/i.test(text);

  // Financial table patterns
  const hasFinancialTable =
    (/(?:total assets|total liabilities|shareholders?.*equity)/i.test(text)) ||
    (/(?:revenue|net income|gross profit).*?\$[\d,]+/im.test(text) &&
     /(?:operating expenses|cost of goods|ebitda)/i.test(text));

  // v8: Salutation pattern for correspondence detection
  const hasSalutation =
    /(?:^|\n)\s*(?:Dear|To|Respected)\s+(?:Mr|Mrs|Ms|Dr|Prof|Sir|Madam)/im.test(text);

  return {
    hasContactBlock,
    sectionHeaders,
    hasLineItemTable,
    hasNumberedClauses,
    hasWhereas,
    hasAbstract,
    hasReferences,
    hasGradeTable,
    hasReferenceRanges,
    hasFinancialTable,
    hasSalutation,
  };
}

/**
 * Structural bonus for a document type.
 * Returns 0-30 bonus points based on structural match.
 */
function structuralBonus(type: string, signals: StructuralSignals): number {
  let bonus = 0;

  switch (type) {
    case "resume": {
      if (signals.hasContactBlock) bonus += 15;
      const resumeHeaders = signals.sectionHeaders.filter((h) =>
        /(?:experience|education|skills|summary|objective|certifications|projects|publications)/i.test(h)
      );
      bonus += Math.min(resumeHeaders.length * 5, 15);
      break;
    }
    case "invoice": {
      if (signals.hasLineItemTable) bonus += 20;
      const invHeaders = signals.sectionHeaders.filter((h) =>
        /(?:bill to|ship to|invoice|subtotal|total|payment)/i.test(h)
      );
      bonus += Math.min(invHeaders.length * 5, 10);
      break;
    }
    case "contract": {
      if (signals.hasWhereas) bonus += 15;
      if (signals.hasNumberedClauses) bonus += 10;
      const contractHeaders = signals.sectionHeaders.filter((h) =>
        /(?:agreement|terms|conditions|liability|termination|confidential)/i.test(h)
      );
      bonus += Math.min(contractHeaders.length * 3, 10);
      break;
    }
    case "research_paper": {
      if (signals.hasAbstract) bonus += 15;
      if (signals.hasReferences) bonus += 10;
      const paperHeaders = signals.sectionHeaders.filter((h) =>
        /(?:introduction|method|result|discussion|conclusion|related work)/i.test(h)
      );
      bonus += Math.min(paperHeaders.length * 3, 10);
      break;
    }
    case "academic_transcript": {
      if (signals.hasGradeTable) bonus += 20;
      const transHeaders = signals.sectionHeaders.filter((h) =>
        /(?:semester|term|course|grade|credit|gpa)/i.test(h)
      );
      bonus += Math.min(transHeaders.length * 5, 10);
      break;
    }
    case "purchase_order": {
      if (signals.hasLineItemTable) bonus += 10;
      const poHeaders = signals.sectionHeaders.filter((h) =>
        /(?:purchase order|requisition|vendor|delivery|authorized)/i.test(h)
      );
      bonus += Math.min(poHeaders.length * 5, 15);
      break;
    }
    case "financial_statement": {
      if (signals.hasFinancialTable) bonus += 20;
      const finHeaders = signals.sectionHeaders.filter((h) =>
        /(?:assets|liabilities|equity|revenue|income|expense|cash flow)/i.test(h)
      );
      bonus += Math.min(finHeaders.length * 5, 10);
      break;
    }
    case "medical_report": {
      if (signals.hasReferenceRanges) bonus += 20;
      const medHeaders = signals.sectionHeaders.filter((h) =>
        /(?:patient|specimen|result|test|diagnosis|clinical)/i.test(h)
      );
      bonus += Math.min(medHeaders.length * 5, 10);
      break;
    }
    case "correspondence": {
      if (signals.hasSalutation) bonus += 25;
      break;
    }
  }

  return Math.min(bonus, 30);
}

// ─── Cross-type disambiguation ────────────────────────────────────────────────

/**
 * Penalty for documents that match the TOP type's keyword profile
 * but have structural signals pointing to a DIFFERENT type.
 * Returns a penalty (0-30) to subtract from the top score.
 */
function crossTypePenalty(topType: string, signals: StructuralSignals): number {
  // If classified as resume but has strong invoice structure
  if (topType === "resume" && signals.hasLineItemTable && !signals.hasContactBlock) {
    return 15;
  }
  // If classified as resume but has numbered clauses (contract)
  if (topType === "resume" && signals.hasNumberedClauses && signals.hasWhereas) {
    return 20;
  }
  // If classified as resume but has abstract + references (paper)
  if (topType === "resume" && signals.hasAbstract && signals.hasReferences) {
    return 20;
  }
  // If classified as resume but has grade table (transcript)
  if (topType === "resume" && signals.hasGradeTable && !signals.hasContactBlock) {
    return 15;
  }
  // If classified as resume but has reference ranges (medical)
  if (topType === "resume" && signals.hasReferenceRanges) {
    return 15;
  }
  // If classified as invoice but has whereas + numbered clauses (contract)
  if (topType === "invoice" && signals.hasWhereas && signals.hasNumberedClauses) {
    return 25;
  }
  return 0;
}

// ─── Main classifier ──────────────────────────────────────────────────────────

/**
 * Document length normalization factor.
 * Very short docs can't be classified with high confidence.
 * Only penalize keyword scores; structural bonuses are length-independent.
 */
function lengthFactor(wordCount: number): number {
  if (wordCount < 15) return 0.3;
  if (wordCount < 30) return 0.6;
  if (wordCount < 80) return 0.85;
  return 1.0;
}

export function classifyDocument({ text, filename, tabular }: ClassifyInput): ClassifyResult {
  // Tabular files are spreadsheets — short-circuit
  if (tabular) {
    return {
      type: "spreadsheet",
      confidence: 90,
      signals: ["Tabular file structure detected (CSV/TSV)"],
    };
  }

  // Filename hint — high confidence, short-circuit
  const fn = filename.toLowerCase();
  if (/(invoice|receipt)/.test(fn)) {
    return {
      type: "invoice",
      confidence: 90,
      signals: [`Filename "${filename}" suggests an invoice/receipt`],
    };
  }
  if (/(contract|agreement|nda|msa|sow)/.test(fn)) {
    return {
      type: "contract",
      confidence: 90,
      signals: [`Filename "${filename}" suggests a contract/agreement`],
    };
  }
  if (/(resume|cv|curriculum)/.test(fn)) {
    return {
      type: "resume",
      confidence: 90,
      signals: [`Filename "${filename}" suggests a resume/CV`],
    };
  }
  if (/(paper|article|manuscript|thesis|dissertation)/.test(fn)) {
    return {
      type: "research_paper",
      confidence: 90,
      signals: [`Filename "${filename}" suggests a research paper`],
    };
  }
  if (/transcript/i.test(fn)) {
    return {
      type: "academic_transcript",
      confidence: 90,
      signals: [`Filename "${filename}" suggests an academic transcript`],
    };
  }
  if (/po\d|purchase.?order|requisition/i.test(fn)) {
    return {
      type: "purchase_order",
      confidence: 90,
      signals: [`Filename "${filename}" suggests a purchase order`],
    };
  }
  if (/financial|balance.?sheet|income.?statement|cash.?flow|10-?k/i.test(fn)) {
    return {
      type: "financial_statement",
      confidence: 90,
      signals: [`Filename "${filename}" suggests a financial statement`],
    };
  }
  if (/lab-?report|medical|pathology|blood.?work|clinical/i.test(fn)) {
    return {
      type: "medical_report",
      confidence: 90,
      signals: [`Filename "${filename}" suggests a medical/lab report`],
    };
  }
  if (/(?:cover.?letter|letter|correspondence|complaint|reference.?letter)/i.test(fn)) {
    return {
      type: "correspondence",
      confidence: 85,
      signals: [`Filename "${filename}" suggests a letter/correspondence`],
    };
  }

  // ─── Content scoring ─────────────────────────────────────────────────────
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const lf = lengthFactor(wordCount);

  const keywordLists: Record<string, string[]> = {
    resume: RESUME_KW,
    invoice: INVOICE_KW,
    contract: CONTRACT_KW,
    research_paper: PAPER_KW,
    academic_transcript: TRANSCRIPT_KW,
    purchase_order: PURCHASE_ORDER_KW,
    financial_statement: FINANCIAL_STATEMENT_KW,
    medical_report: MEDICAL_REPORT_KW,
    correspondence: CORRESPONDENCE_KW,
  };

  // Detect structural signals once
  const structSignals = detectStructuralSignals(text);

  // Compute combined scores: keyword (normalized, 0-100, length-adjusted) + structural bonus (0-30, length-independent)
  const scores: Record<string, number> = {};
  const details: Record<string, { kw: number; struct: number }> = {};

  for (const [type, keywords] of Object.entries(keywordLists)) {
    const kw = keywordScore(text, keywords) * lf; // normalize by list size, then length-adjust
    const struct = structuralBonus(type, structSignals); // NOT length-adjusted — structure is structure regardless of doc length
    const combined = kw + struct;
    scores[type] = combined;
    details[type] = { kw: Math.round(kw * 10) / 10, struct };
  }

  // Sort by combined score descending
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = entries[0];
  const runnerUpScore = entries.length > 1 ? entries[1][1] : 0;
  const detailTop = details[topType];

  // Apply cross-type disambiguation penalty
  const penalty = crossTypePenalty(topType, structSignals);
  const adjustedScore = topScore - penalty;

  // Convert to 0-100 confidence
  // Raw scores typically range 0-130 (100 keyword + 30 structural)
  // Normalize to 0-100 range
  let confidence = Math.round((adjustedScore / 130) * 100);
  confidence = Math.max(0, Math.min(100, confidence));

  // Very short documents get confidence capped
  if (wordCount < 50) confidence = Math.min(confidence, 30);

  // Build signals
  const signals: string[] = [];
  signals.push(`Top: ${topType} (keyword: ${detailTop.kw}, structural: ${detailTop.struct})`);
  signals.push(`Runner-up: ${entries[1]?.[0]} (${Math.round(entries[1]?.[1] ?? 0 * 10) / 10})`);
  if (penalty > 0) {
    signals.push(`Cross-type penalty: -${penalty} (structural signals conflict with ${topType})`);
  }
  if (structSignals.hasContactBlock) signals.push("Detected: contact block");
  if (structSignals.hasLineItemTable) signals.push("Detected: line-item table");
  if (structSignals.hasNumberedClauses) signals.push("Detected: numbered clauses");
  if (structSignals.hasAbstract) signals.push("Detected: abstract block");
  if (structSignals.hasReferences) signals.push("Detected: references section");
  if (structSignals.hasGradeTable) signals.push("Detected: grade table");
  if (structSignals.hasReferenceRanges) signals.push("Detected: medical reference ranges");
  if (structSignals.hasFinancialTable) signals.push("Detected: financial table");
  if (structSignals.hasSalutation) signals.push("Detected: formal salutation (correspondence signal)");

  // Route to general if confidence below threshold
  if (confidence < CONFIDENCE_THRESHOLD) {
    signals.unshift(`Low confidence (${confidence}/100 < ${CONFIDENCE_THRESHOLD} threshold) — routing to general extractor`);
    return {
      type: "general",
      confidence,
      signals,
    };
  }

  return {
    type: topType as DocType,
    confidence,
    signals,
  };
}
