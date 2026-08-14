/**
 * clean-span.ts — shared utility for trimming trailing/leading punctuation
 * that commonly attaches to regex-extracted values (URLs, emails, phones,
 * dates, monetary amounts) in real prose.
 *
 * Every extractor MUST route display values through this before surfacing them.
 */

/**
 * Trim common trailing and leading punctuation from a regex match.
 * Handles: " ' ` ) ] } > ; : , . ! ? “ ” ‘ ’
 *
 * Does NOT trim from the middle of the string — only leading/trailing chars.
 * Also collapses internal runs of the same trailing punct to one (e.g. "))" -> ")").
 */
export function cleanExtractedSpan(raw: string): string {
  if (!raw) return raw;

  // Trailing punctuation characters to strip (ordered: most common first)
  const TRAILING = /["'`\)\]\}>;:,.!?\u201c\u201d\u2018\u2019]+$/;
  // Leading punctuation characters to strip
  const LEADING = /^["'`\(<\[\{;:,.!?\u201c\u201d\u2018\u2019]+/;

  let s = raw;

  // Iteratively strip trailing — handles "))" or "'," patterns
  let prev: string;
  do {
    prev = s;
    s = s.replace(TRAILING, "");
  } while (s !== prev);

  // Strip leading once
  s = s.replace(LEADING, "");

  return s;
}

/**
 * Clean an array of extracted spans (deduplicated after cleaning).
 */
export function cleanExtractedSpans(rawArr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawArr) {
    const cleaned = cleanExtractedSpan(raw);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      out.push(cleaned);
    }
  }
  return out;
}
