/**
 * Contract extractor — parties, defined terms, sections, risk clauses.
 */

import {
  ContractDetails,
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  Insight,
  Severity,
} from "../types";

const DATE_RE_BASE = /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})\b/;

const RISK_CLAUSE_DEFINITIONS: Array<{
  type: string;
  patterns: RegExp[];
  severity: Severity;
  label: string;
}> = [
  {
    type: "auto_renewal",
    patterns: [/auto[\s-]?renew/i, /automatically\s+renew/i, /successive\s+(renewal|term)/i],
    severity: "notice",
    label: "Auto-renewal",
  },
  {
    type: "indemnification",
    patterns: [/indemnif/i, /hold\s+harmless/i],
    severity: "notice",
    label: "Indemnification",
  },
  {
    type: "non_compete",
    patterns: [/non[\s-]?compete/i, /covenant\s+not\s+to\s+compete/i, /restrictive\s+covenant/i],
    severity: "warning",
    label: "Non-compete",
  },
  {
    type: "non_disclosure",
    patterns: [/confidential\s+information/i, /non[\s-]?disclosure/i, /trade\s+secret/i],
    severity: "info",
    label: "Confidentiality / NDA",
  },
  {
    type: "exclusive",
    patterns: [/\bexclusive\b/i, /sole\s+and\s+exclusive/i],
    severity: "notice",
    label: "Exclusivity",
  },
  {
    type: "unlimited_liability",
    patterns: [/unlimited\s+liability/i, /no\s+cap\s+on\s+liability/i, /aggregate\s+liability.*shall\s+not\s+exceed/i],
    severity: "warning",
    label: "Liability cap",
  },
  {
    type: "termination_for_convenience",
    patterns: [/termination\s+for\s+convenience/i, /terminate\s+(?:this\s+agreement\s+)?for\s+any\s+reason/i],
    severity: "info",
    label: "Termination for convenience",
  },
  {
    type: "force_majeure",
    patterns: [/force\s+majeure/i, /acts?\s+of\s+god/i],
    severity: "info",
    label: "Force majeure",
  },
  {
    type: "governing_law",
    patterns: [/governing\s+law/i, /jurisdiction/i, /venue/i, /forum/i],
    severity: "info",
    label: "Governing law / jurisdiction",
  },
  {
    type: "ip_assignment",
    patterns: [/work\s+made\s+for\s+hire/i, /assign(?:s|ment)?\s+all\s+(?:right|title|interest)/i, /intellectual\s+property/i],
    severity: "notice",
    label: "IP assignment",
  },
  {
    type: "data_processing",
    patterns: [/personal\s+data/i, /data\s+processor/i, /gdpr/i, /ccpa/i, /privacy\s+shield/i],
    severity: "notice",
    label: "Data protection",
  },
];

const PARTY_PATTERNS = [
  /(?:between|by\s+and\s+between)\s+([^,.;]+?)\s+(?:and|&)\s+([^,.;]+?)(?:\.|,|;|\n)/i,
  /(?:[""'])([^""]{2,80})(?:[""'])\s*\([""]?([^)""]{2,80})[""]?\)\s*(?:and|&)\s*(?:[""'])([^""]{2,80})(?:[""'])\s*\([""]?([^)""]{2,80})[""]?\)/i,
  /\b(?:Party\s*A|Licensor|Seller|Client|Employer|Vendor|Service\s+Provider)[:\s]*([^,\n.;]{2,80})/i,
  /\b(?:Party\s*B|Licensee|Buyer|Contractor|Employee|Customer)[:\s]*([^,\n.;]{2,80})/i,
];

