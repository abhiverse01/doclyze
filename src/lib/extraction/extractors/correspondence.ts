/**
 * Correspondence / formal letter extractor (v8)
 *
 * Extracts structured data from formal letters and correspondence:
 * - Business requests, cover letters, complaints, reference letters
 * - Identifies sender, recipient, subject, date, salutation, closing, signature
 * - Detects letter sub-type and extracts stated requests/asks
 */

import {
  ExtractedField,
  ExtractedTable,
  FieldGroup,
  Insight,
} from "../types";
import type { CorrespondenceDetails } from "../types";
import { cleanExtractedSpan, cleanExtractedSpans } from "../clean-span";

// ─── Patterns ────────────────────────────────────────────────────────────

const SALUTATION_RE = /^(?:Dear|To|Respected)\s+(?:Mr|Mrs|Ms|Dr|Prof|Sir|Madam|Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\.?\s*([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*)/im;

const CLOSING_RE = /^(?:Sincerely|Yours (?:sincerely|faithfully|truly)|Regards|Best regards|Warm regards|Respectfully|With regards),?/im;

const SUBJECT_RE = /^(?:Subject|Re|Reference)[\s:.]*(.+)$/im;

const DATE_RE = /\b(\d{1,2}[\s/-]\w{3,9}[\s/-]\d{2,4}|\d{4}[\s/-]\d{1,2}[\s/-]\d{1,2}|\w{3,9}\s+\d{1,2},?\s+\d{4})\b/;

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

const PHONE_RE = /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/;

const CC_RE = /(?:^|\n)\s*(?:CC|Cc|c\.?c\.?)[:\s]+(.+?)(?=\n|$)/gm;

const REF_RE = /(?:^|\n)\s*(?:Ref|Reference|Ref\.? No|Sr\.? No)[\s:.#]*([A-Za-z0-9/\-]+)/im;

// ─── Request detection ─────────────────────────────────────────────────

const REQUEST_PATTERNS = [
  /(?:please|kindly)\s+(?:\w+\s+){0,5}(?:register|process|approve|grant|issue|provide|send|schedule|arrange|confirm|review|consider)/i,
  /(?:we (?:request|would like|wish to|ask for|need|require))/i,
  /(?:i (?:request|would like|wish to|am writing to request|am applying for))/i,
  /(?:looking forward to)/i,
  /(?:thank you for)/i,
];

// ─── Letter type classification ──────────────────────────────────────────

function classifyLetterType(text: string, filename: string): CorrespondenceDetails["letterType"] {
  const lower = text.toLowerCase();
  const fn = filename.toLowerCase();

  if (/cover.?letter|application/.test(fn) || /\b(?:applying|application|position|role|opportunity)\b/.test(lower)) {
    return "cover_letter";
  }
  if (/complaint/.test(fn) || /\b(?:complaint|dissatisfied|unacceptable|resolve this issue|unsatisfactory)\b/.test(lower)) {
    return "complaint";
  }
  if (/reference/.test(fn) || /\b(?:recommend|recommendation|reference|attested|qualified|candidate)\b/.test(lower)) {
    return "reference";
  }
  if (/\b(?:request|register|grant|issue|license|permit|approval|domain)\b/.test(lower)) {
    return "business_request";
  }
  return "general";
}

// ─── Main extractor ──────────────────────────────────────────────────────

function f(
  key: string,
  label: string,
  value: string | null,
  confidence: "high" | "medium" | "low",
  provenance?: string
): ExtractedField {
  return { key, label, value, confidence, provenance };
}

export function extractCorrespondence(
  text: string,
  filename: string,
): {
  details: CorrespondenceDetails;
  fieldGroups: FieldGroup[];
  tables: ExtractedTable[];
  insights: Insight[];
  completeness: number;
} {
  const lines = text.split("\n");
  const first500 = text.slice(0, 500);
  const letterType = classifyLetterType(text, filename);

  // ─── Extract structured fields ────────────────────────────────────────

  // Salutation
  const salMatch = text.match(SALUTATION_RE);
  const salutation = salMatch ? salMatch[0].trim() : null;

  // Subject
  const subjMatch = text.match(SUBJECT_RE);
  const subject = subjMatch ? subjMatch[1].trim() : null;

  // Date
  const dateMatches = cleanExtractedSpans(
    Array.from(text.matchAll(new RegExp(DATE_RE.source, "g"))).map(m => m[0])
  );
  const date = dateMatches.length > 0 ? dateMatches[0] : null;

  // Closing
  const closingMatch = text.match(CLOSING_RE);
  const closing = closingMatch ? closingMatch[0].trim() : null;

  // Emails
  const emails = cleanExtractedSpans(
    Array.from(text.matchAll(new RegExp(EMAIL_RE.source, "g"))).map(m => m[0])
  );

  // Phone numbers
  const phones = cleanExtractedSpans(
    Array.from(text.matchAll(new RegExp(PHONE_RE.source, "g")))
      .map(m => m[0])
      .filter(p => p.replace(/\D/g, "").length >= 10)
  );

  // CC recipients
  const ccRecipients: string[] = [];
  let ccMatch;
  const ccRe = new RegExp(CC_RE.source, "gm");
  while ((ccMatch = ccRe.exec(text)) !== null) {
    const ccText = ccMatch[1].trim();
    // CC lines can have multiple recipients separated by commas or newlines
    const parts = ccText.split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
    ccRecipients.push(...parts);
  }

  // Reference number
  const refMatch = text.match(REF_RE);
  const referenceNumber = refMatch ? refMatch[1].trim() : null;

  // Sender and recipient detection
  // Heuristic: look at the block before the salutation (sender block)
  // and the block after "To:" or in the first 500 chars
  const sender = detectSender(lines, salutation);
  const recipient = detectRecipient(first500, salutation);
  const senderAddress = extractAddressBlock(text, sender);
  const recipientAddress = extractAddressBlock(text, recipient);

  // Signature name: last non-empty line before the end, or after closing
  const signatureName = detectSignatureName(lines, closing);

  // Body summary: text between salutation and closing
  const bodyText = extractBody(lines, salutation, closing);
  const bodySummary = bodyText.length > 200
    ? bodyText.slice(0, 200).trim() + "..."
    : bodyText || null;

  // Requests/asks
  const requests = extractRequests(text);

  // ─── Completeness ──────────────────────────────────────────────────────
  const expected = [
    salutation ? "salutation" : null,
    date ? "date" : null,
    subject ? "subject" : null,
    sender ? "sender" : null,
    recipient ? "recipient" : null,
    bodyText ? "body" : null,
    closing ? "closing" : null,
    signatureName ? "signature" : null,
    emails.length > 0 ? "contact" : null,
    requests.length > 0 ? "requests" : null,
  ];
  const completeness = Math.round(
    (expected.filter(Boolean).length / expected.length) * 100
  );

  // ─── Field groups ─────────────────────────────────────────────────────
  const headerGroup: FieldGroup = {
    id: "correspondence-header",
    title: "Letter Header",
    fields: [
      f("sender", "Sender", sender, sender ? "high" : "low"),
      f("senderAddress", "Sender address", senderAddress || null, senderAddress ? "medium" : "low"),
      f("recipient", "Recipient", recipient, recipient ? "high" : "low"),
      f("recipientAddress", "Recipient address", recipientAddress || null, recipientAddress ? "medium" : "low"),
      f("date", "Date", date, date ? "high" : "low"),
      f("subject", "Subject / Reference", subject, subject ? "high" : "low"),
      f("referenceNumber", "Reference number", referenceNumber, referenceNumber ? "high" : "medium"),
    ],
  };

  const contentGroup: FieldGroup = {
    id: "correspondence-content",
    title: "Letter Content",
    fields: [
      f("salutation", "Salutation", salutation, salutation ? "high" : "low"),
      f("bodySummary", "Body summary", bodySummary, bodySummary ? "high" : "low"),
      f("closing", "Closing", closing, closing ? "high" : "low"),
      f("signatureName", "Signature", signatureName, signatureName ? "high" : "low"),
      f("requests", "Stated requests/asks", requests.length > 0 ? requests.join("; ") : null, "medium"),
    ],
  };

  const contactGroup: FieldGroup = {
    id: "correspondence-contact",
    title: "Contact Information",
    fields: [
      f("emails", "Emails", emails.length > 0 ? emails.join("\n") : null, "high"),
      f("phones", "Phone numbers", phones.length > 0 ? phones.join("\n") : null, "medium"),
      f("ccRecipients", "CC recipients", ccRecipients.length > 0 ? ccRecipients.join("; ") : null, "medium"),
    ],
  };

  // ─── Tables ─────────────────────────────────────────────────────────────
  const tables: ExtractedTable[] = [];
  if (ccRecipients.length > 0) {
    tables.push({
      id: "cc-list",
      title: "CC Recipients",
      description: `${ccRecipients.length} CC recipient(s)`,
      columns: [
        { id: "name", label: "Name", type: "text" },
      ],
      rows: ccRecipients.map(name => ({ name })),
    });
  }

  // ─── Insights ───────────────────────────────────────────────────────────
  const insights: Insight[] = [];

  if (letterType) {
    insights.push({
      id: "letter-type",
      title: `Detected letter type: ${letterType.replace("_", " ")}`,
      body: `Based on content and filename analysis, this appears to be a ${letterType.replace("_", " ")} letter.`,
      severity: "info",
      category: "Classification",
    });
  }

  if (requests.length > 0) {
    insights.push({
      id: "requests-found",
      title: `${requests.length} request(s) or ask(s) detected`,
      body: `The letter contains ${requests.length} explicit request(s): ${requests.slice(0, 3).map(r => `"${r.slice(0, 60)}"`).join(", ")}${requests.length > 3 ? ", ..." : ""}.`,
      severity: "info",
      category: "Content",
    });
  }

  if (ccRecipients.length > 0) {
    insights.push({
      id: "cc-found",
      title: `${ccRecipients.length} CC recipient(s)`,
      body: `The letter is copied to: ${ccRecipients.join(", ")}.`,
      severity: "info",
      category: "Distribution",
    });
  }

  if (!subject) {
    insights.push({
      id: "no-subject",
      title: "No subject line detected",
      body: "The letter doesn't have a clear 'Subject:' line. This may reduce classification accuracy.",
      severity: "notice",
      category: "Structure",
    });
  }

  const details: CorrespondenceDetails = {
    sender,
    senderAddress: senderAddress || null,
    recipient,
    recipientAddress: recipientAddress || null,
    date,
    subject,
    salutation,
    bodySummary,
    closing,
    signatureName,
    requests,
    ccRecipients,
    referenceNumber,
    letterType,
  };

  return {
    details,
    fieldGroups: [headerGroup, contentGroup, contactGroup],
    tables,
    insights,
    completeness,
  };
}

// ─── Helper functions ──────────────────────────────────────────────────────

function detectSender(
  lines: string[],
  salutation: string | null,
): string | null {
  // Look for sender in lines before the salutation
  if (!salutation) {
    // Try to find a name-like line in the first 10 lines
    for (const line of lines.slice(0, 10)) {
      const trimmed = line.trim();
      if (trimmed.length >= 3 && trimmed.length <= 80 && /^[A-Z][a-z]/.test(trimmed)) {
        // Check if followed by contact info
        return trimmed;
      }
    }
    return null;
  }

  const salIdx = lines.findIndex(l => l.trim().toLowerCase().startsWith(salutation!.toLowerCase().split(" ")[0]));
  if (salIdx < 1) return null;

  // Look backwards from salutation for a name-like line
  for (let i = salIdx - 1; i >= Math.max(0, salIdx - 8); i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    // Name-like: starts with uppercase, no special chars, reasonable length
    if (trimmed.length >= 3 && trimmed.length <= 80 && /^[A-Z][a-zA-Z'\-\s.]+$/.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

function detectRecipient(
  first500: string,
  salutation: string | null,
): string | null {
  // Extract name from salutation ("Dear Mr. John Smith" → "John Smith")
  if (salutation) {
    const match = salutation.match(/(?:Dear|To|Respected)\s+(?:Mr|Mrs|Ms|Dr|Prof|Sir|Madam|Mr\.?|Mrs\.?|Ms\.?|Dr\.?)\.?\s*([A-Z][A-Za-z'\-]+(?:\s+[A-Z][A-Za-z'\-]+)*)/i);
    if (match) return match[1].trim();
  }

  // Look for "To:" line
  const toMatch = first500.match(/^To:\s*(.+)/im);
  if (toMatch) return toMatch[1].trim();

  return null;
}

function extractAddressBlock(text: string, name: string | null): string | null {
  if (!name) return null;
  const idx = text.indexOf(name);
  if (idx === -1) return null;

  // Look at the surrounding text (within 500 chars) for address-like content
  const context = text.slice(Math.max(0, idx - 50), Math.min(text.length, idx + name.length + 300));
  const addressLines = context
    .split("\n")
    .filter(l => {
      const t = l.trim();
      return t.length > 5 && t !== name && /\d/.test(t); // Has a number (street/zip)
    });

  return addressLines.length > 0 ? addressLines.join(", ") : null;
}

function detectSignatureName(
  lines: string[], closing: string | null): string | null {
  // Look for a name after the closing line
  if (closing) {
    const closeIdx = lines.findIndex(l => l.trim().toLowerCase().startsWith(closing.toLowerCase().split(",")[0].split(" ")[0]));
    if (closeIdx >= 0) {
      // Next non-empty line after closing is usually the signature name
      for (let i = closeIdx + 1; i < Math.min(lines.length, closeIdx + 5); i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        if (trimmed.length >= 3 && trimmed.length <= 80 && /^[A-Z][a-zA-Z'\-\s.]+$/.test(trimmed)) {
          return trimmed;
        }
      }
    }
  }

  // Fallback: last non-empty lines (signature block is usually at the end)
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length >= 2) {
    const lastLine = nonEmpty[nonEmpty.length - 1].trim();
    if (lastLine.length >= 3 && lastLine.length <= 80 && /^[A-Z][a-zA-Z'\-\s.]+$/.test(lastLine)) {
      return lastLine;
    }
  }

  return null;
}

function extractBody(lines: string[], salutation: string | null, closing: string | null): string {
  let startIdx = 0;
  let endIdx = lines.length;

  if (salutation) {
    startIdx = lines.findIndex(l => l.trim().toLowerCase().startsWith(salutation.toLowerCase().split(" ")[0]));
    if (startIdx >= 0) startIdx++;
  }

  if (closing) {
    const closeIdx = lines.findIndex(l => l.trim().toLowerCase().startsWith(closing.toLowerCase().split(",")[0].split(" ")[0]));
    if (closeIdx >= 0) endIdx = closeIdx;
  }

  return lines.slice(startIdx, endIdx)
    .map(l => l.trim())
    .filter(Boolean)
    .join(" ");
}

function extractRequests(text: string): string[] {
  const requests: string[] = [];
  const sentences = text.split(/[.!?]+/);

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 10 || trimmed.length > 300) continue;

    for (const pattern of REQUEST_PATTERNS) {
      if (pattern.test(trimmed)) {
        // Clean up the matched sentence
        const clean = trimmed.replace(/\s+/g, " ").trim();
        if (clean.length >= 10 && !requests.includes(clean)) {
          requests.push(clean);
        }
        break;
      }
    }

    if (requests.length >= 5) break;
  }

  return requests;
}
