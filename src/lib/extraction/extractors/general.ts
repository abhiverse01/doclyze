/**
 * General/fallback extractor — entity extraction, statistics, readability,
 * section outline from heading detection, and v6: structure tree from layout data.
 * Runs for any unclassified document or presentation/educational material.
 */

import {
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  GeneralDetails,
  Insight,
} from "../types";
import {
  countWords,
  fleschKincaid,
  readingTimeMinutes,
  splitSentences,
} from "../normalize";
import { cleanExtractedSpan, cleanExtractedSpans } from "../clean-span";
import type { LayoutResult, DetectedHeading, LayoutTable } from "../layout";

// ─── Regex patterns with proper boundary handling ──────────────────────

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
/** v6: URL regex that stops at common trailing punctuation, not just whitespace. */
const URL_RE = /https?:\/\/[^\s"'`)\]}>;,]+/;
const DATE_RE =
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})\b/;
const MONEY_RE = /(?:[$\u20ac\u00a3\u00a5\u20b9]\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|[$\u20ac\u00a3\u00a5\u20b9]\s?\d+\.\d{2})/;
const PHONE_RE =
  /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/;

// ─── Entity extraction (v6: real discrimination, not just capitalized phrases) ─

/** Common org/company suffixes */
const ORG_SUFFIXES = [
  'Inc\.', 'Incorporated', 'LLC', 'Ltd\.', 'Limited', 'Corp\.', 'Corporation',
  'Co\.', 'Company', 'GmbH', 'AG', 'SA', 'NV', 'PLC', 'pvt', 'private',
  'University', 'Institute', 'College', 'Hospital', 'Clinic', 'Foundation',
  'Association', 'Society', 'Group', 'Holdings', 'Enterprises', 'Solutions',
  'Technologies', 'Laboratories', 'Industries', 'International', 'Global',
];

/** Context words that signal a person name nearby */
const PERSON_CONTEXT = [
  'by', 'author', 'written by', 'edited by', 'curated by', 'presented by',
  'instructor', 'professor', 'dr\.', 'doctor', 'mr\.', 'mrs\.', 'ms\.',
  'contact', 'signature', 'signed', 'sincerely', 'regards',
];

/** Context words that signal a location */
const LOCATION_CONTEXT = [
  'located in', 'based in', 'headquartered in', 'office at', 'address',
  'city of', 'state of', 'country of', 'near', 'from', 'born in',
];

/** Known location patterns (major cities, countries, US states) */
const LOCATION_PATTERNS = [
  // US States
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
  // Major world cities
  'London', 'Paris', 'Tokyo', 'Berlin', 'Sydney', 'Toronto', 'Mumbai',
  'Singapore', 'Dubai', 'Hong Kong', 'Shanghai', 'Beijing', 'Seoul',
  'Bangalore', 'San Francisco', 'Los Angeles', 'Chicago', 'New York City',
  'Boston', 'Seattle', 'Austin', 'Denver', 'Miami', 'Atlanta',
  // Countries
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
  'France', 'Japan', 'India', 'China', 'Brazil', 'Mexico', 'South Korea',
];

interface ClassifiedEntity {
  text: string;
  type: 'person' | 'organization' | 'location';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Extract named entities with real type discrimination.
 * v6: excludes headings, uses context signals and suffix patterns.
 */
function extractNamedEntities(
  text: string,
  headingTexts: Set<string>,
): ClassifiedEntity[] {
  const entities: ClassifiedEntity[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\n/);
  const textLower = text.toLowerCase();

  // Match 2-4 capitalized words
  const entityRe = /\b([A-Z][a-zA-Z'-.]+(?:\s+[A-Z][a-zA-Z'-.]+){1,3})\b/g;
  let m;

