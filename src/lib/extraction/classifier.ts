/**
 * Deterministic document-type classifier.
 * Keyword + structure heuristics — no ML, no API calls, fully re-runnable.
 */

import { DocType } from "./types";

interface ClassifyInput {
  text: string;
  filename: string;
  /** True if the file came in as CSV/TSV with a tabular parse. */
  tabular?: boolean;
}

interface ClassifyResult {
  type: DocType;
  confidence: "high" | "medium" | "low";
  signals: string[];
}

/** Score a doc type by counting keyword hits weighted by section-headers. */
function score(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    // word-boundary match, count occurrences up to a cap
    const re = new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`, "g");
    const matches = lower.match(re);
    if (matches) {
      // Cap so a single repeated word doesn't dominate
      score += Math.min(matches.length, 5);
    }
  }
  return score;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RESUME_KW = [
  "experience",
  "education",
  "skills",
  "summary",
  "objective",
  "certifications",
  "work history",
  "employment",
  "bachelor",
  "master",
  "phd",
  "gpa",
  "linkedin",
  "github",
  "portfolio",
  "references",
  "achievements",
];

const INVOICE_KW = [
  "invoice",
  "bill to",
  "ship to",
  "subtotal",
  "tax",
  "total due",
  "amount due",
  "balance due",
  "payment terms",
  "po number",
  "purchase order",
  "remit",
  "unit price",
  "quantity",
  "line item",
  "discount",
  "net 30",
  "net 60",
];

const CONTRACT_KW = [
  "whereas",
  "the parties",
  "agreement",
  "party a",
  "party b",
  "effective date",
  "termination",
  "indemnify",
  "indemnification",
  "liability",
  "confidential",
  "warrant",
  "herein",
  "hereby",
  "thereof",
  "section 1",
  "section 2",
  "article i",
  "article ii",
  "force majeure",
  "governing law",
  "severability",
  "non-compete",
  "non-compete",
];

const PAPER_KW = [
  "abstract",
  "introduction",
  "methodology",
  "methods",
  "results",
  "discussion",
  "conclusion",
  "references",
  "bibliography",
  "et al",
  "doi",
  "arxiv",
  "keywords",
  "fig.",
  "figure 1",
  "table 1",
  "citations",
  "acknowledgements",
  "1. introduction",
  "peer review",
];

const TRANSCRIPT_KW = [
  "transcript",
  "gpa",
  "semester",
  "credits",
  "dean's list",
  "academic record",
  "grade report",
  "cumulative",
  "course",
  "credit hours",
  "academic standing",
  "bachelor of",
  "master of",
  "grade point average",
  "registrar",
  "enrolled",
  "academic year",
  "fall semester",
  "spring semester",
];

const PURCHASE_ORDER_KW = [
  "purchase order",
  "po number",
  "requisition",
  "ship to",
  "authorized by",
  "delivery date",
  "buyer",
  "vendor",
  "supplier",
  "requisitioner",
  "purchaser",
  "ordered by",
  "ship date",
  "freight",
  "shipping",
  "approved by",
  "qty",
  "unit price",
  "po #",
  "delivery",
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
  "liabilities",
  "equity",
  "revenue",
  "earnings",
  "depreciation",
  "operating income",
  "gross profit",
  "net profit",
  "fiscal",
  "audited",
  "footnotes",
  "statement of",
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
  "result",
  "test results",
  "abnormal",
  "critical",
  "physician",
  "specimen type",
  "collection date",
  "ordering physician",
];

export function classifyDocument({ text, filename, tabular }: ClassifyInput): ClassifyResult {
  // Tabular files are spreadsheets — short-circuit
  if (tabular) {
    return {
      type: "spreadsheet",
      confidence: "high",
      signals: ["Tabular file structure detected (CSV/TSV)"],
    };
  }

  // Filename hint
  const fn = filename.toLowerCase();
  if (/(invoice|receipt)/.test(fn)) {
    return {
      type: "invoice",
      confidence: "high",
      signals: [`Filename "${filename}" suggests an invoice/receipt`],
    };
  }
  if (/(contract|agreement|nda|msa|sow)/.test(fn)) {
    return {
      type: "contract",
      confidence: "high",
      signals: [`Filename "${filename}" suggests a contract/agreement`],
    };
  }
  if (/(resume|cv|curriculum)/.test(fn)) {
    return {
      type: "resume",
      confidence: "high",
      signals: [`Filename "${filename}" suggests a resume/CV`],
    };
  }
  if (/(paper|article|manuscript|thesis|dissertation)/.test(fn)) {
    return {
      type: "research_paper",
      confidence: "high",
      signals: [`Filename "${filename}" suggests a research paper`],
    };
  }
  if (/transcript/i.test(fn)) {
    return {
      type: "academic_transcript",
      confidence: "high",
      signals: [`Filename "${filename}" suggests an academic transcript`],
    };
  }
  if (/po\d|purchase.?order|requisition/i.test(fn)) {
    return {
      type: "purchase_order",
      confidence: "high",
      signals: [`Filename "${filename}" suggests a purchase order`],
    };
  }
  if (/financial|balance.?sheet|income.?statement|cash.?flow|10-?k/i.test(fn)) {
    return {
      type: "financial_statement",
      confidence: "high",
      signals: [`Filename "${filename}" suggests a financial statement`],
    };
  }
  if (/lab-?report|medical|pathology|blood.?work|clinical/i.test(fn)) {
    return {
      type: "medical_report",
      confidence: "high",
      signals: [`Filename "${filename}" suggests a medical/lab report`],
    };
  }

  // Content scoring
  const scores: Record<string, number> = {
    resume: score(text, RESUME_KW),
    invoice: score(text, INVOICE_KW),
    contract: score(text, CONTRACT_KW),
    research_paper: score(text, PAPER_KW),
    academic_transcript: score(text, TRANSCRIPT_KW),
    purchase_order: score(text, PURCHASE_ORDER_KW),
    financial_statement: score(text, FINANCIAL_STATEMENT_KW),
    medical_report: score(text, MEDICAL_REPORT_KW),
  };

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = entries[0];
  const runnerUp = entries[1][1];

  if (topScore < 4) {
    return {
      type: "general",
      confidence: "low",
      signals: [
        `No document-type signals reached threshold (top: ${topType}=${topScore}, need ≥4)`,
      ],
    };
  }

  const confidence = topScore >= 8 && topScore >= runnerUp * 2 ? "high" : "medium";
  return {
    type: topType as DocType,
    confidence,
    signals: [
      `Top keyword score: ${topType}=${topScore} (runner-up ${runnerUp})`,
      `Detected via keyword + structure heuristics`,
    ],
  };
}