export function extractContract(text: string, filename: string): {
  details: ContractDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  // Parties
  const parties: string[] = [];
  for (const pattern of PARTY_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      for (let i = 1; i < m.length; i++) {
        if (m[i] && m[i].trim().length > 1 && !parties.includes(m[i].trim())) {
          parties.push(m[i].trim().slice(0, 100));
        }
      }
      if (parties.length >= 2) break;
    }
  }

  // Defined terms — look for ""Term" means ..." or ""Term" shall mean ..."
  const definedTerms: ContractDetails["definedTerms"] = [];
  const termReBase = /(?:[""'])([A-Z][A-Za-z\s]{1,40})(?:[""'])\s*(?:means|shall\s+mean|refers?\s+to)\s+([^.\n]{5,300})\./;
  let match;
  const seenTerms = new Set<string>();
  const termRe = new RegExp(termReBase.source, 'g');
  while ((match = termRe.exec(text)) !== null && definedTerms.length < 30) {
    const term = match[1].trim();
    if (!seenTerms.has(term.toLowerCase())) {
      seenTerms.add(term.toLowerCase());
      definedTerms.push({
        term,
        definition: match[2].trim().slice(0, 300),
      });
    }
  }

  // Dates
  const dates = Array.from(text.matchAll(new RegExp(DATE_RE_BASE.source, 'g'))).map((m) => m[0]);
  const effectiveMatch = text.match(/effective\s+date[:\s]*([A-Za-z0-9 ,/\-]+)/i);
  const terminationMatch = text.match(/termination\s+date[:\s]*([A-Za-z0-9 ,/\-]+)/i);
  const effectiveDate = effectiveMatch?.[1]?.trim().split(/\n/)[0] ?? dates[0] ?? null;
  const terminationDate = terminationMatch?.[1]?.trim().split(/\n/)[0] ?? null;

  // Sections — "1. Title" or "Section 1. Title" or "Article I. Title"
  const sections: ContractDetails["sections"] = [];
  const sectionReBase =
    /(?:^|\n)\s*(?:(?:section|article)\s+)?(\d+\.?(?:\.\d+)*)\.?\s+([A-Z][A-Za-z\s,'\-&()]{2,80})/;
  const sectionSeen = new Set<string>();
  const sectionRe = new RegExp(sectionReBase.source, 'g');
  while ((match = sectionRe.exec(text)) !== null && sections.length < 50) {
    const number = match[1];
    const title = match[2].trim().replace(/\s+$/, "");
    const key = `${number}-${title.toLowerCase()}`;
    if (!sectionSeen.has(key) && title.length > 2 && title.length < 100) {
      sectionSeen.add(key);
      sections.push({ number, title });
    }
  }

  // Risk clauses — scan the whole text
  const riskClauses: ContractDetails["riskClauses"] = [];
  for (const def of RISK_CLAUSE_DEFINITIONS) {
    for (const pattern of def.patterns) {
      const m = text.match(pattern);
      if (m) {
        // Find the surrounding sentence for the excerpt
        const idx = m.index ?? 0;
        const start = Math.max(0, text.lastIndexOf(".", idx - 1) + 1);
        const end = text.indexOf(".", idx);
        const excerpt = text.slice(start, end > 0 ? end + 1 : Math.min(text.length, idx + 300)).trim();
        riskClauses.push({
          type: def.type,
          clause: def.label,
          excerpt: excerpt.slice(0, 400),
          severity: def.severity,
        });
        break;
      }
    }
  }

  // Obligations — "X shall ..." sentences
  const obligations: string[] = [];
  const obligReBase = /\b([A-Z][A-Za-z\s]{2,40})\s+shall\s+([^.\n]{10,300})\./;
  const obligSeen = new Set<string>();
  const obligRe = new RegExp(obligReBase.source, 'g');
  while ((match = obligRe.exec(text)) !== null && obligations.length < 20) {
    const sentence = `${match[1].trim()} shall ${match[2].trim()}.`;
    if (!obligSeen.has(sentence.toLowerCase()) && sentence.length > 20) {
      obligSeen.add(sentence.toLowerCase());
      obligations.push(sentence.slice(0, 350));
    }
  }

  const details: ContractDetails = {
    parties,
    definedTerms,
    effectiveDate,
    terminationDate,
    sections,
    riskClauses,
    obligations,
  };

  // ─── Field groups ─────────────────────────────────────────────────────────
  const headerGroup: FieldGroup = {
    id: "header",
    title: "Contract Header",
    fields: [
      f("parties", "Parties", parties.length ? parties.join(" / ") : null, "high"),
      f("effectiveDate", "Effective date", effectiveDate, "high"),
      f("terminationDate", "Termination date", terminationDate, "medium"),
      f("sectionsCount", "Sections detected", `${sections.length}`, "high"),
      f("definedTermsCount", "Defined terms", `${definedTerms.length}`, "high"),
    ],
  };

  // ─── Tables ───────────────────────────────────────────────────────────────
  const sectionsTable: ExtractedTable = {
    id: "sections",
    title: "Section Outline",
    description: `${sections.length} section(s) detected`,
    columns: [
      { id: "number", label: "#", type: "text", sortable: true },
      { id: "title", label: "Title", type: "text" },
    ],
    rows: sections.map((s) => ({ number: s.number ?? "", title: s.title })),
  };

  const riskTable: ExtractedTable = {
    id: "risks",
    title: "Risk Clauses",
    description: `${riskClauses.length} flagged clause(s)`,
    columns: [
      { id: "clause", label: "Clause", type: "tag", sortable: true },
      { id: "severity", label: "Severity", type: "tag", sortable: true },
      { id: "excerpt", label: "Excerpt", type: "text" },
    ],
    rows: riskClauses.map((r) => ({
      clause: r.clause,
      severity: r.severity,
      excerpt: r.excerpt,
    })),
  };

  const definedTermsTable: ExtractedTable = {
    id: "definedTerms",
    title: "Defined Terms",
    description: `${definedTerms.length} term(s)`,
    columns: [
      { id: "term", label: "Term", type: "text", sortable: true },
      { id: "definition", label: "Definition", type: "text" },
    ],
    rows: definedTerms.map((t) => ({ term: t.term, definition: t.definition })),
  };

  const obligationsTable: ExtractedTable = {
    id: "obligations",
    title: "Obligations",
    description: `${obligations.length} obligation(s) detected`,
    columns: [{ id: "obligation", label: "Obligation", type: "text" }],
    rows: obligations.map((o, i) => ({ obligation: o })),
  };

  // ─── Insights ─────────────────────────────────────────────────────────────
  const insights: Insight[] = [];

  const highRisk = riskClauses.filter((r) => r.severity === "warning");
  const notices = riskClauses.filter((r) => r.severity === "notice");

  if (highRisk.length > 0) {
    insights.push({
      id: "high-risk-clauses",
      title: `${highRisk.length} high-risk clause(s) detected`,
      body: `Flagged: ${highRisk.map((r) => r.clause).join(", ")}. Review these carefully — they typically limit one party's flexibility or exposure.`,
      severity: "warning",
      category: "Risk assessment",
    });
  }

  for (const clause of riskClauses) {
    if (clause.severity !== "warning" && clause.severity !== "notice") continue;
    insights.push({
      id: `clause-${clause.type}`,
      title: `${clause.clause} clause detected`,
      body: clause.excerpt.slice(0, 200) + (clause.excerpt.length > 200 ? "…" : ""),
      severity: clause.severity,
      category: "Risk clauses",
    });
  }

  if (parties.length < 2) {
    insights.push({
      id: "missing-parties",
      title: "Could not identify both contracting parties",
      body: "Doclyze expected to find at least two named parties. The contract may use unusual phrasing — review manually.",
      severity: "warning",
      category: "Parties",
    });
  }

  if (!effectiveDate) {
    insights.push({
      id: "no-effective-date",
      title: "No effective date detected",
      body: "An effective date is critical for establishing when obligations begin.",
      severity: "notice",
      category: "Dates",
    });
  }

  if (sections.length === 0) {
    insights.push({
      id: "no-sections",
      title: "No numbered sections detected",
      body: "The document doesn't follow the typical 'Section X. Title' structure. It may be a memo or letter rather than a formal contract.",
      severity: "info",
      category: "Structure",
    });
  }

  if (definedTerms.length >= 5) {
    insights.push({
      id: "defined-terms-density",
      title: `${definedTerms.length} defined terms — dense contract`,
      body: "A high count of defined terms suggests a complex contract. Cross-reference definitions when interpreting obligations.",
      severity: "info",
      category: "Complexity",
    });
  }

  const expected = [
    parties.length >= 2 ? "parties" : null,
    effectiveDate,
    sections.length > 0 ? "sections" : null,
    definedTerms.length > 0 ? "definedTerms" : null,
    riskClauses.length > 0 ? "risks" : null,
    obligations.length > 0 ? "obligations" : null,
  ];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  return {
    details,
    fieldGroups: [headerGroup],
    tables: [sectionsTable, riskTable, definedTermsTable, obligationsTable],
    insights,
    completeness,
  };
}

function f(
  key: string,
  label: string,
  value: string | null,
  confidence: "high" | "medium" | "low"
): ExtractedField {
  return { key, label, value, confidence };
}
