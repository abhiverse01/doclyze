/**
 * Research paper extractor — title, authors, abstract, sections, citations.
 */

import {
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  Insight,
  ResearchPaperDetails,
} from "../types";

export function extractResearchPaper(text: string, filename: string): {
  details: ResearchPaperDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  // Title — first non-empty line that's not "Abstract" and isn't a header marker
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  let title: string | null = null;
  for (const line of lines.slice(0, 15)) {
    const lower = line.toLowerCase();
    if (
      line.length > 15 &&
      line.length < 300 &&
      !lower.startsWith("abstract") &&
      !lower.startsWith("introduction") &&
      !lower.includes("@") && // not an email line
      !/^\d/.test(line) && // not a numbered section
      !lower.startsWith("keywords") &&
      !lower.startsWith("author")
    ) {
      title = line;
      break;
    }
  }

  // Authors — line(s) after the title, before "Abstract"
  const authors: string[] = [];
  const titleIdx = title ? lines.findIndex((l) => l === title) : -1;
  if (titleIdx >= 0) {
    for (let i = titleIdx + 1; i < Math.min(titleIdx + 8, lines.length); i++) {
      const line = lines[i];
      if (/abstract/i.test(line)) break;
      if (line.length < 5 || line.length > 300) continue;
      // Authors line typically has commas / "and"
      if (/[,;]| and /i.test(line) && !/\d{4}/.test(line)) {
        const names = line
          .split(/[,;]|\s+and\s+/i)
          .map((s) => s.trim())
          .filter((s) => s.length > 2 && s.length < 60 && /^[A-Z]/.test(s));
        authors.push(...names);
        break;
      }
      // Single-author case
      if (/^[A-Z][a-zA-Z\s.'-]{5,50}$/.test(line) && !authors.length) {
        authors.push(line);
        break;
      }
    }
  }

  // Abstract — between "Abstract" and the next section heading
  const abstractMatch = text.match(/abstract\s*[:\n]([\s\S]*?)(?:\n\s*\n|keywords|introduction|1\.\s|1\s+introduction)/i);
  const abstract = abstractMatch?.[1]?.trim().slice(0, 3000) ?? null;

  // Sections — "1. Introduction", "2. Methods", "3.1 Sub", etc.
  const sections: ResearchPaperDetails["sections"] = [];
  const sectionReBase = /(?:^|\n)\s*(\d+(?:\.\d+)*)\.?\s+([A-Z][A-Za-z\s,'\-:&()]{2,80})/;
  const seen = new Set<string>();
  let m;
  const sectionRe = new RegExp(sectionReBase.source, 'g');
  while ((m = sectionRe.exec(text)) !== null && sections.length < 60) {
    const number = m[1];
    const heading = m[2].trim();
    const key = `${number}-${heading.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      sections.push({
        heading: `${number}. ${heading}`,
        level: number.split(".").length,
      });
    }
  }

  // Keywords
  const keywordsMatch = text.match(/keywords?[:\s]*([^\n.]{5,300})/i);
  const keywords = keywordsMatch
    ? keywordsMatch[1].split(/[,;]/).map((s) => s.trim()).filter((s) => s.length > 1).slice(0, 15)
    : [];

  // Citation count — count "[1]", "[Smith 2020]", or "(Author, year)" patterns
  const bracketCitations = text.match(/\[(\d{1,4})(?:[-,;\s]+\d{1,4})*\]/g) ?? [];
  let citationCountEstimate = 0;
  for (const c of bracketCitations) {
    const nums = c.match(/\d+/g);
    if (nums) citationCountEstimate += nums.length;
  }
  // Author-year style: (Smith, 2020) or (Smith et al., 2020)
  const authorYear = text.match(/\([A-Z][A-Za-z\s]+,?\s+(?:et al\.?,?\s+)?\d{4}[a-z]?\)/g) ?? [];
  citationCountEstimate += authorYear.length;

  // References — last section
  const refsMatch = text.match(/(?:references|bibliography|works cited)\s*\n([\s\S]*?)$/i);
  const references: string[] = [];
  if (refsMatch) {
    const refLines = refsMatch[1].split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of refLines) {
      // References typically start with [1] or 1. or just a capitalized name + year
      if (/^\[?\d+[\].]/.test(line) || /\b(19|20)\d{2}\b/.test(line)) {
        references.push(line.slice(0, 300));
      }
      if (references.length >= 50) break;
    }
  }

  const details: ResearchPaperDetails = {
    title,
    authors,
    abstract,
    sections,
    keywords,
    citationCountEstimate,
    references,
  };

  // ─── Field groups ─────────────────────────────────────────────────────────
  const headerGroup: FieldGroup = {
    id: "header",
    title: "Paper Metadata",
    fields: [
      f("title", "Title", title, "high"),
      f("authors", "Authors", authors.length ? authors.join(", ") : null, "high"),
      f("keywords", "Keywords", keywords.length ? keywords.join(", ") : null, "medium"),
      f("citationCount", "Citation count (est.)", `${citationCountEstimate}`, "medium", "Estimated from in-text citation markers"),
      f("sectionCount", "Sections detected", `${sections.length}`, "high"),
      f("refCount", "References listed", `${references.length}`, "high"),
    ],
  };

  const abstractGroup: FieldGroup = {
    id: "abstract",
    title: "Abstract",
    fields: [f("abstract", "Abstract", abstract, "high")],
  };

  // ─── Tables ───────────────────────────────────────────────────────────────
  const sectionsTable: ExtractedTable = {
    id: "sections",
    title: "Section Outline",
    description: `${sections.length} section(s)`,
    columns: [
      { id: "heading", label: "Heading", type: "text" },
      { id: "level", label: "Level", type: "number", sortable: true },
    ],
    rows: sections.map((s) => ({ heading: s.heading, level: s.level })),
  };

  const refsTable: ExtractedTable = {
    id: "references",
    title: "References",
    description: `${references.length} reference(s) parsed`,
    columns: [{ id: "reference", label: "Reference", type: "text" }],
    rows: references.map((r, i) => ({ reference: `[${i + 1}] ${r}` })),
  };

  // ─── Insights ─────────────────────────────────────────────────────────────
  const insights: Insight[] = [];

  if (!abstract) {
    insights.push({
      id: "no-abstract",
      title: "No abstract detected",
      body: "Doclyze could not find a clearly labeled abstract section. Papers without abstracts are harder to index and cite.",
      severity: "warning",
      category: "Structure",
    });
  } else if (abstract.length < 200) {
    insights.push({
      id: "short-abstract",
      title: `Abstract is short (${abstract.length} chars)`,
      body: "Most journals expect 150–300 words. Consider expanding to cover background, methods, results, and contribution.",
      severity: "notice",
      category: "Structure",
    });
  }

  if (authors.length === 0) {
    insights.push({
      id: "no-authors",
      title: "No authors identified",
      body: "Could not parse an author list. Ensure authors are listed below the title, separated by commas.",
      severity: "notice",
      category: "Metadata",
    });
  }

  if (citationCountEstimate > 0 && references.length === 0) {
    insights.push({
      id: "citations-no-refs",
      title: `${citationCountEstimate} in-text citations but no references section found`,
      body: "The paper cites sources but Doclyze could not locate the references section. The file may be truncated.",
      severity: "warning",
      category: "Citations",
    });
  }

  if (citationCountEstimate === 0 && references.length === 0) {
    insights.push({
      id: "no-citations",
      title: "No citations detected",
      body: "This paper has no in-text citations or references. Most academic work requires citation of prior literature.",
      severity: "notice",
      category: "Citations",
    });
  }

  if (sections.length > 0) {
    const topLevel = sections.filter((s) => s.level === 1);
    const expected = ["introduction", "method", "result", "discussion", "conclusion"];
    const missing = expected.filter((e) =>
      !topLevel.some((s) => s.heading.toLowerCase().includes(e))
    );
    if (missing.length > 0) {
      insights.push({
        id: "missing-sections",
        title: `Missing standard sections: ${missing.join(", ")}`,
        body: "Most research papers follow IMRaD structure. The detected outline is missing one or more expected top-level sections.",
        severity: "notice",
        category: "Structure",
      });
    }
  }

  const expected = [title, authors.length > 0 ? "authors" : null, abstract, sections.length > 0 ? "sections" : null, references.length > 0 ? "refs" : null];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  return {
    details,
    fieldGroups: [headerGroup, abstractGroup],
    tables: [sectionsTable, refsTable],
    insights,
    completeness,
  };
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