  while ((m = entityRe.exec(text)) !== null) {
    const raw = m[1].trim();
    if (raw.length <= 3 || raw.length > 80) continue;
    if (seen.has(raw.toLowerCase())) continue;

    // Skip if it's a known heading
    if (headingTexts.has(raw)) continue;
    if (headingTexts.has(raw.toUpperCase())) continue;

    // Skip common stop phrases
    const stopPhrases = new Set([
      'The End', 'Table of Contents', 'Fig', 'Figure', 'Section',
      'Chapter', 'Part', 'Appendix', 'References', 'Bibliography',
      'Acknowledgments', 'Abstract', 'Introduction', 'Conclusion',
      'Summary', 'Discussion', 'Results', 'Methods', 'Background',
    ]);
    if (stopPhrases.has(raw)) continue;

    // Try to classify
    let type: 'person' | 'organization' | 'location' | null = null;
    let confidence: 'high' | 'medium' | 'low' = 'low';

    // Check for organization suffixes
    const orgMatch = ORG_SUFFIXES.find(s =>
      new RegExp(`\\b${s}\\b`, 'i').test(raw)
    );
    if (orgMatch) {
      type = 'organization';
      confidence = 'high';
    }

    // Check for location patterns
    if (!type) {
      const isLocation = LOCATION_PATTERNS.some(loc =>
        raw.toLowerCase().includes(loc.toLowerCase()) ||
        loc.toLowerCase().includes(raw.toLowerCase())
      );
      if (isLocation) {
        type = 'location';
        confidence = 'high';
      }
    }

    // Check context for person names
    if (!type) {
      const startOfM = Math.max(0, m.index - 60);
      const endOfM = Math.min(text.length, m.index + raw.length + 60);
      const context = textLower.slice(startOfM, endOfM);

      const hasPersonContext = PERSON_CONTEXT.some(p => context.includes(p));
      const hasLocationContext = LOCATION_CONTEXT.some(p => context.includes(p));

      if (hasPersonContext && raw.split(/\s+/).length <= 3) {
        type = 'person';
        confidence = 'medium';
      } else if (hasLocationContext) {
        type = 'location';
        confidence = 'medium';
      }
    }

    // Only include if we could classify with at least medium confidence
    if (type && confidence !== 'low') {
      seen.add(raw.toLowerCase());
      entities.push({ text: raw, type, confidence });
    }

    if (entities.length >= 30) break;
  }

  return entities;
}

// ─── Section/heading detection (v6: layout-aware first, regex fallback) ───

/**
 * Build section outline from layout headings (primary) + regex (fallback).
 */
function buildSectionOutline(
  text: string,
  layoutHeadings: DetectedHeading[],
): GeneralDetails["sectionOutline"] {
  const outline: GeneralDetails["sectionOutline"] = [];
  const seen = new Set<string>();

  // Primary: use layout-detected headings (font-size based)
  for (const h of layoutHeadings) {
    const key = h.text.trim();
    if (!key || seen.has(key)) continue;
    if (key.length > 120) continue; // Skip very long "headings"
    seen.add(key);
    outline.push({
      heading: key,
      level: h.level,
    });
  }

  // Fallback: regex-based detection for documents without layout data
  if (outline.length === 0) {
    const lines = text.split(/\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Markdown-style
      const md = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (md) {
        const key = md[2].trim();
        if (!seen.has(key)) {
          seen.add(key);
          outline.push({ heading: key, level: md[1].length });
        }
        continue;
      }

      // ALL-CAPS heading (no trailing period, < 80 chars)
      if (
        trimmed.length > 3 &&
        trimmed.length < 80 &&
        /^[A-Z0-9][A-Z0-9\s,&\-:/.()]+$/.test(trimmed) &&
        !trimmed.endsWith(".") &&
        trimmed.split(/\s+/).length <= 8
      ) {
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          outline.push({ heading: trimmed, level: 1 });
        }
      }
    }
  }

  return outline.slice(0, 100);
}

// ─── Structure tree (v6: headings + nested content + attached tables) ────

export interface StructureNode {
  heading: string;
  level: number;
  content: string;
  children: StructureNode[];
  tables: Array<{
    id: string;
    columns: string[];
    rows: string[][];
    rowCount: number;
    colCount: number;
  }>;
}

/**
 * Build a structure tree from headings and body text.
 * Content between heading A (level 2) and heading B (level 2) is nested under A.
 * If heading C (level 3) appears between A and B, C becomes a child of A.
 */
