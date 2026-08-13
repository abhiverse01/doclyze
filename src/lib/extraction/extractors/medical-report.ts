/**
 * Medical / Lab Report extractor — patient info, test results, reference ranges.
 * De-identifies patient name in output (shows "[PATIENT]" instead).
 * Structure only — no diagnostic claims.
 */

import {
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  Insight,
  MedicalReportDetails,
} from "../types";

const DATE_RE_BASE =
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})\b/;

/** Test result line pattern: test name, value, unit, reference range, optional flag */
const TEST_RESULT_RE = /^\s*([A-Za-z][A-Za-z\s()\-\/.]{2,50}?)\s+([\d.<>]+\s*(?:\.\d+)?)\s*(\w+\/?\w*|%|mg\/dL|g\/dL|mmol\/L|IU\/L|U\/L|mEq\/L|pg\/mL|ng\/mL)?\s*(?:\(([0-9.]+\s*-?\s*[0-9.]*)\))?\s*([HHLNABC]*)?\s*$/gm;

/** Flag letters: H=High, L=Low, C=Critical, A=Abnormal, N=Normal */
function interpretFlag(flag: string | null | undefined): "normal" | "abnormal" | "critical" | null {
  if (!flag) return null;
  const upper = flag.toUpperCase().trim();
  if (upper.includes("C")) return "critical";
  if (upper.includes("H") || upper.includes("L") || upper.includes("A") || upper.includes("B")) return "abnormal";
  if (upper.includes("N")) return "normal";
  return null;
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

export function extractMedicalReport(text: string, filename: string): {
  details: MedicalReportDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  // ─── Patient name (de-identified) ─────────────────────────────────────────
  const patientNameMatch =
    text.match(/(?:patient|name)[:\s]*\n?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i) ??
    text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/m);
  const rawPatientName = patientNameMatch?.[1]?.trim() ?? null;
  // De-identify: always show [PATIENT] in output
  const patientName: string | null = rawPatientName ? "[PATIENT]" : null;

  // ─── Date of report ───────────────────────────────────────────────────────
  const dateMatch =
    text.match(/(?:date\s*(?:of\s*(?:report|specimen|collection|service))|report\s*date|collected|received)[:\s]*\n?\s*([A-Za-z0-9 ,/\-]+)/i);
  const dateOfReport = dateMatch?.[1]?.trim().split(/\n/)[0] ??
    Array.from(text.matchAll(new RegExp(DATE_RE_BASE.source, "g"))).map((m) => m[0])[0] ?? null;

  // ─── Ordering physician ──────────────────────────────────────────────────
  const physicianMatch =
    text.match(/(?:ordering\s*(?:physician|doctor|provider)|ordered\s*by|physician|dr\.?|doctor)[:\s]*\n?\s*([A-Z][a-zA-Z\s'.-]{2,60})/i);
  const orderingPhysician = physicianMatch?.[1]?.trim() ?? null;

  // ─── Lab / Test name ─────────────────────────────────────────────────────
  const labMatch =
    text.match(/(?:laboratory|lab|clinical\s*lab|pathology|radiology|imaging)[:\s]*\n?\s*([A-Z][A-Za-z0-9\s&.,'-]{3,80})/i);
  const labName = labMatch?.[1]?.trim() ?? null;

  // ─── Test results ─────────────────────────────────────────────────────────
  const testResults: MedicalReportDetails["testResults"] = [];
  let hasAbnormal = false;
  let hasCritical = false;

  const testRe = new RegExp(TEST_RESULT_RE.source, "gm");
  let testMatch;
  while ((testMatch = testRe.exec(text)) !== null && testResults.length < 80) {
    const name = testMatch[1]?.trim() ?? "";
    const value = testMatch[2]?.trim() ?? "";
    const unit = testMatch[3]?.trim() ?? null;
    const refRange = testMatch[4]?.trim() ?? null;
    const flag = interpretFlag(testMatch[5]);

    if (flag === "abnormal") hasAbnormal = true;
    if (flag === "critical") hasCritical = true;

    // Skip header lines
    if (/^(test|result|value|reference|range|flag|unit|status)/i.test(name)) continue;

    testResults.push({
      testName: name.slice(0, 60),
      value,
      unit,
      referenceRange: refRange,
      flag,
    });
  }

  // Fallback: try to find any lines with numeric values that look like test results
  if (testResults.length === 0) {
    const looseRe = /^\s*([A-Za-z][A-Za-z\s()\-\/.]{2,50}?)\s+([\d.<>]+\s*(?:\.\d+)?)\s*$/gm;
    let looseMatch;
    while ((looseMatch = looseRe.exec(text)) !== null && testResults.length < 40) {
      const name = looseMatch[1]?.trim() ?? "";
      if (/^(test|result|value|reference|range|flag|unit|status|date|patient|physician|lab)/i.test(name)) continue;
      if (name.length < 2 || name.length > 60) continue;
      testResults.push({
        testName: name,
        value: looseMatch[2]?.trim() ?? "",
        unit: null,
        referenceRange: null,
        flag: null,
      });
    }
  }

  // ─── Status ──────────────────────────────────────────────────────────────
  const statusTextMatch = text.match(/\b(?:overall|final|preliminary|result\s*(?:status|summary))[:\s]*\n?\s*(normal|abnormal|critical|pending)/i);
  let status: MedicalReportDetails["status"] = null;
  if (statusTextMatch) {
    const s = statusTextMatch[1].toLowerCase();
    if (s === "normal" || s === "abnormal" || s === "critical") status = s;
  } else if (hasCritical) {
    status = "critical";
  } else if (hasAbnormal) {
    status = "abnormal";
  } else if (testResults.length > 0) {
    status = "normal";
  }

  // ─── Notes ───────────────────────────────────────────────────────────────
  const notesMatch = text.match(/(?:notes?|comments?|remarks?|interpretation|impression)[:\s]*\n([\s\S]{10,500}?)(?:\n\s*\n|\Z)/i);
  const notes = notesMatch?.[1]?.trim().slice(0, 500) ?? null;

  const details: MedicalReportDetails = {
    patientName,
    dateOfReport,
    orderingPhysician,
    labName,
    testResults,
    status,
    notes,
  };

  // ─── Field groups ─────────────────────────────────────────────────────────
  const headerGroup: FieldGroup = {
    id: "header",
    title: "Report Header",
    fields: [
      f("patientName", "Patient", patientName, "medium", "De-identified for privacy"),
      f("dateOfReport", "Report date", dateOfReport, "high"),
      f("orderingPhysician", "Ordering physician", orderingPhysician, "medium"),
      f("labName", "Lab / Facility", labName, "medium"),
      f("status", "Overall status", status ?? "—", "high"),
      f("testCount", "Tests performed", String(testResults.length), "high"),
    ],
  };

  // ─── Tables ───────────────────────────────────────────────────────────────
  const testResultsTable: ExtractedTable = {
    id: "testResults",
    title: "Test Results",
    description: `${testResults.length} test(s)`,
    columns: [
      { id: "testName", label: "Test", type: "text", sortable: true },
      { id: "value", label: "Value", type: "text" },
      { id: "unit", label: "Unit", type: "text" },
      { id: "referenceRange", label: "Reference Range", type: "text" },
      { id: "flag", label: "Flag", type: "tag", sortable: true },
    ],
    rows: testResults.map((t) => ({
      testName: t.testName,
      value: t.value,
      unit: t.unit ?? "",
      referenceRange: t.referenceRange ?? "",
      flag: t.flag ?? "",
    })),
  };

  // ─── Insights ─────────────────────────────────────────────────────────────
  const insights: Insight[] = [];

  if (patientName) {
    insights.push({
      id: "patient-deidentified",
      title: "Patient name de-identified",
      body: "The patient's name has been replaced with [PATIENT] for privacy compliance. Handle this document in accordance with HIPAA/GDPR regulations.",
      severity: "notice",
      category: "Privacy",
    });
  }

  if (hasCritical) {
    insights.push({
      id: "critical-results",
      title: "Critical result(s) detected",
      body: "One or more test results are flagged as critical. These typically require immediate clinical attention.",
      severity: "warning",
      category: "Clinical flags",
    });
  }

  if (hasAbnormal && !hasCritical) {
    insights.push({
      id: "abnormal-results",
      title: "Abnormal result(s) detected",
      body: "One or more test results fall outside the reference range. Review the flagged values in the results table.",
      severity: "notice",
      category: "Clinical flags",
    });
  }

  if (testResults.length === 0) {
    insights.push({
      id: "no-test-results",
      title: "No structured test results parsed",
      body: "Doclyze could not parse individual test results. The report may use an unusual format or be image-based.",
      severity: "notice",
      category: "Structure",
    });
  }

  if (!orderingPhysician) {
    insights.push({
      id: "no-physician",
      title: "Ordering physician not detected",
      body: "Could not identify the ordering physician. This is needed for clinical follow-up.",
      severity: "info",
      category: "Identification",
    });
  }

  const expected = [
    patientName,
    dateOfReport,
    orderingPhysician,
    labName,
    testResults.length > 0 ? "tests" : null,
    status,
  ];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  return {
    details,
    fieldGroups: [headerGroup],
    tables: [testResultsTable],
    insights,
    completeness,
  };
}
