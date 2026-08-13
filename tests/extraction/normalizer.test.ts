import { describe, it, expect } from 'vitest';
import { normalizeText, dehyphenate, fleschKincaid, countWords } from '@/lib/extraction/normalize';

describe('normalizeText', () => {
  it('does not merge short separate lines (resume contact block)', () => {
    const text = 'Alice Chen\nalice@tech.com\n(555) 123-4567\nSan Jose, CA';
    const result = normalizeText(text);
    // Each line should stay as a separate paragraph
    const lines = result.split(/\n\n+/);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    // Name should not be merged with email
    expect(lines[0]).toContain('Alice Chen');
    expect(lines[0]).not.toContain('alice@tech.com');
  });

  it('joins soft-wrapped prose lines', () => {
    // Lines >40 chars that end without terminal punctuation and next line starts lowercase
    // should be joined by reconstructParagraphs
    const text = 'This is a very long sentence that continues on and on to the next\nline because it was soft-wrapped by the editor and is part of the same paragraph.';
    const result = normalizeText(text);
    // Should be joined into one paragraph
    const lines = result.split(/\n\n+/);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('same paragraph.');
  });

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  it('handles single line', () => {
    expect(normalizeText('Hello world')).toBe('Hello world');
  });
});

describe('dehyphenate', () => {
  it('joins wrapped words with hyphen', () => {
    const text = 'The quick brown fox jum-\nped over the lazy dog.';
    expect(dehyphenate(text)).toBe('The quick brown fox jumped over the lazy dog.');
  });

  it('joins with indentation and hyphen', () => {
    const text = 'compu-\n  ter';
    expect(dehyphenate(text)).toBe('computer');
  });

  it('does not join uppercase-lowercase across lines', () => {
    const text = 'Hello\nWorld';
    expect(dehyphenate(text)).toBe('Hello\nWorld');
  });
});

describe('fleschKincaid', () => {
  it('returns valid score for simple text', () => {
    const text = 'The cat sat on the mat. The dog ran in the park.';
    const fk = fleschKincaid(text);
    expect(fk.score).toBeGreaterThanOrEqual(0);
    expect(fk.score).toBeLessThanOrEqual(100);
    expect(fk.grade).toBeGreaterThanOrEqual(0);
  });

  it('returns valid score for complex text', () => {
    const text = 'The implementation of sophisticated algorithmic methodologies necessitates comprehensive computational infrastructure. Consequently, the optimization of these processes requires meticulous consideration of numerous interdependent variables.';
    const fk = fleschKincaid(text);
    expect(fk.score).toBeGreaterThanOrEqual(0);
    expect(fk.score).toBeLessThanOrEqual(100);
    expect(fk.grade).toBeGreaterThanOrEqual(0);
  });

  it('handles empty string gracefully', () => {
    const fk = fleschKincaid('');
    expect(fk.score).toBeGreaterThanOrEqual(0);
    expect(fk.score).toBeLessThanOrEqual(100);
  });
});

describe('countWords', () => {
  it('counts words correctly', () => {
    expect(countWords('Hello world')).toBe(2);
    expect(countWords('The quick brown fox jumps over the lazy dog')).toBe(9);
    expect(countWords('')).toBe(0);
  });
});
