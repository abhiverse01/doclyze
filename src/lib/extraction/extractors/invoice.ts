/**
 * Invoice extractor — vendor/bill-to, line items, reconciliation.
 * Real regex + structural heuristics. Verifies that line items sum to stated total.
 */

import {
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  Insight,
  InvoiceDetails,
  Severity,
} from "../types";

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const MONEY_RE_BASE = /(?:[$€£¥₹]|USD|EUR|GBP|JPY|INR)?\s?(\(\s*-?\d[\d,.]*\s*\)|-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+\.\d{2})/;
const DATE_RE_BASE =
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})\b/;
const INVOICE_NUM_RE = /(?:invoice|inv|bill)\s*(?:no\.?|number|#)[:\s]*([A-Z0-9-]{3,})/i;

function parseMoney(s: string | null): number | null {
  if (!s) return null;
  // Handle parenthetical negatives: (500.00) → -500
  const parenMatch = s.match(/^\(\s*(-?\d[\d,.]*)\s*\)$/);
  if (parenMatch) {
    const inner = parenMatch[1];
    const normalized = normalizeEuropeanNumber(inner);
    const n = parseFloat(normalized);
    return isNaN(n) ? null : -Math.abs(n);
  }
  const normalized = normalizeEuropeanNumber(s);
  const cleaned = normalized.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Normalize European locale numbers: 1.299,00 → 1299.00 */
function normalizeEuropeanNumber(s: string): string {
  // European format: digits.digits,digits where last comma has exactly 2 decimal digits
  const euMatch = s.match(/^-?\d{1,3}(?:\.\d{3})+,\d{2}$/);
  if (euMatch) {
    return s.replace(/\./g, "").replace(",", ".");
  }
  return s;
}

function normalizeDate(s: string | null): string | null {
  if (!s) return null;
  // Handle present/current/ongoing
  if (/^(present|current|ongoing|now)$/i.test(s.trim())) return null;
  // Quarter notation: Q1 2023
  const qMatch = s.match(/Q([1-4])\s+(\d{4})/i);
  if (qMatch) {
    const qMonth = (parseInt(qMatch[1]) - 1) * 3 + 1;
    return `${qMatch[2]}-${String(qMonth).padStart(2, "0")}`;
  }
  // YYYY-MM format
  const ymMatch = s.match(/^(\d{4})-(\d{2})$/);
  if (ymMatch) return s;
  // Try ISO full date first
  const iso = s.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  // MM/DD/YYYY
  const m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const [_, mm, dd, yyyy] = m;
    const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // "January 5, 2024" / "Jan 5, 2024"
  const m2 = s.match(/([A-Z][a-z]+) (\d{1,2}),? (\d{4})/);
  if (m2) {
    const months: Record<string, string> = {
      January: "01", February: "02", March: "03", April: "04", May: "05", June: "06",
      July: "07", August: "08", September: "09", October: "10", November: "11", December: "12",
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
    };
    const mon = months[m2[1]];
    if (mon) return `${m2[3]}-${mon}-${m2[2].padStart(2, "0")}`;
  }
  return s;
}

function detectCurrency(text: string): string {
  if (/[$]/.test(text) || /\bUSD\b/i.test(text)) return "USD";
  if (/€/.test(text) || /\bEUR\b/i.test(text)) return "EUR";
  if (/£/.test(text) || /\bGBP\b/i.test(text)) return "GBP";
  if (/¥/.test(text) || /\bJPY\b/i.test(text)) return "JPY";
  if (/₹/.test(text) || /\bINR\b/i.test(text)) return "INR";
  return "USD";
}

export function extractInvoice(text: string, filename: string): {
  details: InvoiceDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  const currency = detectCurrency(text);

  // Vendor — usually top of invoice, before "Bill To"
  const billToMatch = text.match(/bill\s*to[:\s]*\n?([\s\S]*?)(?:\n\s*\n|ship\s*to:|description|qty|item)/i);
  const billToBlock = billToMatch?.[1]?.trim() ?? "";
  const billToName = billToBlock.split(/\n/)[0]?.trim() ?? null;
  const billToEmail = billToBlock.match(EMAIL_RE)?.[0] ?? null;
  const billToAddress = billToBlock.split(/\n/).slice(1).join(", ").trim() || null;

  // Vendor — text before "Bill To" or first occurrence of email/phone.
  // Skip generic header words like "INVOICE" / "RECEIPT".
  const preBillTo = text.split(/bill\s*to/i)[0] ?? text;
  const vendorLines = preBillTo.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const HEADER_WORDS = /^(invoice|receipt|bill|statement|proforma|pro forma)$/i;
  // Prefer lines that look like a company name (Inc, LLC, Corp, Ltd, GmbH, etc.)
  const companyIndicator = /\b(inc|llc|corp|ltd|gmbh|co|limited|company|solutions|technologies|systems|services|enterprises|industries)\b\.?/i;
  const vendorName =
    vendorLines.find((l) => companyIndicator.test(l) && /^[A-Z][a-zA-Z0-9\s&.,'-]{2,}$/.test(l)) ??
    vendorLines.find((l) => !HEADER_WORDS.test(l) && /^[A-Z][a-zA-Z0-9\s&.,'-]{2,}$/.test(l) && l.length > 5) ??
    null;
  const vendorEmail = preBillTo.match(EMAIL_RE)?.[0] ?? null;
  const vendorNameIdx = vendorName ? vendorLines.findIndex((l) => l === vendorName) : -1;
  const vendorAddress = vendorNameIdx >= 0
    ? vendorLines
        .slice(vendorNameIdx + 1)
        .join(", ")
        .trim()
        .slice(0, 200) || null
    : null;

  // Invoice number
  const invoiceNumMatch = text.match(INVOICE_NUM_RE);
  const invoiceNumber = invoiceNumMatch?.[1] ?? null;

  // Dates
  const dates = Array.from(text.matchAll(new RegExp(DATE_RE_BASE.source, 'g'))).map((m) => m[0]);
  const invoiceDate = dates[0] ? normalizeDate(dates[0]) : null;
  const dueDate = dates[1] ? normalizeDate(dates[1]) : null;

  // Line items — look for the typical pattern: description ... qty x unit_price = total
  // We'll try several heuristics.
  const lineItems: InvoiceDetails["lineItems"] = parseLineItems(text);

  // Subtotal / tax / total — use word boundaries so we don't match "vat" in "Innovation"
  const subtotal = findAmount(text, /\bsub\s*total\b[^$\d]*/i);
  const tax = findAmount(text, /\b(?:tax|vat|gst)\b[^$\d]*/i);
  // For Total — use negative lookbehind so we don't match "total" inside "Subtotal".
  // Try "Total Due" / "Amount Due" / "Balance Due" first (more specific), then bare "Total".
  const total =
    findAmount(text, /\b(?:total\s*due|amount\s*due|balance\s*due)\b[^$\d]*/i) ??
    findAmount(text, /(?<!sub)\btotal\b[^$\d]*/i);

  // Reconciliation
  const lineItemsSum = lineItems.reduce((acc, li) => acc + (li.total ?? 0), 0);
  const reconciliation: InvoiceDetails["reconciliation"] = {
    lineItemsSum: Math.round(lineItemsSum * 100) / 100,
    statedTotal: total,
    matches: total !== null && Math.abs(lineItemsSum - total) < 0.02,
    difference: total !== null ? Math.round((total - lineItemsSum) * 100) / 100 : 0,
  };

  const details: InvoiceDetails = {
    vendor: { name: vendorName, address: vendorAddress, email: vendorEmail },
    billTo: { name: billToName, address: billToAddress, email: billToEmail },
    invoiceNumber,
    invoiceDate,
    dueDate,
    lineItems,
    subtotal,
    tax,
    total,
    currency,
    reconciliation,
  };

  // ─── Field groups ─────────────────────────────────────────────────────────
  const headerGroup: FieldGroup = {
    id: "header",
    title: "Invoice Header",
    fields: [
      f("invoiceNumber", "Invoice #", invoiceNumber, "high"),
      f("invoiceDate", "Invoice date", invoiceDate, "high"),
      f("dueDate", "Due date", dueDate, "high"),
      f("currency", "Currency", currency, "high"),
    ],
  };

  const vendorGroup: FieldGroup = {
    id: "vendor",
    title: "Vendor (from)",
    fields: [
      f("vendorName", "Name", vendorName, "medium"),
      f("vendorEmail", "Email", vendorEmail, "high"),
      f("vendorAddress", "Address", vendorAddress, "low"),
    ],
  };

  const billToGroup: FieldGroup = {
    id: "billTo",
    title: "Bill To",
    fields: [
      f("billToName", "Name", billToName, "medium"),
      f("billToEmail", "Email", billToEmail, "high"),
      f("billToAddress", "Address", billToAddress, "low"),
    ],
  };

  const totalsGroup: FieldGroup = {
    id: "totals",
    title: "Totals & Reconciliation",
    fields: [
      f("subtotal", "Subtotal", formatMoney(subtotal, currency), "high"),
      f("tax", "Tax", formatMoney(tax, currency), "high"),
      f("total", "Total", formatMoney(total, currency), "high"),
      f(
        "lineItemsSum",
        "Line items sum (computed)",
        formatMoney(reconciliation.lineItemsSum, currency),
        "high",
        "Computed by Doclyze — not parsed from the document"
      ),
      f(
        "difference",
        "Difference (stated − sum)",
        formatMoney(reconciliation.difference, currency),
        "high"
      ),
      f(
        "matches",
        "Reconciliation",
        reconciliation.matches ? "✓ Matches" : "✗ Mismatch",
        "high"
      ),
    ],
  };

  // ─── Tables ───────────────────────────────────────────────────────────────
  const lineItemsTable: ExtractedTable = {
    id: "lineItems",
    title: "Line Items",
    description: `${lineItems.length} item(s)`,
    columns: [
      { id: "description", label: "Description", type: "text" },
      { id: "quantity", label: "Qty", type: "number", sortable: true },
      { id: "unitPrice", label: "Unit Price", type: "currency", sortable: true },
      { id: "total", label: "Total", type: "currency", sortable: true },
    ],
    rows: lineItems.map((li) => ({
      description: li.description,
      quantity: li.quantity ?? "",
      unitPrice: li.unitPrice ?? "",
      total: li.total ?? "",
    })),
  };

  // ─── Insights ─────────────────────────────────────────────────────────────
  const insights: Insight[] = [];

  if (!reconciliation.matches && total !== null && lineItems.length > 0) {
    insights.push({
      id: "reconciliation-mismatch",
      title: `Line items sum to ${formatMoney(reconciliation.lineItemsSum, currency)} but stated total is ${formatMoney(total, currency)}`,
      body: `A discrepancy of ${formatMoney(Math.abs(reconciliation.difference), currency)} was detected. This may indicate a missing line item, a tax miscalculation, or a parsing error.`,
      severity: "warning",
      category: "Reconciliation",
    });
  }

  if (lineItems.length === 0) {
    insights.push({
      id: "no-line-items",
      title: "No structured line items detected",
      body: "Doclyze could not parse tabular line items. This often happens with image-only invoices or unusual layouts. Try OCR if not already used.",
      severity: "notice",
      category: "Line items",
    });
  }

  if (invoiceDate && dueDate) {
    const inv = new Date(invoiceDate);
    const due = new Date(dueDate);
    if (!isNaN(inv.getTime()) && !isNaN(due.getTime())) {
      const days = Math.round((due.getTime() - inv.getTime()) / 86400000);
      insights.push({
        id: "payment-terms",
        title: `Payment terms: Net ${days}`,
        body: `Invoice dated ${invoiceDate}, due ${dueDate} — ${days} day(s) to pay.`,
        severity: "info",
        category: "Payment terms",
      });
    }
  }

  if (tax !== null && subtotal !== null && subtotal > 0) {
    const rate = (tax / subtotal) * 100;
    if (rate > 0 && rate < 30) {
      insights.push({
        id: "tax-rate",
        title: `Effective tax rate: ${rate.toFixed(1)}%`,
        body: `Tax of ${formatMoney(tax, currency)} on a subtotal of ${formatMoney(subtotal, currency)} implies an effective rate of ${rate.toFixed(1)}%.`,
        severity: "info",
        category: "Tax",
      });
    }
  }

  if (!invoiceNumber) {
    insights.push({
      id: "no-invoice-number",
      title: "No invoice number detected",
      body: "An invoice number is required for accounting and audit trails. If the document has one, ensure it's clearly labeled.",
      severity: "warning",
      category: "Header",
    });
  }

  const expected = [
    invoiceNumber, invoiceDate, dueDate, vendorName, billToName,
    lineItems.length > 0 ? "items" : null, total,
  ];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  return {
    details,
    fieldGroups: [headerGroup, vendorGroup, billToGroup, totalsGroup],
    tables: [lineItemsTable],
    insights,
    completeness,
  };
}

function findAmount(text: string, labelRe: RegExp): number | null {
  // Find the first "real money" value after the label.
  // A real money value has either a currency symbol prefix, OR a 2-decimal suffix,
  // OR a thousands comma. This skips over bare integers like the "8" in "Tax (8.5%)".
  // Use lazy `.*?` so we can skip past percentage values, parentheses, colons, etc.
  const m = text.match(
    new RegExp(
      labelRe.source +
        ".*?([\\$€£¥₹]\\s?\\d[\\d,]*(?:\\.\\d{2})?|\\d[\\d,]*\\.\\d{2}|\\d{1,3}(?:,\\d{3})+\\.?\\d*)",
      "i"
    )
  );
  if (!m) return null;
  return parseMoney(m[1]);
}

function parseLineItems(text: string): InvoiceDetails["lineItems"] {
  const items: InvoiceDetails["lineItems"] = [];
  // Look for the line-items section — typically between a "Description" header and "Subtotal"
  const sectionMatch = text.match(
    /(?:description|item|service)\s+(?:qty|quantity)?\s*(?:unit\s*price|rate)?\s*(?:amount|total)?\s*\n([\s\S]*?)(?:sub\s*total|subtotal|total)/i
  );
  const section = sectionMatch?.[1] ?? "";
  const lines = section.split(/\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip section headers / labels
    if (/^(description|item|qty|quantity|unit|price|amount|total|service)/i.test(line)) continue;
    if (line.length < 3) continue;

    // Extract all money amounts on the line — keep track of their positions
    // so we can distinguish the quantity digit from actual money values.
    const amountMatches = Array.from(line.matchAll(new RegExp(MONEY_RE_BASE.source, 'g')));
    if (amountMatches.length === 0) continue;

    // An amount is "real money" if it has a currency symbol, a comma (thousands),
    // or a 2-decimal-place suffix. A bare integer is likely the quantity, not money.
    const realAmounts = amountMatches
      .filter((m) => {
        const raw = m[0];
        // Has currency symbol
        if (/[$€£¥₹]|USD|EUR|GBP|JPY|INR/i.test(raw)) return true;
        // Has thousands comma
        if (/,\d{3}/.test(raw)) return true;
        // Has 2-decimal-place suffix
        if (/\.\d{2}$/.test(raw)) return true;
        return false;
      })
      .map((m) => parseMoney(m[1]) ?? 0);

    // All digit-only amounts (potential quantity)
    const bareNumbers = amountMatches
      .filter((m) => !realAmounts.includes(parseMoney(m[1]) ?? 0))
      .map((m) => parseMoney(m[1]) ?? 0);

    let quantity: number | null = null;
    let unitPrice: number | null = null;
    let total: number | null = null;

    if (realAmounts.length >= 2) {
      unitPrice = realAmounts[0];
      total = realAmounts[realAmounts.length - 1];
      quantity = bareNumbers.length > 0
        ? bareNumbers[0]
        : (unitPrice && total ? Math.round((total / unitPrice) * 100) / 100 : null);
    } else if (realAmounts.length === 1) {
      total = realAmounts[0];
      if (bareNumbers.length >= 2) {
        quantity = bareNumbers[0];
        unitPrice = bareNumbers[1];
      } else if (bareNumbers.length === 1) {
        quantity = bareNumbers[0];
      }
    } else {
      // No real money amounts — maybe just bare numbers
      if (amountMatches.length >= 3) {
        quantity = parseMoney(amountMatches[0][1]) ?? null;
        unitPrice = parseMoney(amountMatches[1][1]) ?? null;
        total = parseMoney(amountMatches[amountMatches.length - 1][1]) ?? null;
      } else if (amountMatches.length === 1) {
        total = parseMoney(amountMatches[0][1]) ?? null;
      }
    }

    // Description = line with money/qty stripped out
    const description = line
      .replace(new RegExp(MONEY_RE_BASE.source, 'g'), "")
      .replace(/\b\d+\s*(?:x|@|hrs?|hours?|units?|days?|months?)?\b/gi, "")
      .replace(/[$€£¥₹]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (description.length > 1) {
      items.push({
        description: description.slice(0, 200),
        quantity,
        unitPrice,
        total,
      });
    }
  }
  return items.slice(0, 50);
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
