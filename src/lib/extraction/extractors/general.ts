/**
 * General/fallback extractor — entity extraction, statistics, readability,
 * section outline from heading detection. Runs for any unclassified document.
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

const EMAIL_RE_BASE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const URL_RE_BASE = /https?:\/\/[^\s)]+/;
const DATE_RE_BASE =
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})\b/;
const MONEY_RE_BASE = /(?:[$€£¥₹]\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|[$€£¥₹]\s?\d+\.\d{2})/;
const PHONE_RE_BASE =
  /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/;

// Lightweight NER — capitalized multi-word phrases that aren't sentence starts
function extractNamedEntities(text: string): string[] {
  const entities = new Set<string>();
  // Match 2-4 capitalized words in a row, not at sentence start
  const reBase = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3})\b/;
  let m;
  const re = new RegExp(reBase.source, 'g');
  const stop = new Set([
    "The", "This", "That", "These", "Those", "However", "Therefore",
    "Furthermore", "Moreover", "Additionally", "Meanwhile", "Thus",
    "Although", "Because", "While", "When", "Where", "What", "Which",
    "Who", "Whom", "Whose", "Why", "How", "And", "But", "Or", "Nor",
    "For", "Yet", "So", "If", "Then", "Else", "As", "At", "By", "In",
    "Of", "On", "To", "Up", "With", "From", "Into", "Over", "After",
    "Before", "Between", "Under", "Above", "Below", "Through", "During",
    "Without", "Within", "About", "Against", "Around", "Among",
    "New York", "San Francisco", "Los Angeles", "United States",
  ]);
  while ((m = re.exec(text)) !== null) {
    const e = m[1].trim();
    if (!stop.has(e) && e.length > 3) {
      entities.add(e);
    }
    if (entities.size >= 30) break;
  }
  return Array.from(entities).slice(0, 30);
}

// Markdown-style headings: "# X", "## X", or ALL-CAPS lines under 80 chars
function extractSectionOutline(text: string): GeneralDetails["sectionOutline"] {
  const outline: GeneralDetails["sectionOutline"] = [];
  const lines = text.split(/\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Markdown-style
    const md = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (md) {
      outline.push({
        heading: md[2].trim(),
        level: md[1].length,
      });
      continue;
    }

    // ALL-CAPS heading (no trailing period, < 80 chars)
    if (
      trimmed.length > 3 &&
      trimmed.length < 80 &&
      /^[A-Z0-9][A-Z0-9\s,&\-:/.()]+$/.test(trimmed) &&
      !trimmed.endsWith(".") &&
      // Avoid treating acronyms-in-sentences as headings
      trimmed.split(/\s+/).length <= 8
    ) {
      outline.push({
        heading: trimmed,
        level: 1,
      });
    }
  }
  return outline.slice(0, 50);
}

export function extractGeneral(text: string, filename: string): {
  details: GeneralDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  const wordCount = countWords(text);
  const sentences = splitSentences(text);
  const sentenceCount = sentences.length;
  const fk = fleschKincaid(text);
  const readingTime = readingTimeMinutes(wordCount);

  const dates = unique(Array.from(text.matchAll(new RegExp(DATE_RE_BASE.source, 'g'))).map((m) => m[0]));
  const emails = unique(Array.from(text.matchAll(new RegExp(EMAIL_RE_BASE.source, 'g'))).map((m) => m[0]));
  const urls = unique(Array.from(text.matchAll(new RegExp(URL_RE_BASE.source, 'g'))).map((m) => m[0]));
  const monetaryAmounts = unique(Array.from(text.matchAll(new RegExp(MONEY_RE_BASE.source, 'g'))).map((m) => m[0]));
  const phoneNumbers = unique(
    Array.from(text.matchAll(new RegExp(PHONE_RE_BASE.source, 'g'))).map((m) => m[0]).filter((p) => p.replace(/\D/g, "").length >= 10)
  );
  const namedEntities = extractNamedEntities(text);
  const sectionOutline = extractSectionOutline(text);

  const details: GeneralDetails = {
    entities: { dates, emails, urls, monetaryAmounts, phoneNumbers, namedEntities },
    statistics: {
      wordCount,
      sentenceCount,
      readingTimeMinutes: readingTime,
      fleschKincaidScore: fk.score,
      fleschKincaidGrade: fk.grade,
    },
    sectionOutline,
  };

  // ─── Field groups ─────────────────────────────────────────────────────────
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
      f("namedEntities", "Named entities (heuristic)", namedEntities.length ? namedEntities.join("\n") : null, "low"),
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

  // ─── Insights ─────────────────────────────────────────────────────────────
  const insights: Insight[] = [];

  if (fk.score > 0) {
    let band = "";
    if (fk.score >= 80) band = "very easy (6th-grade level)";
    else if (fk.score >= 60) band = "plain English (8th–9th grade)";
    else if (fk.score >= 40) band = "fairly difficult (10th–12th grade)";
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
      body: `Detected: ${monetaryAmounts.slice(0, 5).join(", ")}${total > 5 ? ", …" : ""}. If this is a financial document, consider running it through the invoice extractor explicitly.`,
      severity: "info",
      category: "Entities",
    });
  }

  if (sectionOutline.length === 0 && wordCount > 200) {
    insights.push({
      id: "no-outline",
      title: "No headings detected",
      body: "The document has no Markdown headings or ALL-CAPS section labels. Structuring content with headings would improve navigability.",
      severity: "notice",
      category: "Structure",
    });
  }

  const expected = [
    wordCount > 0 ? "words" : null,
    sentenceCount > 0 ? "sentences" : null,
    sectionOutline.length > 0 ? "outline" : null,
    emails.length + urls.length + dates.length + monetaryAmounts.length > 0 ? "entities" : null,
  ];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  return {
    details,
    fieldGroups: [statsGroup, entitiesGroup],
    tables: [outlineTable],
    insights,
    completeness,
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
