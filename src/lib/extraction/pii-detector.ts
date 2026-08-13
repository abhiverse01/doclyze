/**
 * PII (Personally Identifiable Information) detector.
 * Scans raw text for common PII patterns using deterministic regex.
 * No ML, no API calls — fully re-runnable.
 */

export interface PIIFinding {
  type: 'ssn' | 'credit_card' | 'national_id' | 'phone' | 'email' | 'address' | 'date_of_birth' | 'medical_term';
  value: string;
  masked: string;
  position: number;
  severity: 'high' | 'medium' | 'low';
}

// ─── Pattern definitions ──────────────────────────────────────────────────

interface PIIPattern {
  type: PIIFinding['type'];
  pattern: RegExp;
  severity: PIIFinding['severity'];
  masker: (match: string) => string;
}

/** Medical terms dictionary — presence of these makes nearby PII more sensitive */
const MEDICAL_TERMS = [
  'diabetes', 'hypertension', 'hiv', 'cancer', 'medication', 'dosage',
  'diagnosis', 'prescription', 'treatment', 'pathology', 'clinical',
  'prognosis', 'chemotherapy', 'radiation', 'biopsy', 'oncology',
  'cardiovascular', 'pulmonary', 'neurology', 'psychiatric', 'therapy',
];

/** Regex for common medical terms */
const MEDICAL_TERM_RE = new RegExp(
  `\\b(?:${MEDICAL_TERMS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
);

const PATTERNS: PIIPattern[] = [
  // SSN: 123-45-6789
  {
    type: 'ssn',
    pattern: /\b(\d{3})-(\d{2})-(\d{4})\b/,
    severity: 'high',
    masker: (m) => `${m[1]}-**-${m[3]}`,
  },
  // Credit card: 1234 5678 9012 3456 or 1234-5678-9012-3456
  {
    type: 'credit_card',
    pattern: /\b(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})[\s-]?(\d{4})\b/,
    severity: 'high',
    masker: (m) => `****-****-****-${m[4]}`,
  },
  // Phone numbers: various formats
  {
    type: 'phone',
    pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    severity: 'medium',
    masker: (m) => {
      const digits = m[0].replace(/\D/g, '');
      if (digits.length >= 10) {
        return `***-***-${digits.slice(-4)}`;
      }
      return '***-***-****';
    },
  },
  // Email addresses
  {
    type: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    severity: 'medium',
    masker: (m) => {
      const [local, domain] = m[0].split('@');
      if (local.length <= 2) return `**@${domain}`;
      return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}@${domain}`;
    },
  },
  // US passport: 9-digit number near the word "passport"
  {
    type: 'national_id',
    pattern: /passport[^.\n]{0,30}(\d{9})\b/i,
    severity: 'high',
    masker: (m) => {
      const numMatch = m[0].match(/\d{9}/);
      if (numMatch) return m[0].replace(numMatch[0], `${numMatch[0].slice(0, 2)}*******`);
      return '*********';
    },
  },
  // Date of birth: near "DOB" or "date of birth"
  {
    type: 'date_of_birth',
    pattern: /(?:dob|date\s+of\s+birth|birthdate|born)[\s:]*([\d]{1,2}[/\-][\d]{1,2}[/\-][\d]{2,4})/i,
    severity: 'high',
    masker: (m) => m[0].replace(/[\d]{1,2}[/\-][\d]{1,2}[/\-][\d]{2,4}/, '**/**/****'),
  },
];

// ─── Deduplication: track which character ranges have already been claimed ─
function isOverlapping(pos: number, len: number, claimed: Array<[number, number]>): boolean {
  for (const [start, end] of claimed) {
    if (pos < end && pos + len > start) return true;
  }
  return false;
}

/**
 * Detect PII in raw text.
 * Returns an array of findings sorted by position, with no overlapping ranges.
 */
export function detectPII(text: string): PIIFinding[] {
  const findings: PIIFinding[] = [];
  const claimed: Array<[number, number]> = [];

  // Scan each pattern
  for (const def of PATTERNS) {
    const re = new RegExp(def.pattern.source, def.pattern.flags.includes('g') ? def.pattern.flags : def.pattern.flags + 'g');
    let match;
    while ((match = re.exec(text)) !== null) {
      const fullMatch = match[0];
      const pos = match.index;

      // Skip if this range overlaps with a previously found finding
      if (isOverlapping(pos, fullMatch.length, claimed)) continue;

      claimed.push([pos, pos + fullMatch.length]);

      findings.push({
        type: def.type,
        value: fullMatch,
        masked: typeof def.masker === 'function' ? def.masker(match) : '***',
        position: pos,
        severity: def.severity,
      });
    }
  }

  // Scan for medical terms — flag nearby content as medium-severity medical context
  let medMatch;
  while ((medMatch = MEDICAL_TERM_RE.exec(text)) !== null) {
    const term = medMatch[0];
    const pos = medMatch.index;
    if (isOverlapping(pos, term.length, claimed)) continue;
    claimed.push([pos, pos + term.length]);

    findings.push({
      type: 'medical_term',
      value: term,
      masked: term,
      position: pos,
      severity: 'medium',
    });
  }

  // Sort by position
  findings.sort((a, b) => a.position - b.position);

  return findings;
}

/**
 * Summarize PII findings as a human-readable string for insights.
 */
export function summarizePII(findings: PIIFinding[]): string {
  if (findings.length === 0) return 'No PII detected.';

  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.type] = (counts[f.type] ?? 0) + 1;
  }

  const parts: string[] = [];
  const labels: Record<string, string> = {
    ssn: 'SSN(s)',
    credit_card: 'credit card number(s)',
    national_id: 'national ID(s)',
    phone: 'phone number(s)',
    email: 'email address(es)',
    address: 'address(es)',
    date_of_birth: 'date(s) of birth',
    medical_term: 'medical term(s)',
  };

  for (const [type, count] of Object.entries(counts)) {
    parts.push(`${count} ${labels[type] ?? type}`);
  }

  return parts.join(', ');
}