export function buildStructureTree(
  text: string,
  headings: GeneralDetails["sectionOutline"],
  layoutTables: LayoutTable[],
): StructureNode[] {
  if (headings.length === 0) {
    // No headings — single root with all content
    return [{
      heading: "Document",
      level: 0,
      content: text,
      children: [],
      tables: layoutTables.map(t => ({
        id: t.id,
        columns: t.columns,
        rows: t.rows,
        rowCount: t.rowCount,
        colCount: t.colCount,
      })),
    }];
  }

  // Split text into segments by heading positions
  const lines = text.split(/\n/);
  const headingLineMap = new Map<number, number>(); // line index -> heading index

  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim();
    for (let h = 0; h < headings.length; h++) {
      if (trimmed === headings[h].heading ||
          trimmed.toUpperCase() === headings[h].heading.toUpperCase()) {
        headingLineMap.set(li, h);
        break;
      }
    }
  }

  // Assign content blocks to headings
  const headingPositions = Array.from(headingLineMap.entries())
    .sort(([a], [b]) => a - b);

  type NodeDraft = StructureNode & { _lineEnd: number };
  const nodes: NodeDraft[] = [];

  for (let i = 0; i < headingPositions.length; i++) {
    const [lineStart, hIdx] = headingPositions[i];
    const lineEnd = i + 1 < headingPositions.length
      ? headingPositions[i + 1][0]
      : lines.length;
    const content = lines
      .slice(lineStart + 1, lineEnd)
      .join("\n")
      .trim();

    // Find tables that belong to this section (by y-position proximity)
    // This is approximate — tables between two headings belong to the first
    const sectionTables = layoutTables.filter((_, tIdx) => {
      if (i + 1 < headingPositions.length) {
        return tIdx >= i && tIdx < i + 1;
      }
      return tIdx >= i;
    }).slice(0, 2); // Max 2 tables per section

    nodes.push({
      heading: headings[hIdx].heading,
      level: headings[hIdx].level,
      content,
      children: [],
      tables: sectionTables.map(t => ({
        id: t.id,
        columns: t.columns,
        rows: t.rows,
        rowCount: t.rowCount,
        colCount: t.colCount,
      })),
      _lineEnd: lineEnd,
    });
  }

  // Build hierarchy: nest children under parents based on level
  const root: NodeDraft[] = [];
  const stack: NodeDraft[] = [];

  for (const node of nodes) {
    // Pop stack until we find a parent with lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      root.push(node);
    }
    stack.push(node);
  }

  // Clean up internal _lineEnd field from output
  const clean = (nodes: NodeDraft[]): StructureNode[] =>
    nodes.map(({ _lineEnd, ...rest }) => ({
      ...rest,
    }));

  return clean(root);
}

// ─── Main extractor ─────────────────────────────────────────────────────

