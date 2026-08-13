/**
 * PII Redaction utility.
 * Takes text and a list of PII findings, replaces PII values with their masked versions.
 */

import type { PIIFinding } from "./pii-detector";

/**
 * Replace PII values in text with their masked equivalents.
 * Processes findings in reverse order to avoid position shifting.
 */
export function redactText(text: string, piiFindings: PIIFinding[]): string {
  if (piiFindings.length === 0) return text;

  // Work on a mutable copy, process from end to start to preserve positions
  let result = text;
  // Sort findings by position descending so replacements don't affect earlier positions
  const sorted = [...piiFindings].sort((a, b) => b.position - a.position);

  for (const finding of sorted) {
    // Replace the original value with the masked version at the known position
    const before = result.slice(0, finding.position);
    const after = result.slice(finding.position + finding.value.length);
    result = before + finding.masked + after;
  }

  return result;
}
