/**
 * Text normalization helpers — used by every parser before extraction runs.
 *
 * No magic, no LLM — pure deterministic transforms. Same input → same output.
 */

/** De-hyphenate line-wrapped words: "computed\nre-\nning" → "computing". */
export function dehyphenate(text: string): string {
  // Matches a lowercase letter, hyphen, newline, optional indentation, lowercase letter.
  return text.replace(/([a-z])-\s*\n\s*([a-z])/g, "$1$2");
}

/** Collapse runs of whitespace (within a line) but preserve paragraph breaks. */
export function normalizeWhitespace(text: string): string {
  return text
    .split(/\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Reconstruct paragraph boundaries.
 *
 * Heuristic:
 * - A blank line always separates paragraphs.
 * - A single newline also separates paragraphs UNLESS the previous line
 *   looks like a soft-wrapped continuation: ends with a word character
 *   (no terminal punctuation), is reasonably long (>40 chars), AND the
 *   next line starts with a lowercase letter or a coordinating conjunction.
 *
 * This avoids joining resume contact blocks (multiple short standalone lines)
 * while still joining soft-wrapped prose paragraphs.
 */
export function reconstructParagraphs(text: string): string {
  const lines = text.split(/\n/);
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) {
      out.push(buf.join(" "));
      buf = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      flush();
      continue;
    }
    const prev = buf[buf.length - 1];
    if (prev !== undefined) {
      // Should we start a new paragraph?
      const prevEndsSentence = /[.!?:,;]\s*$/.test(prev);
      const prevIsLong = prev.length > 40;
      const nextStartsLower = /^[a-z]/.test(line.trim());
      const nextStartsConjunction = /^(and|or|but|the|a|an|in|on|with|for|to)\s/i.test(line.trim());

      // New paragraph if: prev ended a sentence, OR
      // prev was short (likely a standalone line like a heading/contact), OR
      // next starts with a capital letter and prev was a short line
      if (prevEndsSentence || !prevIsLong || (!nextStartsLower && !nextStartsConjunction)) {
        flush();
      }
    }
    buf.push(line.trim());
  }
  flush();
  return out.join("\n\n");
}

export function normalizeText(text: string): string {
  return reconstructParagraphs(normalizeWhitespace(dehyphenate(text)));
}

/** Count syllables in a word — coarse heuristic for Flesch-Kincaid. */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  // Strip silent trailing e
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  const matches = stripped.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

/** Split text into sentences — coarse, but enough for FK. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function countWords(text: string): number {
  const m = text.trim().match(/\b[\w'-]+\b/g);
  return m ? m.length : 0;
}

/** Flesch-Kincaid Reading Ease + Grade Level. Real implementation. */
export function fleschKincaid(text: string): { score: number; grade: number } {
  const sentences = splitSentences(text);
  const words = (text.match(/\b[\w'-]+\b/g) ?? []) as string[];
  const sentenceCount = Math.max(sentences.length, 1);
  const wordCount = Math.max(words.length, 1);
  const syllableCount = Math.max(
    words.reduce((acc, w) => acc + countSyllables(w), 0),
    1
  );
  const score =
    206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount);
  const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59;
  return {
    score: Math.max(0, Math.min(100, Math.round(score * 10) / 10)),
    grade: Math.max(0, Math.round(grade * 10) / 10),
  };
}

export function readingTimeMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / 220));
}
