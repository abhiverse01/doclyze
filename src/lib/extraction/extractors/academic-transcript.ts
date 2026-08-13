/**
 * Academic Transcript extractor — student info, GPA, courses, terms, Dean's list.
 * Pure regex + structural heuristics, no ML.
 */

import {
  AcademicTranscriptDetails,
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  Insight,
} from "../types";

const DATE_RE_BASE =
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})\b/;

/** Term/semester name patterns */
const TERM_RE_BASE = /(?:fall|spring|summer|winter)\s*(?:semester)?\s*(\d{4})/i;

/** GPA pattern — matches "3.45/4.0", "3.87", "GPA: 3.5" */
const GPA_RE = /(?:cumulative|overall|major)?\s*gpa[:\s]*([\d.]+)(?:\s*[\/]\s*([\d.]+))?/i;

/** Course line pattern — e.g., "CS 101 Introduction to CS 3.0 A" */
const COURSE_LINE_RE = /^\s*([A-Z]{2,4}\s*\d{3,4}[A-Z]?)\s+(.{2,80}?)\s+(\d+(?:\.\d+)?)\s+([ABCDF][+-]?|P|NP|W|I)\s*$/gm;

/** Dean's list pattern */
const DEANS_LIST_RE = /dean'?s\s*list/i;

/** Credits pattern */
const CREDITS_RE = /(?:total|cumulative)\s*credits?\s*(?:earned|completed)?[:\s]*([\d.]+)/i;

/** Degree program pattern */
const DEGREE_RE = /\b(?:bachelor|master|doctor|associate|b\.s\.|b\.a\.|m\.s\.|m\.a\.|ph\.d\.|b\.tech|m\.tech|bsc|msc)\b[^.\n]{0,60}/i;

function f(
  key: string,
  label: string,
  value: string | null,
  confidence: "high" | "medium" | "low",
  provenance?: string
): ExtractedField {
  return { key, label, value, confidence, provenance };
}

