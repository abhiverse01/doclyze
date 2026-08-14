/**
 * v6: Tests for cleanExtractedSpan utility.
 * Validates that regex-extracted values have trailing/leading punctuation trimmed.
 */
import { describe, it, expect } from "vitest";
import { cleanExtractedSpan, cleanExtractedSpans } from "@/lib/extraction/clean-span";

describe("cleanExtractedSpan", () => {
  // Section 0, Defect #1: URL with trailing double-quote
  it('strips trailing double-quote from URL', () => {
    expect(cleanExtractedSpan('https://github.com/abhiverse01"')).toBe('https://github.com/abhiverse01');
  });

  it('strips trailing period from URL (end of sentence)', () => {
    expect(cleanExtractedSpan('Visit https://example.com.')).toBe('Visit https://example.com');
  });

  it('strips trailing closing paren from URL', () => {
    expect(cleanExtractedSpan('(see https://example.com)')).toBe('see https://example.com');
  });

  it('strips leading opening paren from URL', () => {
    expect(cleanExtractedSpan('(https://example.com/path)')).toBe('https://example.com/path');
  });

  it('strips both leading and trailing quotes', () => {
    expect(cleanExtractedSpan('"https://example.com"')).toBe('https://example.com');
  });

  it('strips trailing comma from email', () => {
    expect(cleanExtractedSpan('user@example.com,')).toBe('user@example.com');
  });

  it('strips trailing semicolon from URL', () => {
    expect(cleanExtractedSpan('https://example.com;')).toBe('https://example.com');
  });

  it('strips multiple trailing punct chars iteratively', () => {
    expect(cleanExtractedSpan('https://example.com",')).toBe('https://example.com');
  });

  it('does not strip punctuation from the middle of a string', () => {
    expect(cleanExtractedSpan('https://example.com/path?q=test&other=1')).toBe('https://example.com/path?q=test&other=1');
  });

  it('returns empty string for null-ish input', () => {
    expect(cleanExtractedSpan('')).toBe('');
  });

  it('handles already-clean values', () => {
    expect(cleanExtractedSpan('https://example.com')).toBe('https://example.com');
  });

  it('strips trailing colon', () => {
    expect(cleanExtractedSpan('https://example.com:')).toBe('https://example.com');
  });

  it('strips leading angle bracket', () => {
    expect(cleanExtractedSpan('<https://example.com>')).toBe('https://example.com');
  });
});

describe("cleanExtractedSpans", () => {
  it('deduplicates after cleaning', () => {
    const input = ['https://example.com', 'https://example.com', 'https://other.com'];
    const result = cleanExtractedSpans(input);
    expect(result).toEqual(['https://example.com', 'https://other.com']);
  });

  it('cleans and deduplicates URLs with varying trailing punctuation', () => {
    const input = ['https://example.com.', 'https://example.com"', 'https://example.com'];
    const result = cleanExtractedSpans(input);
    expect(result).toEqual(['https://example.com']);
  });

  it('returns empty array for empty input', () => {
    expect(cleanExtractedSpans([])).toEqual([]);
  });
});
