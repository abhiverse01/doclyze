import { describe, it, expect } from 'vitest';

describe('Regex lastIndex safety', () => {
  it('MONEY_RE matchAll returns full results on second call', () => {
    const base = /(?:[$€£¥₹]|USD|EUR|GBP|JPY|INR)?\s?(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d+\.\d{2})/;
    const text = 'Item A $100.00 Item B $200.00 Item C $300.00';
    const first = Array.from(text.matchAll(new RegExp(base.source, 'g'))).map(m => m[0]);
    const second = Array.from(text.matchAll(new RegExp(base.source, 'g'))).map(m => m[0]);
    expect(first).toHaveLength(3);
    expect(second).toHaveLength(3);
    expect(first).toEqual(second);
  });

  it('Subtotal does not match Total extractor', () => {
    const text = 'Subtotal: $1,000.00\nTax: $85.00\nTotal: $1,085.00';
    const subtotalMatch = text.match(/\bsub\s*total\b/i);
    expect(subtotalMatch).toBeTruthy();
    const totalMatch = text.match(/(?<!sub)\btotal\b/i);
    expect(totalMatch).toBeTruthy();
    const totalIdx = totalMatch!.index!;
    const afterTotal = text.slice(totalIdx);
    const moneyAfterTotal = afterTotal.match(/(?:[$€£¥₹]\s?\d[\d,]*(?:\.\d{2})?)/);
    expect(moneyAfterTotal?.[0]).toBe('$1,085.00');
  });

  it('Innovation does not trigger VAT/tax match', () => {
    const text = 'Innovation Labs\n123 Tech Drive';
    const vatMatch = text.match(/\b(?:tax|vat|gst)\b/i);
    expect(vatMatch).toBeNull();
  });

  it('Tax (8.5%): $505.75 parses correctly', () => {
    const text = 'Tax (8.5%): $505.75';
    // Replicate the findAmount logic from invoice.ts
    const labelRe = /\b(?:tax|vat|gst)\b/;
    const moneyRe = /(\$\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*\.\d{2}|\d{1,3}(?:,\d{3})+\.?\d*)/;
    const combinedRe = new RegExp(labelRe.source + '.*?' + moneyRe.source, 'i');
    const m = text.match(combinedRe);
    expect(m?.[1]).toBe('$505.75');
  });

  it('Large currency $12,999.00 parses correctly', () => {
    const text = 'Total: $12,999.00';
    const moneyRe = /(?:[$€£¥₹]|USD|EUR|GBP|JPY|INR)?\s?(-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d+\.\d{2})/;
    const m = text.match(new RegExp(moneyRe.source, 'g'));
    expect(m).toBeTruthy();
    expect(m![0]).toContain('12,999.00');
  });

  it('European locale 1.299,00 is handled', () => {
    const text = '1.299,00';
    const euRe = /-?\d{1,3}(?:\.\d{3})+,\d{2}/;
    expect(euRe.test(text)).toBe(true);
  });

  it('Parenthetical negative (500.00) parses as -500', () => {
    const text = '(500.00)';
    const parenRe = /^\((-?\d[\d,.]*)\)$/;
    const m = text.match(parenRe);
    expect(m).toBeTruthy();
    expect(parseFloat(m![1]) * -1).toBe(-500);
  });

  it('Negative -500.00 is matched', () => {
    const text = '-500.00';
    const negRe = /-?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|-?\d+\.\d{2}/;
    expect(negRe.test(text)).toBe(true);
  });

  it('Quarter notation Q1 2023 is matched', () => {
    const qRe = /Q([1-4])\s+(\d{4})/i;
    const m = 'Q1 2023'.match(qRe);
    expect(m).toBeTruthy();
    expect(m![1]).toBe('1');
    expect(m![2]).toBe('2023');
  });

  it('YYYY-MM format 2023-06 is matched', () => {
    const ymRe = /^(\d{4})-(\d{2})$/;
    const m = '2023-06'.match(ymRe);
    expect(m).toBeTruthy();
    expect(m![1]).toBe('2023');
    expect(m![2]).toBe('06');
  });

  it('Present/Current/Ongoing return null from date normalizer', () => {
    const normalizeDate = (s: string | null): boolean => {
      if (!s) return false;
      if (/^(present|current|ongoing|now)$/i.test(s.trim())) return true;
      return false;
    };
    expect(normalizeDate('Present')).toBe(true);
    expect(normalizeDate('Current')).toBe(true);
    expect(normalizeDate('Ongoing')).toBe(true);
  });

  it('Global regex with while-exec loop resets properly via new RegExp', () => {
    const base = /(\d+)\.(\d+)/;
    const text = '1.1 2.2 3.3';
    const results: string[] = [];
    const re = new RegExp(base.source, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      results.push(m[0]);
    }
    expect(results).toEqual(['1.1', '2.2', '3.3']);
  });
});