export function extractGeneral(
  text: string,
  filename: string,
  layoutData?: LayoutResult,
): {
  details: GeneralDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
  structureTree?: StructureNode[];
} {
  const wordCount = countWords(text);
  const sentences = splitSentences(text);
  const sentenceCount = sentences.length;
  const fk = fleschKincaid(text);
  const readingTime = readingTimeMinutes(wordCount);

  // v6: Use cleanExtractedSpan on ALL regex-extracted values
  const dates = cleanExtractedSpans(
    Array.from(text.matchAll(new RegExp(DATE_RE.source, 'g'))).map((m) => m[0])
  );
  const emails = cleanExtractedSpans(
    Array.from(text.matchAll(new RegExp(EMAIL_RE.source, 'g'))).map((m) => m[0])
  );
  const urls = cleanExtractedSpans(
    Array.from(text.matchAll(new RegExp(URL_RE.source, 'g'))).map((m) => m[0])
  );
  const monetaryAmounts = cleanExtractedSpans(
    Array.from(text.matchAll(new RegExp(MONEY_RE.source, 'g'))).map((m) => m[0])
  );
  const phoneNumbers = cleanExtractedSpans(
    Array.from(text.matchAll(new RegExp(PHONE_RE.source, 'g')))
      .map((m) => m[0])
      .filter((p) => p.replace(/\D/g, "").length >= 10)
  );

  // v6: Layout-aware heading and entity extraction
  const layoutHeadings = layoutData?.allHeadings ?? [];
  const layoutTables = layoutData?.allTables ?? [];

  // Build heading text set for entity exclusion
  const headingTexts = new Set<string>(
    layoutHeadings.map(h => h.text.trim()).filter(Boolean)
  );
  // Also add any ALL-CAPS or markdown headings from regex fallback
  const regexHeadings = buildSectionOutline(text, []);
  for (const rh of regexHeadings) {
    headingTexts.add(rh.heading);
    headingTexts.add(rh.heading.toUpperCase());
  }

  const sectionOutline = buildSectionOutline(text, layoutHeadings);
  const namedEntities = extractNamedEntities(text, headingTexts);

  const details: GeneralDetails = {
    entities: {
      dates,
      emails,
      urls,
      monetaryAmounts,
      phoneNumbers,
      namedEntities: namedEntities.map(e => `${e.text} [${e.type}]`),
    },
    statistics: {
      wordCount,
      sentenceCount,
      readingTimeMinutes: readingTime,
      fleschKincaidScore: fk.score,
      fleschKincaidGrade: fk.grade,
    },
    sectionOutline,
  };

  // ─── Field groups ───────────────────────────────────────────────────────
  const statsGroup: FieldGroup = {
    id: "stats",
    title: "Document Statistics",
    fields: [
      f("wordCount", "Word count", `${wordCount.toLocaleString()}`, "high"),
      f("sentenceCount", "Sentence count", `${sentenceCount.toLocaleString()}`, "high"),
      f("readingTime", "Reading time (est.)", `${readingTime} min`, "high"),
      f("fkScore", "Flesch-Kincaid score", `${fk.score}/100`, "high", "Higher = easier to read"),
      f("fkGrade", "Flesch-Kincaid grade", `${fk.grade}`, "high", "US grade level required to comprehend"),
    ],
  };

  const entitiesGroup: FieldGroup = {
    id: "entities",
    title: "Extracted Entities",
    fields: [
      f("dates", "Dates", dates.length ? dates.join("\n") : null, "high"),
      f("emails", "Emails", emails.length ? emails.join("\n") : null, "high"),
      f("urls", "URLs", urls.length ? urls.join("\n") : null, "high"),
      f("money", "Monetary amounts", monetaryAmounts.length ? monetaryAmounts.join("\n") : null, "high"),
      f("phones", "Phone numbers", phoneNumbers.length ? phoneNumbers.join("\n") : null, "medium"),
      f("namedEntities", "Named entities", namedEntities.length ? namedEntities.map(e => e.text).join("\n") : null, "medium"),
    ],
  };

  // v6: Structural quality field group
  const structureQuality: FieldGroup = {
    id: "structure-quality",
    title: "Structural Extraction Quality",
    fields: [
      f("headingsDetected", "Headings detected", `${sectionOutline.length}`, "high",
        layoutHeadings.length > 0
          ? `${layoutHeadings.length} from font-size analysis, ${Math.max(0, sectionOutline.length - layoutHeadings.length)} from pattern matching`
          : "Pattern matching only (no layout data)"),
      f("tablesReconstructed", "Tables reconstructed", `${layoutTables.length}`, layoutTables.length > 0 ? "high" : "medium",
        layoutTables.length > 0
          ? layoutTables.map(t => `${t.rowCount}x${t.colCount}`).join(", ")
          : "No grid-aligned tables detected"),
      f("entityTypes", "Entity types found",
        (() => {
          const types = new Set(namedEntities.map(e => e.type));
          return types.size > 0 ? Array.from(types).join(", ") : "none";
        })(),
        namedEntities.length > 0 ? "medium" : "low",
        `${namedEntities.length} entities classified into ${new Set(namedEntities.map(e => e.type)).size} types`
      ),
    ],
  };

  // ─── Tables ───────────────────────────────────────────────────────────────
  const outlineTable: ExtractedTable = {
    id: "outline",
    title: "Section Outline",
    description: `${sectionOutline.length} heading(s) detected`,
    columns: [
      { id: "heading", label: "Heading", type: "text" },
      { id: "level", label: "Level", type: "number", sortable: true },
    ],
    rows: sectionOutline.map((s) => ({ heading: s.heading, level: s.level })),
  };

  // v6: Add layout-detected tables as proper ExtractedTables
  const layoutExtractedTables: ExtractedTable[] = layoutTables.map((lt, i) => ({
    id: lt.id,
    title: `Table ${i + 1} (detected from layout)`,
    description: `${lt.rowCount} rows x ${lt.colCount} columns`,
    columns: lt.columns.map((col, ci) => ({
      id: `col_${ci}`,
      label: col,
      type: "text" as const,
    })),
    rows: lt.rows.map(row => {
 const record: Record<string, string | number | null> = {};
      for (let c = 0; c < lt.columns.length; c++) {
        record[`col_${c}`] = row[c] || null;
      }
      return record;
    }),
  }));

  const allTables = [outlineTable, ...layoutExtractedTables];

  // ─── Insights ─────────────────────────────────────────────────────────────
  const insights: Insight[] = [];

  if (fk.score > 0) {
    let band = "";
    if (fk.score >= 80) band = "very easy (6th-grade level)";
    else if (fk.score >= 60) band = "plain English (8th-9th grade)";
    else if (fk.score >= 40) band = "fairly difficult (10th-12th grade)";
    else if (fk.score >= 20) band = "difficult (college level)";
    else band = "very difficult (graduate level)";

    insights.push({
      id: "readability",
      title: `Readability: ${band} (FK ${fk.score})`,
      body: `Flesch-Kincaid score of ${fk.score} corresponds to roughly grade ${fk.grade}. Average sentence length and word complexity drive this metric.`,
      severity: "info",
      category: "Readability",
    });
  }

  if (wordCount < 100) {
    insights.push({
      id: "short-doc",
      title: `Very short document (${wordCount} words)`,
      body: "The document is unusually short. If it's expected to be longer, the file may have parsing issues — particularly if it's a scanned PDF.",
      severity: "notice",
      category: "Length",
    });
  }

  if (emails.length > 0) {
    insights.push({
      id: "emails-found",
      title: `${emails.length} email address(es) found`,
      body: "Emails are extracted and listed in the Structured Sheet. Verify these are intended to be shared before redistributing.",
      severity: "info",
      category: "Entities",
    });
  }

  if (monetaryAmounts.length > 0) {
    const total = monetaryAmounts.length;
    insights.push({
      id: "money-found",
      title: `${total} monetary amount(s) detected`,
      body: `Detected: ${monetaryAmounts.slice(0, 5).join(", ")}${total > 5 ? ", ..." : ""}. If this is a financial document, consider running it through the invoice extractor explicitly.`,
      severity: "info",
      category: "Entities",
    });
  }

  if (sectionOutline.length === 0 && wordCount > 200) {
    insights.push({
      id: "no-outline",
      title: "No headings detected",
      body: "The document has no Markdown headings, ALL-CAPS section labels, or font-size-based heading signals. Structuring content with headings would improve navigability.",
      severity: "notice",
      category: "Structure",
    });
  }

  // v6: Layout-specific insights
  if (layoutTables.length > 0) {
    const totalCells = layoutTables.reduce((sum, t) => sum + t.rowCount * t.colCount, 0);
    insights.push({
      id: "tables-detected",
      title: `${layoutTables.length} table(s) reconstructed from layout`,
      body: `Positional analysis detected ${layoutTables.length} table(s) with ${totalCells} total cells. These are reconstructed from text item alignment, not from document markup.`,
      severity: "info",
      category: "Structure",
    });
  }

  if (layoutHeadings.length > 0) {
    const levels = new Set(layoutHeadings.map(h => h.level));
    insights.push({
      id: "layout-headings",
      title: `${layoutHeadings.length} headings detected via font-size analysis`,
      body: `Heading levels found: ${Array.from(levels).sort().join(", ")}. Detection is based on font-size differentiation from body text, not just capitalization patterns.`,
      severity: "info",
      category: "Structure",
    });
  }

  const expected = [
    wordCount > 0 ? "words" : null,
    sentenceCount > 0 ? "sentences" : null,
    sectionOutline.length > 0 ? "outline" : null,
    emails.length + urls.length + dates.length + monetaryAmounts.length > 0 ? "entities" : null,
    layoutTables.length > 0 ? "tables" : null,
  ];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  // v6: Build structure tree
  const structureTree = buildStructureTree(text, sectionOutline, layoutTables);

  return {
    details,
    fieldGroups: [statsGroup, entitiesGroup, structureQuality],
    tables: allTables,
    insights,
    completeness,
    structureTree,
  };
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
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
