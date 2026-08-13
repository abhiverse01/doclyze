/**
 * Financial Statement extractor — Balance Sheet, Income Statement, Cash Flow.
 * Extracts key figures, statement type, period, and year-over-year comparisons.
 */

import {
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  FinancialStatementDetails,
  Insight,
} from "../types";

const MONEY_RE_BASE = /(?:[$€£¥₹]|USD|EUR|GBP|JPY|INR)?\s?(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+\.\d{2})/;
const DATE_RE_BASE =
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})\b/;

function parseMoney(s: string | null): number | null {
  if (!s) return null;
  const parenMatch = s.match(/^\(\s*(-?\d[\d,.]*)\s*\)$/);
  if (parenMatch) {
    const n = parseFloat(parenMatch[1].replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? null : -Math.abs(n);
  }
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function detectCurrency(text: string): string {
  if (/[$]/.test(text) || /\bUSD\b/i.test(text)) return "USD";
  if (/€/.test(text) || /\bEUR\b/i.test(text)) return "EUR";
  if (/£/.test(text) || /\bGBP\b/i.test(text)) return "GBP";
  if (/¥/.test(text) || /\bJPY\b/i.test(text)) return "JPY";
  if (/₹/.test(text) || /\bINR\b/i.test(text)) return "INR";
  return "USD";
}

function formatMoney(n: number | null, currency: string): string {
  if (n === null) return "—";
  const symbols: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", INR: "₹" };
  const sym = symbols[currency] ?? "";
  return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function findFigure(text: string, labelRe: RegExp): number | null {
  const m = text.match(
    new RegExp(
      labelRe.source +
        ".*?([\\$€£¥₹]\\s?-?\\d[\\d,]*(?:\\.\\d{2})?|-?\\d[\\d,]*\\.\\d{2}|\\d{1,3}(?:,\\d{3})+\\.?\\d*)",
      "i"
    )
  );
  if (!m) return null;
  return parseMoney(m[1]);
}

export function extractFinancialStatement(text: string, filename: string): {
  details: FinancialStatementDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  const currency = detectCurrency(text);

  // ─── Company name ─────────────────────────────────────────────────────────
  const companyMatch =
    text.match(/([A-Z][A-Za-z0-9\s&.,'-]{3,80}(?:Inc\.?|LLC|Corp\.?|Ltd\.?|PLC|SA|AG|GmbH|NV))/) ??
    text.match(/^(?:consolidated\s+)?(?:financial\s+)?(?:balance\s+sheet|income\s+statement|cash\s+flow)\s*\n\s*([A-Z][A-Za-z0-9\s&.,'-]{3,80})/im);
  const companyName = companyMatch?.[1]?.trim() ?? null;

  // ─── Statement period ─────────────────────────────────────────────────────
  const periodMatch =
    text.match(/for\s+(?:the\s+)?(?:year|period|quarter|six\s*months?|three\s*months?|fiscal\s*year)\s+(?:ended?|ending)\s+([A-Za-z0-9 ,/\-]+)/i) ??
    text.match(/(?:period|fiscal\s*year|fy)[:\s]*([A-Za-z0-9 ,/\-]+)/i) ??
    text.match(/for\s+([A-Za-z0-9 ,/\-]{5,40}?\d{4})/i);
  const statementPeriod = periodMatch?.[1]?.trim().split(/\n/)[0] ?? null;

  // ─── Statement type ──────────────────────────────────────────────────────
  let statementType: string | null = null;
  if (/\bbalance\s*sheet\b/i.test(text)) statementType = "Balance Sheet";
  else if (/\b(?:income|profit\s*(?:and\s*loss)|statement\s*of\s*(?:operations|income|earnings))\b/i.test(text)) statementType = "Income Statement";
  else if (/\bcash\s*flow\b/i.test(text)) statementType = "Cash Flow Statement";
  else if (/\bstatement\s*of\s*(?:changes?\s+in\s+)?equity\b/i.test(text)) statementType = "Statement of Changes in Equity";
  else if (/\b10-?k\b/i.test(text)) statementType = "10-K Annual Report";

  // ─── Key figures ──────────────────────────────────────────────────────────
  const revenue = findFigure(text, /\b(?:total\s+)?(?:revenue|net\s+sales|sales|turnover)\b/i);
  const netIncome = findFigure(text, /\b(?:net\s+(?:income|earnings|profit|loss)|profit\s+(?:after\s+tax))\b/i);
  const totalAssets = findFigure(text, /\b(?:total\s+)?assets\b/i);
  const totalLiabilities = findFigure(text, /\b(?:total\s+)?liabilities\b/i);
  const equity = findFigure(text, /\b(?:total\s+)?(?:shareholders?['']?\s+)?equity\b/i);

  // ─── Year-over-year comparisons ──────────────────────────────────────────
  const yoyComparisons: FinancialStatementDetails["yearOverYearComparisons"] = [];

  // Look for "Year 2024  2023" column headers pattern
  const yoyHeaderMatch = text.match(/(\d{4})\s+(\d{4})/);
  if (yoyHeaderMatch) {
    // Try to extract current/prior for key metrics
    const metrics = [
      { label: "Revenue", re: /revenue/i },
      { label: "Net Income", re: /net\s+income/i },
      { label: "Total Assets", re: /total\s+assets/i },
    ];
    for (const metric of metrics) {
      const metricBlock = text.match(new RegExp(metric.re.source + "[^\\n]*([\\d,\\s.$€£]+)", "i"));
      if (metricBlock) {
        const nums = Array.from(metricBlock[1].matchAll(/\$?\s?([\d,]+(?:\.\d{2})?)/g)).map((m) => parseMoney(m[1]));
        if (nums.length >= 2) {
          yoyComparisons.push({
            metric: metric.label,
            current: nums[0],
            prior: nums[1],
          });
        }
      }
    }
  }

  // ─── Footnotes ───────────────────────────────────────────────────────────
  const footnotesMatch = text.match(/(?:notes?\s+(?:to|for)\s+(?:the\s+)?(?:financial|consolidated))/i);
  const footnotesSection = text.match(/\d+\.\s+\w/i); // crude count of numbered notes
  let footnotesCount = 0;
  const noteRe = /\bnote\s+(\d+)/gi;
  let noteMatch;
  while ((noteMatch = noteRe.exec(text)) !== null) {
    footnotesCount++;
  }
  if (!footnotesCount && footnotesMatch) footnotesCount = 1;

  const details: FinancialStatementDetails = {
    companyName,
    statementPeriod,
    statementType,
    revenue,
    netIncome,
    totalAssets,
    totalLiabilities,
    equity,
    yearOverYearComparisons: yoyComparisons,
    footnotesCount,
  };

  // ─── Field groups ─────────────────────────────────────────────────────────
  const headerGroup: FieldGroup = {
    id: "header",
    title: "Statement Overview",
    fields: [
      f("companyName", "Company", companyName, "medium"),
      f("statementType", "Statement type", statementType, "high"),
      f("statementPeriod", "Period", statementPeriod, "high"),
      f("currency", "Currency", currency, "high"),
      f("footnotesCount", "Footnotes", String(footnotesCount), "medium"),
    ],
  };

  const figuresGroup: FieldGroup = {
    id: "figures",
    title: "Key Financial Figures",
    fields: [
      f("revenue", "Revenue", formatMoney(revenue, currency), "high"),
      f("netIncome", "Net Income", formatMoney(netIncome, currency), "high"),
      f("totalAssets", "Total Assets", formatMoney(totalAssets, currency), "high"),
      f("totalLiabilities", "Total Liabilities", formatMoney(totalLiabilities, currency), "high"),
      f("equity", "Equity", formatMoney(equity, currency), "high"),
    ],
  };

  // ─── Tables ───────────────────────────────────────────────────────────────
  const yoyTable: ExtractedTable = {
    id: "yoy",
    title: "Year-over-Year Comparisons",
    description: yoyComparisons.length > 0 ? `${yoyComparisons.length} metric(s) compared` : "No YoY data detected",
    columns: [
      { id: "metric", label: "Metric", type: "text" },
      { id: "current", label: "Current", type: "currency", sortable: true },
      { id: "prior", label: "Prior", type: "currency", sortable: true },
    ],
    rows: yoyComparisons.map((c) => ({
      metric: c.metric,
      current: c.current ?? "",
      prior: c.prior ?? "",
    })),
  };

  // ─── Insights ─────────────────────────────────────────────────────────────
  const insights: Insight[] = [];

  if (!statementType) {
    insights.push({
      id: "no-statement-type",
      title: "Statement type not detected",
      body: "Could not determine if this is a Balance Sheet, Income Statement, or Cash Flow statement.",
      severity: "notice",
      category: "Classification",
    });
  }

  if (netIncome !== null && revenue !== null && revenue > 0) {
    const margin = (netIncome / revenue) * 100;
    insights.push({
      id: "profit-margin",
      title: `Net profit margin: ${margin.toFixed(1)}%`,
      body: `Net income of ${formatMoney(netIncome, currency)} on revenue of ${formatMoney(revenue, currency)}.`,
      severity: "info",
      category: "Financial ratios",
    });
  }

  if (totalAssets !== null && totalLiabilities !== null && totalAssets > 0) {
    const ratio = (totalLiabilities / totalAssets) * 100;
    insights.push({
      id: "debt-ratio",
      title: `Debt-to-assets ratio: ${ratio.toFixed(1)}%`,
      body: `Total liabilities of ${formatMoney(totalLiabilities, currency)} against total assets of ${formatMoney(totalAssets, currency)}.`,
      severity: ratio > 70 ? "warning" : "info",
      category: "Financial ratios",
    });
  }

  if (equity !== null && totalAssets !== null && totalAssets > 0) {
    const eqRatio = (equity / totalAssets) * 100;
    insights.push({
      id: "equity-ratio",
      title: `Equity-to-assets ratio: ${eqRatio.toFixed(1)}%`,
      body: `Shareholders' equity of ${formatMoney(equity, currency)} against total assets of ${formatMoney(totalAssets, currency)}.`,
      severity: "info",
      category: "Financial ratios",
    });
  }

  if (yoyComparisons.length > 0) {
    insights.push({
      id: "yoy-found",
      title: `Year-over-year data available for ${yoyComparisons.length} metric(s)`,
      body: yoyComparisons.map((c) => `${c.metric}: ${formatMoney(c.current, currency)} vs ${formatMoney(c.prior, currency)}`).join("; "),
      severity: "info",
      category: "Comparisons",
    });
  }

  const expected = [
    companyName,
    statementType,
    statementPeriod,
    revenue,
    netIncome,
    totalAssets,
    totalLiabilities,
    equity,
  ];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  return {
    details,
    fieldGroups: [headerGroup, figuresGroup],
    tables: [yoyTable],
    insights,
    completeness,
  };
}