export function extractAcademicTranscript(text: string, filename: string): {
  details: AcademicTranscriptDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  // ─── Student name ──────────────────────────────────────────────────────────
  // Usually the first prominent line or after "Student:" / "Name:"
  const nameMatch =
    text.match(/(?:student|name)[:\s]*\n?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i) ??
    text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/m);
  const studentName = nameMatch?.[1]?.trim() ?? null;

  // ─── Institution ────────────────────────────────────────────────────────────
  const institutionMatch =
    text.match(/(?:university|college|institute|school)\s+(?:of|at)?\s+([A-Z][A-Za-z\s,.'-]{3,80})/i) ??
    text.match(/([A-Z][A-Za-z\s,.'-]{5,60}(?:University|College|Institute|School|Polytechnic))/);
  const institution = institutionMatch?.[1]?.trim() ?? null;

  // ─── Degree program ────────────────────────────────────────────────────────
  const degreeMatch = text.match(DEGREE_RE);
  const degreeProgram = degreeMatch?.[0]?.trim() ?? null;

  // ─── GPA ───────────────────────────────────────────────────────────────────
  const overallGPA: number | null = (() => {
    // Try to find "cumulative" or "overall" GPA
    const cumMatch = text.match(/(?:cumulative|overall)\s*gpa[:\s]*([\d.]+)/i);
    if (cumMatch) return parseFloat(cumMatch[1]) || null;
    // Fallback: any GPA
    const gpaMatch = text.match(GPA_RE);
    if (gpaMatch) return parseFloat(gpaMatch[1]) || null;
    return null;
  })();

  const majorGPA: number | null = (() => {
    const majorMatch = text.match(/major\s*gpa[:\s]*([\d.]+)/i);
    if (majorMatch) return parseFloat(majorMatch[1]) || null;
    return null;
  })();

  const gpaScale: number | null = (() => {
    const scaleMatch = text.match(GPA_RE);
    if (scaleMatch?.[2]) return parseFloat(scaleMatch[2]) || null;
    if (overallGPA) return 4.0; // common default
    return null;
  })();

  // ─── Terms / Semesters ────────────────────────────────────────────────────
  const terms: AcademicTranscriptDetails["terms"] = [];
  const termMatches = Array.from(new RegExp(TERM_RE_BASE.source, "gi").execAllNonNull(text));

  // Also try "Semester X" pattern
  const semesterNumRe = /semester\s+(\d+)/gi;
  let semMatch;
  while ((semMatch = semesterNumRe.exec(text)) !== null) {
    if (!termMatches.some((t) => Math.abs(t.index - semMatch.index) < 50)) {
      termMatches.push({ index: semMatch.index, match: `Semester ${semMatch[1]}` });
    }
  }

  // Parse courses per term
  for (let i = 0; i < termMatches.length; i++) {
    const tm = termMatches[i];
    const nextTermStart = i + 1 < termMatches.length ? termMatches[i + 1].index : text.length;
    const section = text.slice(tm.index, nextTermStart);

    const courses: AcademicTranscriptDetails["terms"][0]["courses"] = [];
    const courseRe = new RegExp(COURSE_LINE_RE.source, "gm");
    let courseMatch;
    while ((courseMatch = courseRe.exec(section)) !== null) {
      courses.push({
        code: courseMatch[1]?.trim() ?? null,
        title: courseMatch[2]?.trim() ?? null,
        credits: parseFloat(courseMatch[3]) || null,
        grade: courseMatch[4]?.trim() ?? null,
      });
    }

    // Also try a looser course pattern if the strict one finds nothing
    if (courses.length === 0) {
      const looseRe = /^\s*([A-Z]{2,4}\s*\d{3,4}[A-Z]?)\s+(.{2,80})/gm;
      let looseMatch;
      while ((looseMatch = looseRe.exec(section)) !== null && courses.length < 30) {
        courses.push({
          code: looseMatch[1]?.trim() ?? null,
          title: looseMatch[2]?.trim().slice(0, 80) ?? null,
          credits: null,
          grade: null,
        });
      }
    }

    const yearMatch = tm.match.match(/(\d{4})/);
    terms.push({
      name: tm.match.replace(/\d{4}/, "").trim(),
      year: yearMatch?.[1] ?? null,
      courses: courses.slice(0, 40),
    });
  }

  // ─── Total credits ─────────────────────────────────────────────────────────
  const creditsMatch = text.match(CREDITS_RE);
  const totalCreditsEarned = creditsMatch ? parseFloat(creditsMatch[1]) || null : null;

  // ─── Dean's list mentions ──────────────────────────────────────────────────
  const deansList: string[] = [];
  const dlRe = new RegExp(DEANS_LIST_RE.source, "gi");
  let dlMatch;
  while ((dlMatch = dlRe.exec(text)) !== null) {
    // Try to get the semester context
    const before = text.slice(Math.max(0, dlMatch.index - 100), dlMatch.index);
    const contextTerm = before.match(/(?:fall|spring|summer|winter)\s*(?:semester)?\s*(\d{4})/i);
    const label = contextTerm
      ? `Dean's List — ${contextTerm[0].trim()}`
      : `Dean's List`;
    if (!deansList.includes(label)) {
      deansList.push(label);
    }
  }

  // ─── Graduation date ──────────────────────────────────────────────────────
  const gradDateMatch =
    text.match(/(?:graduation|degree\s*(?:conferred|awarded|granted)|date\s*(?:of|awarded))[:\s]*([A-Za-z0-9 ,/\-]+)/i) ??
    text.match(/(?:expected|anticipated)\s*graduation[:\s]*([A-Za-z0-9 ,/\-]+)/i);
  const graduationDate = gradDateMatch?.[1]?.trim().split(/\n/)[0] ?? null;

  const details: AcademicTranscriptDetails = {
    studentName,
    institution,
    degreeProgram,
    overallGPA,
    majorGPA,
    gpaScale,
    terms,
    totalCreditsEarned,
    deansList,
    graduationDate,
  };

  // ─── Field groups ─────────────────────────────────────────────────────────
  const headerGroup: FieldGroup = {
    id: "header",
    title: "Student Information",
    fields: [
      f("studentName", "Student name", studentName, "medium"),
      f("institution", "Institution", institution, "high"),
      f("degreeProgram", "Degree program", degreeProgram, "medium"),
      f("overallGPA", "Overall GPA", overallGPA !== null ? `${overallGPA}${gpaScale ? `/${gpaScale}` : ""}` : null, "high"),
      f("majorGPA", "Major GPA", majorGPA !== null ? `${majorGPA}${gpaScale ? `/${gpaScale}` : ""}` : null, "medium"),
      f("totalCredits", "Total credits earned", totalCreditsEarned !== null ? String(totalCreditsEarned) : null, "high"),
      f("graduationDate", "Graduation date", graduationDate, "medium"),
    ],
  };

  // ─── Tables ───────────────────────────────────────────────────────────────
  const allCoursesTable: ExtractedTable = {
    id: "courses",
    title: "All Courses",
    description: `${terms.reduce((s, t) => s + t.courses.length, 0)} course(s) across ${terms.length} term(s)`,
    columns: [
      { id: "term", label: "Term", type: "text", sortable: true },
      { id: "code", label: "Code", type: "text", sortable: true },
      { id: "title", label: "Title", type: "text" },
      { id: "credits", label: "Credits", type: "number", sortable: true },
      { id: "grade", label: "Grade", type: "tag", sortable: true },
    ],
    rows: terms.flatMap((term) =>
      term.courses.map((c) => ({
        term: `${term.name}${term.year ? " " + term.year : ""}`,
        code: c.code ?? "",
        title: c.title ?? "",
        credits: c.credits ?? "",
        grade: c.grade ?? "",
      }))
    ),
  };

  // ─── Insights ─────────────────────────────────────────────────────────────
  const insights: Insight[] = [];

  if (overallGPA !== null) {
    if (overallGPA >= 3.7) {
      insights.push({
        id: "high-gpa",
        title: "High GPA detected",
        body: `Overall GPA of ${overallGPA} is in the honors range (typically 3.5+).`,
        severity: "info",
        category: "Academic performance",
      });
    } else if (overallGPA < 2.0) {
      insights.push({
        id: "low-gpa",
        title: "Low GPA detected",
        body: `Overall GPA of ${overallGPA} is below 2.0, which may indicate academic probation.`,
        severity: "warning",
        category: "Academic performance",
      });
    }
  }

  if (deansList.length > 0) {
    insights.push({
      id: "deans-list",
      title: `Dean's List: ${deansList.length} mention(s)`,
      body: deansList.join("; "),
      severity: "info",
      category: "Academic honors",
    });
  }

  if (terms.length === 0) {
    insights.push({
      id: "no-terms",
      title: "No academic terms detected",
      body: "Could not parse semester/term blocks. The transcript may have an unusual layout.",
      severity: "notice",
      category: "Structure",
    });
  }

  if (!studentName) {
    insights.push({
      id: "no-student-name",
      title: "Student name not detected",
      body: "The student's name could not be extracted. Verify manually.",
      severity: "notice",
      category: "Identification",
    });
  }

  const expected = [
    studentName,
    institution,
    degreeProgram,
    overallGPA,
    terms.length > 0 ? "terms" : null,
    totalCreditsEarned,
    graduationDate,
  ];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  return {
    details,
    fieldGroups: [headerGroup],
    tables: [allCoursesTable],
    insights,
    completeness,
  };
}

/** Helper: get all RegExp matches as array of {index, match} */
declare global {
  interface RegExp {
    execAllNonNull(text: string): Array<{ index: number; match: string; groups?: Record<string, string> }>;
  }
}
RegExp.prototype.execAllNonNull = function(text: string) {
  const results: Array<{ index: number; match: string }> = [];
  const re = new RegExp(this.source, this.flags.includes("g") ? this.flags : this.flags + "g");
  let m;
  while ((m = re.exec(text)) !== null) {
    results.push({ index: m.index, match: m[0] });
    if (results.length >= 50) break; // safety cap
  }
  return results;
};
