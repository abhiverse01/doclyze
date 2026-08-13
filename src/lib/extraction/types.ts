/**
 * Doclyze Extraction Result Schema
 * --------------------------------
 * A strict, versioned TypeScript shape that every extractor conforms to.
 * The Presentor and Insights layers render this generically.
 *
 * Versioning: bump `schemaVersion` whenever the wire shape changes.
 * The API route at /api/insights accepts this exact payload.
 */

export type DocType =
  | "resume"
  | "invoice"
  | "contract"
  | "research_paper"
  | "spreadsheet"
  | "general"
  | "academic_transcript"
  | "purchase_order"
  | "financial_statement"
  | "medical_report";

export type Confidence = "high" | "medium" | "low";

export type Severity = "info" | "notice" | "warning";

export type CellType = "text" | "date" | "currency" | "number" | "url" | "email" | "tag";

/** A single field — value + provenance + confidence, for the Presentor. */
export interface ExtractedField<T = string> {
  key: string;
  label: string;
  value: T | null;
  confidence: Confidence;
  /** Where in the document this came from (page / line / heuristic name) */
  provenance?: string;
}

/** A table section in the Presentor — spreadsheet-grade rows. */
export interface ExtractedTable {
  id: string;
  title: string;
  description?: string;
  columns: {
    id: string;
    label: string;
    type: CellType;
    /** When true, column supports sorting */
    sortable?: boolean;
  }[];
  rows: Record<string, string | number | null>[];
  /** Per-cell confidence — keyed by `${rowIndex}.${columnId}` */
  cellConfidence?: Record<string, Confidence>;
}

/** A scalar field group — the two-column "field / value" sheet block. */
export interface FieldGroup {
  id: string;
  title: string;
  fields: ExtractedField[];
}

/** Deterministic insight — grounded in the extracted data, no LLM required. */
export interface Insight {
  id: string;
  title: string;
  body: string;
  severity: Severity;
  category: string;
  /** Marks this as AI-generated (vs deterministic) for visual tagging */
  aiGenerated?: boolean;
}

/** Per-type detail payload. Keep these as plain JSON — they cross the wire. */
export interface ResumeDetails {
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    links: { label: string; url: string }[];
  };
  summary: string | null;
  experience: Array<{
    company: string;
    title: string;
    startDate: string | null; // ISO-ish, normalized
    endDate: string | null;
    isCurrent: boolean;
    durationMonths: number | null;
    bullets: string[];
  }>;
  education: Array<{
    institution: string;
    degree: string | null;
    field: string | null;
    graduationDate: string | null;
  }>;
  skills: {
    languages: string[];
    frameworks: string[];
    tools: string[];
    soft: string[];
    other: string[];
  };
  certifications: string[];
  projects: Array<{ name: string; description: string }>;
  publications: string[];
  derived: {
    totalYearsExperience: number | null;
    gaps: Array<{ from: string; to: string; months: number }>;
    atsKeywordCoverage: { category: string; hit: boolean }[];
  };
}

export interface InvoiceDetails {
  vendor: { name: string | null; address: string | null; email: string | null };
  billTo: { name: string | null; address: string | null; email: string | null };
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  lineItems: Array<{
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    total: number | null;
  }>;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string;
  reconciliation: {
    lineItemsSum: number;
    statedTotal: number | null;
    matches: boolean;
    difference: number;
  };
}

export interface ContractDetails {
  parties: string[];
  definedTerms: Array<{ term: string; definition: string }>;
  effectiveDate: string | null;
  terminationDate: string | null;
  sections: Array<{ number: string | null; title: string }>;
  riskClauses: Array<{
    type: string; // "auto_renewal" | "indemnification" | "non_compete" | ...
    clause: string;
    excerpt: string;
    severity: Severity;
  }>;
  obligations: string[];
}

export interface ResearchPaperDetails {
  title: string | null;
  authors: string[];
  abstract: string | null;
  sections: Array<{ heading: string; level: number }>;
  keywords: string[];
  citationCountEstimate: number;
  references: string[];
}

