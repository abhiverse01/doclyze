/**
 * Resume extractor — the most depth in the pipeline.
 *
 * Real parsing logic: regex patterns + section detection + proximity heuristics
 * + a maintained skill-keyword dictionary for categorized skill buckets.
 * No LLM, no mocked data.
 */

import {
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  Insight,
  ResumeDetails,
  Severity,
} from "../types";
import { cleanExtractedSpan, cleanExtractedSpans } from "../clean-span";

// ─── Patterns ────────────────────────────────────────────────────────────────
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_RE =
  /(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/;
// v6: URL regex that stops at common trailing punctuation
const URL_RE_BASE = /(https?:\/\/[^\s"'`\)\]}>;,]+)|(?:www\.)?([a-z0-9-]+\.)+(com|io|me|dev|ai|net|org|app)(\/[^\s"'`\)\]}>;,]*)?/i;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub|company)\/[a-z0-9-]+/i;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-z0-9-]+/i;

// Date parsing — handles "Jan 2020", "January 2020", "01/2020", "2020-01", "2020-03", "2020"
const MONTH_RE =
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\.?/i;
const DATE_RANGE_RE_BASE = new RegExp(
  `((?:${MONTH_RE.source}|\\d{4}[/-]\\d{1,2}|\\d{1,2}[/-]\\d{1,4}|\\d{4}))\\s*(?:–|-|to|—|until)\\s*((?:${MONTH_RE.source}|\\d{4}[/-]\\d{1,2}|\\d{1,2}[/-]\\d{1,4}|\\d{4})|present|current|now)`,
  "i"
);

// ─── Skill dictionary ────────────────────────────────────────────────────────
const SKILL_DICTIONARY = {
  languages: [
    "JavaScript", "TypeScript", "Python", "Java", "C", "C++", "C#", "Go", "Rust",
    "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R", "MATLAB", "Perl", "Elixir",
    "Clojure", "Haskell", "Lua", "Dart", "Objective-C", "Shell", "Bash", "SQL",
    "HTML", "CSS", "Solidity",
  ],
  frameworks: [
    "React", "Next.js", "Vue", "Angular", "Svelte", "Node.js", "Express",
    "NestJS", "Django", "Flask", "FastAPI", "Spring", "Spring Boot", "Rails",
    "Laravel", "Symfony", ".NET", "ASP.NET", "Ember", "Gatsby", "Remix",
    "Tailwind", "Bootstrap", "Material UI", "shadcn", "Redux", "Zustand",
    "GraphQL", "Apollo", "tRPC", "Prisma", "Drizzle", "Sequelize", "TypeORM",
    "PyTorch", "TensorFlow", "Keras", "scikit-learn", "Pandas", "NumPy",
  ],
  tools: [
    "Git", "GitHub", "GitLab", "Bitbucket", "Docker", "Kubernetes", "Terraform",
    "Ansible", "Jenkins", "CircleCI", "GitHub Actions", "AWS", "GCP", "Azure",
    "Vercel", "Netlify", "Heroku", "Cloudflare", "Linux", "Unix", "Nginx",
    "Apache", "Redis", "PostgreSQL", "MySQL", "MongoDB", "SQLite", "Cassandra",
    "Kafka", "RabbitMQ", "Elasticsearch", "Datadog", "Grafana", "Prometheus",
    "Sentry", "Stripe", "Twilio", "Figma", "Sketch", "Jira", "Confluence",
    "Notion", "Slack", "VS Code", "Vim", "Emacs",
  ],
  soft: [
    "leadership", "communication", "collaboration", "teamwork", "mentoring",
    "mentoring", "public speaking", "writing", "problem solving", "critical thinking",
    "time management", "project management", "agile", "scrum", "kanban",
    "stakeholder management", "cross-functional", "ownership", "initiative",
    "adaptability", "creativity", "negotiation", "presentation",
  ],
};

// ─── Section detection ───────────────────────────────────────────────────────
const SECTION_HEADERS: Record<string, string[]> = {
  summary: ["summary", "professional summary", "profile", "objective", "about me", "about"],
  experience: [
    "experience", "work experience", "professional experience", "employment",
    "employment history", "work history", "career history", "professional background",
  ],
  education: ["education", "academic background", "academics"],
  skills: ["skills", "technical skills", "core skills", "competencies", "technologies"],
  certifications: ["certifications", "certificates", "licenses", "credentials"],
  projects: ["projects", "personal projects", "side projects", "selected projects"],
  publications: ["publications", "papers", "research"],
};

interface SectionRange {
  name: string;
  start: number;
  end: number;
}

function detectSections(text: string): SectionRange[] {
  const lines = text.split(/\n/);
  const sections: SectionRange[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim().toLowerCase().replace(/[:•\-—]+$/, "").trim();
    if (!line || line.length > 60) continue;
    for (const [name, variants] of Object.entries(SECTION_HEADERS)) {
      if (variants.includes(line)) {
        sections.push({ name, start: i, end: lines.length });
        // Close the previous section
        if (sections.length > 1) {
          sections[sections.length - 2].end = i;
        }
        break;
      }
    }
  }
  return sections;
}

function getSectionText(text: string, sections: SectionRange[], name: string): string {
  const s = sections.find((x) => x.name === name);
  if (!s) return "";
  return text
    .split(/\n/)
    .slice(s.start + 1, s.end)
    .join("\n")
    .trim();
}

// ─── Date parsing ────────────────────────────────────────────────────────────
const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function parseMonthYear(s: string): { year: number; month: number } | null {
  if (!s) return null;
  const lower = s.toLowerCase().trim();
  // Handle present/current/ongoing
  if (/^(present|current|ongoing|now)$/.test(lower)) return null;
  // Quarter notation: Q1 2023
  const qMatch = lower.match(/^q([1-4])\s+(\d{4})$/);
  if (qMatch) {
    return { year: parseInt(qMatch[2], 10), month: (parseInt(qMatch[1]) - 1) * 3 + 1 };
  }
  // "Jan 2020" / "January 2020"
  const m1 = lower.match(/^([a-z]{3,9})\.?\s+(\d{4})$/);
  if (m1) {
    const mon = MONTH_MAP[m1[1].slice(0, 3)];
    if (mon) return { year: parseInt(m1[2], 10), month: mon };
  }
  // "01/2020" or "1/2020"
  const m2 = lower.match(/^(\d{1,2})[/-](\d{4})$/);
  if (m2) return { year: parseInt(m2[2], 10), month: parseInt(m2[1], 10) };
  // "2020-01" / "2023-06"
  const m3 = lower.match(/^(\d{4})-(\d{1,2})$/);
  if (m3) return { year: parseInt(m3[1], 10), month: parseInt(m3[2], 10) };
  // "2020" alone
  const m4 = lower.match(/^(\d{4})$/);
  if (m4) return { year: parseInt(m4[1], 10), month: 1 };
  return null;
}

function normalizeDate(s: string | null): string | null {
  if (!s) return null;
  const parsed = parseMonthYear(s);
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
}

function monthsBetween(start: { year: number; month: number }, end: { year: number; month: number }): number {
  return (end.year - start.year) * 12 + (end.month - start.month) + 1;
}

// ─── Main extractor ──────────────────────────────────────────────────────────

export function extractResume(text: string, filename: string): {
  details: ResumeDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  const sections = detectSections(text);
  const fullText = text;

  // Contact info — name is the first non-empty line typically
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  let name: string | null = null;
  // Find a line that looks like a name (1-4 words, mostly capital letters, no digits, no @)
  for (const line of lines.slice(0, 8)) {
    if (EMAIL_RE.test(line) || /\d/.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 1 && words.length <= 5) {
      const capitalized = words.filter((w) => /^[A-Z][a-zA-Z'\-]+$/.test(w));
      if (capitalized.length === words.length) {
        name = line.replace(/[|•·]+/g, "").trim();
        break;
      }
    }
  }

  const emailMatch = fullText.match(EMAIL_RE);
  const emailRaw = emailMatch?.[0] ?? null;
  const email = emailRaw ? cleanExtractedSpan(emailRaw) : null;
  const phoneMatch = fullText.match(PHONE_RE);
  const linkedin = fullText.match(LINKEDIN_RE);
  const github = fullText.match(GITHUB_RE);
  // Find URLs but exclude ones that are part of an email address
  const emailStr = emailRaw ?? "";
  const otherUrls = Array.from(fullText.matchAll(new RegExp(URL_RE_BASE.source, 'gi')))
    .map((m) => cleanExtractedSpan(m[0]))
    .filter((u) => {
      // Skip if this URL is a substring of the email
      if (emailStr && emailStr.includes(u)) return false;
      // Skip if it looks like just a bare domain (no path) that came from an email
      if (!u.includes("/") && !u.startsWith("http") && emailStr.endsWith(u)) return false;
      // Skip linkedin / github (already captured)
      if (linkedin?.[0]?.includes(u)) return false;
      if (github?.[0]?.includes(u)) return false;
      return true;
    })
    .slice(0, 3);

  // Location — single-line city, state pattern. Use a non-greedy match
  // that doesn't cross newlines, to avoid pulling in the name from the line above.
  let location: string | null = null;
  const locMatch = fullText.match(/^[A-Z][a-zA-Z .]+,\s*[A-Z]{2}\b/m);
  if (locMatch) {
    location = locMatch[0].trim();
  } else {
    // Fallback: "City, Country" on a single line
    const loc2 = fullText.match(/^[A-Z][a-zA-Z .]+,\s*[A-Z][a-zA-Z]+$/m);
    if (loc2) location = loc2[0].trim();
  }

  // Summary
  const summary = getSectionText(text, sections, "summary") || null;

  // Experience
  const experienceText = getSectionText(text, sections, "experience");
  const experience = parseExperience(experienceText);

  // Education
  const educationText = getSectionText(text, sections, "education");
  const education = parseEducation(educationText);

  // Skills
  const skillsText = getSectionText(text, sections, "skills") || fullText;
  const skills = categorizeSkills(skillsText);

  // Certifications
  const certText = getSectionText(text, sections, "certifications");
  const certifications = certText
    .split(/\n/)
    .map((l) => l.trim().replace(/^[•\-*]\s*/, ""))
    .filter((l) => l.length > 3 && l.length < 200)
    .slice(0, 15);

  // Projects
  const projectsText = getSectionText(text, sections, "projects");
  const projects = parseProjects(projectsText);

  // Publications
  const pubText = getSectionText(text, sections, "publications");
  const publications = pubText
    .split(/\n/)
    .map((l) => l.trim().replace(/^[•\-*]\s*/, ""))
    .filter((l) => l.length > 10)
    .slice(0, 10);

  // Derived metrics
  const derived = computeDerived(experience, skills);

  const details: ResumeDetails = {
    contact: {
      name,
      email: emailMatch?.[0] ?? null,
      phone: phoneMatch?.[0] ?? null,
      location,
      links: [
        ...(linkedin ? [{ label: "LinkedIn", url: linkedin[0] }] : []),
        ...(github ? [{ label: "GitHub", url: github[0] }] : []),
        ...otherUrls.map((u) => ({ label: "Portfolio", url: u })),
      ],
    },
    summary,
    experience,
    education,
    skills,
    certifications,
    projects,
    publications,
    derived,
  };

  // ─── Field groups for the Presentor ───────────────────────────────────────
  const contactGroup: FieldGroup = {
    id: "contact",
    title: "Contact",
    fields: [
      field("name", "Name", details.contact.name, "high"),
      field("email", "Email", details.contact.email, "high"),
      field("phone", "Phone", details.contact.phone, "high"),
      field("location", "Location", details.contact.location, "medium"),
      field(
        "links",
        "Links",
        details.contact.links.length
          ? details.contact.links.map((l) => `${l.label}: ${l.url}`).join("\n")
          : null,
        "high"
      ),
    ],
  };

  const summaryGroup: FieldGroup = {
    id: "summary",
    title: "Summary",
    fields: [field("summary", "Summary", summary, "medium")],
  };

  const derivedGroup: FieldGroup = {
    id: "derived",
    title: "Computed Metrics",
    fields: [
      field(
        "totalYears",
        "Total years of experience",
        derived.totalYearsExperience !== null
          ? `${derived.totalYearsExperience} years`
          : null,
        "high",
        "Computed from date ranges — not the candidate's claim"
      ),
      field(
        "gaps",
        "Employment gaps detected",
        derived.gaps.length
          ? derived.gaps.map((g) => `${g.from} → ${g.to} (${g.months} mo)`).join("\n")
          : "None detected",
        "high"
      ),
      field(
        "atsCoverage",
        "ATS keyword coverage",
        `${derived.atsKeywordCoverage.filter((k) => k.hit).length}/${derived.atsKeywordCoverage.length} categories`,
        "medium"
      ),
    ],
  };

  // ─── Tables ───────────────────────────────────────────────────────────────
  const experienceTable: ExtractedTable = {
    id: "experience",
    title: "Work Experience",
    description: `${experience.length} role(s)`,
    columns: [
      { id: "company", label: "Company", type: "text", sortable: true },
      { id: "title", label: "Title", type: "text" },
      { id: "startDate", label: "Start", type: "date", sortable: true },
      { id: "endDate", label: "End", type: "date", sortable: true },
      { id: "durationMonths", label: "Duration (mo)", type: "number", sortable: true },
      { id: "bullets", label: "Highlights", type: "text" },
    ],
    rows: experience.map((e) => ({
      company: e.company,
      title: e.title,
      startDate: e.startDate ?? "",
      endDate: e.isCurrent ? "Present" : e.endDate ?? "",
      durationMonths: e.durationMonths ?? "",
      bullets: e.bullets.join(" • "),
    })),
    cellConfidence: {},
  };

  const educationTable: ExtractedTable = {
    id: "education",
    title: "Education",
    columns: [
      { id: "institution", label: "Institution", type: "text" },
      { id: "degree", label: "Degree", type: "text" },
      { id: "field", label: "Field", type: "text" },
      { id: "graduationDate", label: "Graduation", type: "date", sortable: true },
    ],
    rows: education.map((e) => ({
      institution: e.institution,
      degree: e.degree ?? "",
      field: e.field ?? "",
      graduationDate: e.graduationDate ?? "",
    })),
  };

  const skillsTable: ExtractedTable = {
    id: "skills",
    title: "Skills (categorized)",
    columns: [
      { id: "category", label: "Category", type: "tag", sortable: true },
      { id: "items", label: "Items", type: "text" },
      { id: "count", label: "Count", type: "number", sortable: true },
    ],
    rows: Object.entries(skills)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => ({
        category: k.charAt(0).toUpperCase() + k.slice(1),
        items: v.join(", "),
        count: v.length,
      })),
  };

  // ─── Insights ─────────────────────────────────────────────────────────────
  const insights: Insight[] = [];

  if (!details.contact.email && !details.contact.phone) {
    insights.push({
      id: "no-contact",
      title: "No contact information detected",
      body: "Doclyze could not find an email or phone number in the first 8 lines. ATS systems require this — consider placing it near the top.",
      severity: "warning",
      category: "Contact",
    });
  }

  if (derived.gaps.length > 0) {
    for (const g of derived.gaps) {
      insights.push({
        id: `gap-${g.from}-${g.to}`,
        title: `${g.months}-month gap between ${g.from} and ${g.to}`,
        body: `Detected an employment gap of approximately ${g.months} month(s). Be prepared to address this in interviews.`,
        severity: g.months >= 6 ? "notice" : "info",
        category: "Career progression",
      });
    }
  }

  if (derived.totalYearsExperience !== null) {
    const expYears = derived.totalYearsExperience;
    if (expYears < 2 && experience.length >= 1) {
      insights.push({
        id: "early-career",
        title: `${expYears} year(s) of experience detected`,
        body: "Early-career candidate. Highlight projects, internships, and certifications to compensate.",
        severity: "info",
        category: "Experience level",
      });
    } else if (expYears >= 10) {
      insights.push({
        id: "senior",
        title: `${expYears}+ years of experience detected`,
        body: "Senior candidate. Ensure leadership and impact metrics are quantified in bullets.",
        severity: "info",
        category: "Experience level",
      });
    }
  }

  const atsMisses = derived.atsKeywordCoverage.filter((k) => !k.hit);
  if (atsMisses.length > 0) {
    insights.push({
      id: "ats-gaps",
      title: `Missing ATS keyword categories: ${atsMisses.map((k) => k.category).join(", ")}`,
      body: "Some common ATS keyword categories weren't detected. Tailoring the resume to include relevant terms from these categories can improve match rates.",
      severity: "notice",
      category: "ATS optimization",
    });
  }

  if (experience.length > 0 && experience.every((e) => e.bullets.length === 0)) {
    insights.push({
      id: "no-bullets",
      title: "No responsibility bullets detected",
      body: "Experience entries have no clear bullet points. Add 3-6 quantified accomplishments per role.",
      severity: "warning",
      category: "Content quality",
    });
  }

  // ─── Completeness ─────────────────────────────────────────────────────────
  const expectedFields = [
    details.contact.name,
    details.contact.email,
    details.contact.phone,
    details.contact.location,
    details.contact.links.length > 0 ? "links" : null,
    details.summary,
    details.experience.length > 0 ? "experience" : null,
    details.education.length > 0 ? "education" : null,
    Object.values(details.skills).some((arr) => arr.length > 0) ? "skills" : null,
    details.certifications.length > 0 ? "certs" : null,
  ];
  const found = expectedFields.filter(Boolean).length;
  const completeness = Math.round((found / expectedFields.length) * 100);

  return {
    details,
    fieldGroups: [contactGroup, summaryGroup, derivedGroup],
    tables: [experienceTable, educationTable, skillsTable],
    insights,
    completeness,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function field(
  key: string,
  label: string,
  value: string | null,
  confidence: "high" | "medium" | "low",
  provenance?: string
): ExtractedField {
  return { key, label, value, confidence, provenance };
}

function parseExperience(text: string): ResumeDetails["experience"] {
  if (!text.trim()) return [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const entries: ResumeDetails["experience"] = [];
  let current: ResumeDetails["experience"][number] | null = null;

  for (const line of lines) {
    // Try date range on this line
    const dateMatch = [...line.matchAll(new RegExp(DATE_RANGE_RE_BASE.source, 'g'))][0];
    if (dateMatch) {
      const startDate = normalizeDate(dateMatch[1]);
      const isCurrent = /present|current|now/i.test(dateMatch[2]);
      const endDate = isCurrent ? null : normalizeDate(dateMatch[2]);

      // The line probably has "Title - Company | Date Range" or "Company | Title | Date Range"
      const withoutDates = line.replace(dateMatch[0], "").replace(/[|•·,]+$/, "").trim();
      const parts = withoutDates.split(/[|•·,@\-—–]+/).map((s) => s.trim()).filter(Boolean);

      let company = "";
      let title = "";
      if (parts.length >= 2) {
        // Heuristic: the longer part is more likely the company; the shorter the title.
        // But by convention, "Title — Company" is more common at the top of an entry.
        title = parts[0];
        company = parts.slice(1).join(", ");
      } else if (parts.length === 1) {
        company = parts[0];
      }

      // Compute duration
      let durationMonths: number | null = null;
      if (startDate) {
        const endParsed = isCurrent
          ? { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
          : parseMonthYear(dateMatch[2]);
        if (endParsed) {
          durationMonths = monthsBetween(parseMonthYear(dateMatch[1])!, endParsed);
        }
      }

      current = {
        company: company || "(unknown)",
        title: title || "(unknown)",
        startDate,
        endDate,
        isCurrent,
        durationMonths,
        bullets: [],
      };
      entries.push(current);
      continue;
    }

    // Bullet line
    if (/^[•\-*●▪◦]\s+/.test(line) || /^[A-Z].*\d/.test(line)) {
      if (current) {
        current.bullets.push(line.replace(/^[•\-*●▪◦]\s+/, ""));
      }
    } else if (current && !current.company.includes(line) && line.length < 200) {
      // Could be additional context — append as a bullet if it looks like one
      if (/\d/.test(line) || /(led|built|launched|improved|reduced|increased|managed|created|designed|implemented|shipped)/i.test(line)) {
        current.bullets.push(line);
      }
    }
  }

  return entries;
}

function parseEducation(text: string): ResumeDetails["education"] {
  if (!text.trim()) return [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const entries: ResumeDetails["education"] = [];
  for (const line of lines) {
    // Skip bullet lines that aren't real education entries
    if (/^[•\-*]/.test(line) && !/\b(19|20)\d{2}\b/.test(line) && !/bachelor|master|ph\.?d|degree|diploma/i.test(line)) {
      continue;
    }

    // Try to extract a year
    const yearMatch = line.match(/\b(19|20)\d{2}\b/);
    const graduationDate = yearMatch ? normalizeDate(yearMatch[0]) : null;

    // Try degree pattern
    const degreeMatch = line.match(/\b(B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|M\.?B\.?A\.?|Ph\.?D\.?|Associate'?s?|Diploma|Certificate|Bachelor|Master|Doctorate)\b/i);
    const degree = degreeMatch ? degreeMatch[0] : null;

    // Institution heuristic — prefer chunks containing university/college/institute/school
    const parts = line.split(/[|,]/).map((s) => s.trim());
    let institution: string | null = null;
    for (const part of parts) {
      if (/university|college|institute|school|academy|polytechnic/i.test(part)) {
        institution = part.replace(/\b(19|20)\d{2}\b.*$/, "").trim();
        break;
      }
    }
    // Fallback: longest part that isn't the degree
    if (!institution) {
      const candidates = parts
        .filter((p) => !degreeMatch || !p.includes(degreeMatch[0]))
        .filter((p) => p.length > 3)
        .sort((a, b) => b.length - a.length);
      institution = candidates[0]?.replace(/\b(19|20)\d{2}\b.*$/, "").trim() || line;
    }

    // Field — between degree and year, if any
    let field: string | null = null;
    if (degreeMatch) {
      const afterDegree = line.slice(degreeMatch.index! + degreeMatch[0].length);
      const fieldMatch = afterDegree.match(/(?:in|of)\s+([A-Z][a-zA-Z\s&]+?)(?:[,|]|\d|$)/);
      field = fieldMatch ? fieldMatch[1].trim() : null;
    }

    entries.push({
      institution: institution || "(unknown)",
      degree,
      field,
      graduationDate,
    });
  }
  return entries.slice(0, 8);
}

function categorizeSkills(text: string): ResumeDetails["skills"] {
  const result: ResumeDetails["skills"] = {
    languages: [],
    frameworks: [],
    tools: [],
    soft: [],
    other: [],
  };
  const seen = new Set<string>();
  const lower = text.toLowerCase();
  for (const [category, list] of Object.entries(SKILL_DICTIONARY)) {
    for (const skill of list) {
      const re = new RegExp(`\\b${escapeRegex(skill.toLowerCase())}\\b`, "i");
      if (re.test(lower) && !seen.has(skill.toLowerCase())) {
        (result[category as keyof typeof result]).push(skill);
        seen.add(skill.toLowerCase());
      }
    }
  }
  // Other — extract skill-like tokens that aren't in the dictionary
  // Look for "Skills: X, Y, Z" patterns
  const skillsLine = text.match(/skills?:?\s*([^\n]+)/i);
  if (skillsLine) {
    const tokens = skillsLine[1]
      .split(/[,;•|]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1 && t.length < 40);
    for (const t of tokens) {
      if (!seen.has(t.toLowerCase())) {
        result.other.push(t);
        seen.add(t.toLowerCase());
      }
    }
  }
  return result;
}

function parseProjects(text: string): ResumeDetails["projects"] {
  if (!text.trim()) return [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const projects: ResumeDetails["projects"] = [];
  let current: ResumeDetails["projects"][number] | null = null;
  for (const line of lines) {
    // Project name pattern — short, capitalized, possibly with " — description"
    if (line.length < 80 && /^[A-Z]/.test(line) && !/^[•\-*]/.test(line)) {
      const [name, ...rest] = line.split(/[—–:\-|]/);
      current = {
        name: name.trim(),
        description: rest.join(" ").trim() || "",
      };
      projects.push(current);
    } else if (current) {
      current.description = current.description
        ? `${current.description} ${line}`
        : line;
    }
  }
  return projects.slice(0, 10);
}

function computeDerived(
  experience: ResumeDetails["experience"],
  skills: ResumeDetails["skills"]
): ResumeDetails["derived"] {
  // Total years
  let totalMonths = 0;
  for (const e of experience) {
    if (e.durationMonths && e.durationMonths > 0) {
      totalMonths += e.durationMonths;
    }
  }
  const totalYearsExperience = totalMonths > 0 ? Math.round((totalMonths / 12) * 10) / 10 : null;

  // Gaps
  const gaps: ResumeDetails["derived"]["gaps"] = [];
  const sorted = [...experience]
    .filter((e) => e.startDate)
    .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1));
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (!curr.endDate || curr.isCurrent) continue;
    const currEnd = parseMonthYear(curr.endDate);
    const nextStart = parseMonthYear(next.startDate!);
    if (currEnd && nextStart) {
      const gap = monthsBetween(currEnd, nextStart) - 1;
      if (gap > 1) {
        gaps.push({
          from: curr.endDate,
          to: next.startDate!,
          months: gap,
        });
      }
    }
  }

  // ATS keyword coverage
  const atsKeywordCoverage = [
    { category: "Leadership", hit: skills.soft.some((s) => /leadership|mentor|manage/i.test(s)) },
    { category: "Cloud", hit: skills.tools.some((s) => /aws|gcp|azure|cloudflare|vercel/i.test(s)) },
    { category: "Database", hit: skills.tools.some((s) => /sql|postgres|mongo|redis|dynamo/i.test(s)) },
    { category: "CI/CD", hit: skills.tools.some((s) => /jenkins|circle|github action|docker|kubernetes/i.test(s)) },
    { category: "Frontend framework", hit: skills.frameworks.some((s) => /react|vue|angular|svelte|next/i.test(s)) },
    { category: "Backend framework", hit: skills.frameworks.some((s) => /express|django|flask|spring|rails|nest/i.test(s)) },
  ];

  return { totalYearsExperience, gaps, atsKeywordCoverage };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
