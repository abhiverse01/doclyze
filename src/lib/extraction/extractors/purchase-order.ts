/**
 * Purchase Order extractor — PO number, buyer/vendor, line items, totals, terms.
 * Similar to invoice but with PO-specific fields.
 */

import {
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  Insight,
  PurchaseOrderDetails,
} from "../types";

const MONEY_RE_BASE = /(?:[$€£¥₹]|USD|EUR|GBP|JPY|INR)?\s?(\(\s*-?\d[\d,.]*\s*\)|-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+\.\d{2})/;
const DATE_RE_BASE =
  /\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})\b/;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

function parseMoney(s: string | null): number | null {
  if (!s) return null;
  const parenMatch = s.match(/^\(\s*(-?\d[\d,.]*)\s*\)$/);
  if (parenMatch) {
    const inner = parenMatch[1];
    const n = parseFloat(inner.replace(/[^0-9.\-]/g, ""));
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

function findAmount(text: string, labelRe: RegExp): number | null {
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

export function extractPurchaseOrder(text: string, filename: string): {
  details: PurchaseOrderDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  const currency = detectCurrency(text);

  // ─── PO number ────────────────────────────────────────────────────────────
  const poNumberMatch = text.match(/(?:purchase\s*order|po)\s*(?:no\.?|number|#)[:\s]*([A-Z0-9-]{3,})/i) ??
    text.match(/\bPO[-\s]?(\d{4,})\b/i);
  const poNumber = poNumberMatch?.[1] ?? null;

  // ─── Date ─────────────────────────────────────────────────────────────────
  const dates = Array.from(text.matchAll(new RegExp(DATE_RE_BASE.source, "g"))).map((m) => m[0]);
  const date = dates[0] ?? null;

  // ─── Buyer ─────────────────────────────────────────────────────────────────
  const buyerMatch = text.match(/(?:buyer|requested\s*by|requisitioner|ordered\s*by|purchaser)[:\s]*\n?\s*([A-Z][A-Za-z0-9\s&.,'-]{2,80})/i) ??
    text.match(/(?:company|organization)[:\s]*\n?\s*([A-Z][A-Za-z0-9\s&.,'-]{2,80})/i);
  const buyer = buyerMatch?.[1]?.trim() ?? null;

  // ─── Vendor / Supplier ─────────────────────────────────────────────────────
  const vendorMatch =
    text.match(/(?:vendor|supplier|seller|provider|from)[:\s]*\n?\s*([A-Z][A-Za-z0-9\s&.,'-]{2,80})/i) ??
    text.match(/(?:ship\s*(?:from|to))[:\s]*\n?\s*([A-Z][A-Za-z0-9\s&.,'-]{2,80})/i);
  const vendor = vendorMatch?.[1]?.trim() ?? null;

  // ─── Ship-to address ──────────────────────────────────────────────────────
  const shipToMatch = text.match(/(?:ship\s*to|deliver\s*to|shipping\s*address)[:\s]*\n?\s*([\s\S]{3,200}?)(?:\n\s*\n|bill\s*to|description|qty|item|line)/i);
  const shipToAddress = shipToMatch?.[1]?.trim().replace(/\n/g, ", ").slice(0, 200) ?? null;

  // ─── Line items ──────────────────────────────────────────────────────────
  const lineItems: PurchaseOrderDetails["lineItems"] = parseLineItems(text);

  // ─── Totals ──────────────────────────────────────────────────────────────
  const subtotal = findAmount(text, /\bsub\s*total\b[^$\d]*/i);
  const tax = findAmount(text, /\b(?:tax|vat|gst)\b[^$\d]*/i);
  const shipping = findAmount(text, /\b(?:shipping|freight|delivery|shipping\s*(?:\&\s*)?handling)\b[^$\d]*/i);
  const total =
    findAmount(text, /\b(?:grand\s*total|total\s*(?:amount|due)?)\b[^$\d]*/i) ??
    findAmount(text, /(?<!sub)\btotal\b[^$\d]*/i);

  // ─── Payment terms ────────────────────────────────────────────────────────
  const paymentTermsMatch =
    text.match(/(?:payment\s*terms|terms|terms\s*of\s*payment)[:\s]*\n?\s*([^\n]{3,60})/i) ??
    text.match(/\b(net\s*\d{1,3}|cod|c\.?o\.?d\.?|upon\s*receipt|prepaid|due\s*on\s*receipt)\b/i);
  const paymentTerms = paymentTermsMatch?.[1]?.trim() ?? paymentTermsMatch?.[0]?.trim() ?? null;

  // ─── Authorized by ──────────────────────────────────────────────────────
  const authorizedByMatch = text.match(/(?:authorized|approved|signed)\s*(?:by|signature)?[:\s]*\n?\s*([A-Z][a-zA-Z\s'-]{2,60})/i) ??
    text.match(/(?:approver|authorizer)[:\s]*\n?\s*([A-Z][a-zA-Z\s'-]{2,60})/i);
  const authorizedBy = authorizedByMatch?.[1]?.trim() ?? null;

  // ─── Delivery date ───────────────────────────────────────────────────────
  const deliveryDateMatch = text.match(/(?:delivery\s*date|expected\s*delivery|ship\s*date|est\.?\s*delivery)[:\s]*\n?\s*([A-Za-z0-9 ,/\-]+)/i);
  const deliveryDate = deliveryDateMatch?.[1]?.trim().split(/\n/)[0] ?? dates[1] ?? null;

  const details: PurchaseOrderDetails = {
    poNumber,
    date,
    buyer,
    vendor,
    shipToAddress,
    lineItems,
    subtotal,
    tax,
    shipping,
    total,
    currency,
    paymentTerms,
    authorizedBy,
    deliveryDate,
  };

  // ─── Field groups ─────────────────────────────────────────────────────────
  const headerGroup: FieldGroup = {
    id: "header",
    title: "Purchase Order Header",
    fields: [
      f("poNumber", "PO Number", poNumber, "high"),
      f("date", "Date", date, "high"),
      f("currency", "Currency", currency, "high"),
      f("paymentTerms", "Payment terms", paymentTerms, "medium"),
      f("authorizedBy", "Authorized by", authorizedBy, "medium"),
      f("deliveryDate", "Delivery date", deliveryDate, "medium"),
    ],
  };

  const partiesGroup: FieldGroup = {
    id: "parties",
    title: "Parties",
    fields: [
      f("buyer", "Buyer / Requester", buyer, "medium"),
      f("vendor", "Vendor / Supplier", vendor, "medium"),
      f("shipToAddress", "Ship-to address", shipToAddress, "low"),
    ],
  };

  const totalsGroup: FieldGroup = {
    id: "totals",
    title: "Totals",
    fields: [
      f("subtotal", "Subtotal", formatMoney(subtotal, currency), "high"),
      f("tax", "Tax", formatMoney(tax, currency), "high"),
      f("shipping", "Shipping / Freight", formatMoney(shipping, currency), "high"),
      f("total", "Total", formatMoney(total, currency), "high"),
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

  if (!poNumber) {
    insights.push({
      id: "no-po-number",
      title: "No PO number detected",
      body: "A purchase order number is required for tracking and procurement workflows.",
      severity: "warning",
      category: "Identification",
    });
  }

  if (lineItems.length === 0) {
    insights.push({
      id: "no-line-items",
      title: "No structured line items detected",
      body: "The line items section could not be parsed. Verify the document format.",
      severity: "notice",
      category: "Line items",
    });
  }

  if (!authorizedBy) {
    insights.push({
      id: "no-authorization",
      title: "No authorization detected",
      body: "Could not find an authorized/approved signature. Ensure the PO is properly authorized.",
      severity: "notice",
      category: "Authorization",
    });
  }

  if (subtotal !== null && lineItems.length > 0) {
    const itemsSum = lineItems.reduce((acc, li) => acc + (li.total ?? 0), 0);
    if (total !== null && Math.abs(itemsSum - subtotal) > 0.02 && Math.abs(itemsSum - total) > 0.02) {
      insights.push({
        id: "totals-check",
        title: "Line items may not match stated totals",
        body: `Line items sum to ${formatMoney(itemsSum, currency)} but subtotal is ${formatMoney(subtotal, currency)}.`,
        severity: "warning",
        category: "Reconciliation",
      });
    }
  }

  const expected = [
    poNumber,
    date,
    buyer,
    vendor,
    lineItems.length > 0 ? "items" : null,
    total,
    paymentTerms,
    authorizedBy,
  ];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  return {
    details,
    fieldGroups: [headerGroup, partiesGroup, totalsGroup],
    tables: [lineItemsTable],
    insights,
    completeness,
  };
}

function parseLineItems(text: string): PurchaseOrderDetails["lineItems"] {
  const items: PurchaseOrderDetails["lineItems"] = [];
  const sectionMatch = text.match(
    /(?:description|item|service|product)\s+(?:qty|quantity)?\s*(?:unit\s*(?:price|cost|rate))?[\s\S]*?\n([\s\S]*?)(?:sub\s*total|subtotal|grand\s*total|total|shipping|freight|tax)/i
  );
  const section = sectionMatch?.[1] ?? "";
  const lines = section.split(/\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/^(description|item|qty|quantity|unit|price|amount|total|service|product|product)/i.test(line)) continue;
    if (line.length < 3) continue;

    const amountMatches = Array.from(line.matchAll(new RegExp(MONEY_RE_BASE.source, "g")));
    if (amountMatches.length === 0) continue;

    const realAmounts = amountMatches
      .filter((m) => {
        const raw = m[0];
        if (/[$€£¥₹]|USD|EUR|GBP|JPY|INR/i.test(raw)) return true;
        if (/,\d{3}/.test(raw)) return true;
        if (/\.\d{2}$/.test(raw)) return true;
        return false;
      })
      .map((m) => parseMoney(m[1]) ?? 0);

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
    }

    const description = line
      .replace(new RegExp(MONEY_RE_BASE.source, "g"), "")
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