export interface SpreadsheetDetails {
  headers: string[];
  rowCount: number;
  columnCount: number;
  inferredTypes: Record<string, CellType>;
  preview: Record<string, string | number | null>[];
}

export interface GeneralDetails {
  entities: {
    dates: string[];
    emails: string[];
    urls: string[];
    monetaryAmounts: string[];
    phoneNumbers: string[];
    namedEntities: string[];
  };
  statistics: {
    wordCount: number;
    sentenceCount: number;
    readingTimeMinutes: number;
    fleschKincaidScore: number;
    fleschKincaidGrade: number;
  };
  sectionOutline: Array<{ heading: string; level: number }>;
}

export interface AcademicTranscriptDetails {
  studentName: string | null;
  institution: string | null;
  degreeProgram: string | null;
  overallGPA: number | null;
  majorGPA: number | null;
  gpaScale: number | null;
  terms: Array<{
    name: string;
    year: string | null;
    courses: Array<{
      code: string | null;
      title: string | null;
      credits: number | null;
      grade: string | null;
    }>;
  }>;
  totalCreditsEarned: number | null;
  deansList: string[];
  graduationDate: string | null;
}

export interface PurchaseOrderDetails {
  poNumber: string | null;
  date: string | null;
  buyer: string | null;
  vendor: string | null;
  shipToAddress: string | null;
  lineItems: Array<{
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    total: number | null;
  }>;
  subtotal: number | null;
  tax: number | null;
  shipping: number | null;
  total: number | null;
  currency: string;
  paymentTerms: string | null;
  authorizedBy: string | null;
  deliveryDate: string | null;
}

export interface FinancialStatementDetails {
  companyName: string | null;
  statementPeriod: string | null;
  statementType: string | null;
  revenue: number | null;
  netIncome: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  yearOverYearComparisons: Array<{
    metric: string;
    current: number | null;
    prior: number | null;
  }>;
  footnotesCount: number;
}

export interface MedicalReportDetails {
  patientName: string | null;
  dateOfReport: string | null;
  orderingPhysician: string | null;
  labName: string | null;
  testResults: Array<{
    testName: string;
    value: string;
    unit: string | null;
    referenceRange: string | null;
    flag: "normal" | "abnormal" | "critical" | null;
  }>;
  status: "normal" | "abnormal" | "critical" | null;
  notes: string | null;
}

export type TypeDetails =
  | { type: "resume"; details: ResumeDetails }
  | { type: "invoice"; details: InvoiceDetails }
  | { type: "contract"; details: ContractDetails }
  | { type: "research_paper"; details: ResearchPaperDetails }
  | { type: "spreadsheet"; details: SpreadsheetDetails }
  | { type: "general"; details: GeneralDetails }
  | { type: "academic_transcript"; details: AcademicTranscriptDetails }
  | { type: "purchase_order"; details: PurchaseOrderDetails }
  | { type: "financial_statement"; details: FinancialStatementDetails }
  | { type: "medical_report"; details: MedicalReportDetails };

export interface DoclyzeExtractionResult {
  schemaVersion: 1;
  documentId: string;
  filename: string;
  fileType: string; // MIME type
  fileSizeBytes: number;
  detectedType: DocType;
  extractedAt: string; // ISO timestamp
  /** True when OCR was used to obtain text (image PDF / image file). */
  ocrUsed: boolean;
  /** Top-level scalar field groups (always present, even for type-specific). */
  fieldGroups: FieldGroup[];
  /** Tabular sections — invoice line items, work experience entries, etc. */
  tables: ExtractedTable[];
  /** Deterministic insights — always present, no AI required. */
  insights: Insight[];
  /** Completeness 0-100 — how many expected fields for the type were found. */
  completenessScore: number;
  /** Per-type payload — type-narrow on the `type` discriminator. */
  typed: TypeDetails;
  /** Raw extracted text, for the Raw Text tab. */
  rawText: string;
  /** Per-page text (for paginated sources like PDFs); empty for non-paginated. */
  pages: string[];
}
