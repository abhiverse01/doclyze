/**
 * v8: OCR confidence analysis tests
 * Tests the gibberish heuristic, noise segmentation, and
 * confidence score integration.
 */

import { describe, it, expect } from 'vitest';
import { analyzeOCRConfidence, gibberishScore } from '@/lib/extraction/ocr-confidence';

// We test the public API; gibberishScore is exported for testability
// but in practice is only called internally by analyzeOCRConfidence.

describe('OCR confidence analysis', () => {
  describe('analyzeOCRConfidence', () => {
    it('returns all-high-confidence for clean text', () => {
      const lines = [
        { text: 'Dear Sir or Madam,', confidence: 95 },
        { text: 'I am writing to request a domain registration for mercantile.com.np.', confidence: 92 },
        { text: 'The company Communications Pvt. Ltd. is based in Kathmandu.', confidence: 88 },
        { text: 'Sincerely, Abhishek Shah', confidence: 90 },
      ];
      const result = analyzeOCRConfidence(lines);
      expect(result.highConfidenceRatio).toBeGreaterThan(0.9);
      expect(result.lowConfidenceText).toBe('');
      expect(result.highConfidenceText).toContain('Dear Sir');
      expect(result.meanConfidence).toBeGreaterThan(85);
    });

    it('filters out OCR noise lines (stamp/logo hallucination)', () => {
      const lines = [
        { text: 'Dear Sir or Madam,', confidence: 95 },
        { text: 'I am writing to request a domain registration.', confidence: 92 },
        { text: 'Be EE Fp', confidence: 15 },        // OCR garbage from stamp
        { text: 'TR', confidence: 8 },                 // OCR garbage
        { text: 'BY SRR', confidence: 12 },             // OCR garbage
        { text: 'Fe Se Ss', confidence: 10 },           // OCR garbage
        { text: 'CT deReewteme | VIC BmBachen WidNed', confidence: 5 }, // OCR garbage
        { text: 'Sincerely, Abhishek Shah', confidence: 90 },
        { text: '+9779815873277', confidence: 85 },      // Phone number
      ];
      const result = analyzeOCRConfidence(lines);

      // Noise lines should be excluded from high-confidence text
      expect(result.highConfidenceText).not.toContain('Be EE Fp');
      expect(result.highConfidenceText).not.toContain('BY SRR');
      expect(result.highConfidenceText).not.toContain('Fe Se Ss');
      expect(result.highConfidenceText).not.toContain('CT deReewteme');

      // Real content should be preserved
      expect(result.highConfidenceText).toContain('Dear Sir');
      expect(result.highConfidenceText).toContain('domain registration');
      expect(result.highConfidenceText).toContain('Sincerely');
      expect(result.highConfidenceText).toContain('+9779815873277');

      // Noise should be in low-confidence text
      expect(result.lowConfidenceText).toContain('Be EE Fp');
      expect(result.lowConfidenceText).toContain('BY SRR');

      // High confidence ratio should be reasonable (most content chars are real)
      expect(result.highConfidenceRatio).toBeGreaterThan(0.5);
    });

    it('handles empty input', () => {
      const result = analyzeOCRConfidence([]);
      expect(result.highConfidenceText).toBe('');
      expect(result.lowConfidenceText).toBe('');
      expect(result.highConfidenceRatio).toBe(1);
      expect(result.meanConfidence).toBe(0);
    });

    it('handles all-noise input', () => {
      const lines = [
        { text: 'Be EE Fp', confidence: 10 },
        { text: 'TR', confidence: 5 },
        { text: 'BY SRR', confidence: 8 },
      ];
      const result = analyzeOCRConfidence(lines);
      // Everything should be noise
      expect(result.highConfidenceText).toBe('');
      expect(result.lowConfidenceText).toContain('Be EE Fp');
    });

    it('mixed confidence with moderate gibberish', () => {
      const lines = [
        { text: 'The quick brown fox jumps over the lazy dog.', confidence: 88 },
        { text: 'XY ZZ WW', confidence: 45 },  // Moderate confidence, but gibberish content
        { text: 'This is a real sentence with common words.', confidence: 82 },
      ];
      const result = analyzeOCRConfidence(lines);
      // The gibberish line should be filtered
      expect(result.highConfidenceText).not.toContain('XY ZZ WW');
      expect(result.highConfidenceText).toContain('quick brown fox');
      expect(result.highConfidenceText).toContain('real sentence');
    });

    it('does not filter lines that have some dictionary words', () => {
      const lines = [
        { text: 'The company is located in Kathmandu Nepal', confidence: 75 },
        { text: 'For further information please contact', confidence: 70 },
      ];
      const result = analyzeOCRConfidence(lines);
      // Both lines should pass — they have common English words
      expect(result.highConfidenceText).toContain('company');
      expect(result.highConfidenceText).toContain('further information');
      expect(result.highConfidenceRatio).toBeGreaterThan(0.9);
    });

    it('filters all-caps lines with no dictionary words', () => {
      const lines = [
        { text: 'BE EE FP TR BY SRR', confidence: 20 },
        { text: 'This is a normal sentence.', confidence: 90 },
      ];
      const result = analyzeOCRConfidence(lines);
      expect(result.highConfidenceText).not.toContain('BE EE FP');
      expect(result.highConfidenceText).toContain('normal sentence');
    });

    it('filters pure punctuation/symbol lines', () => {
      const lines = [
        { text: '---===+++===---', confidence: 30 },
        { text: 'Real text here.', confidence: 90 },
      ];
      const result = analyzeOCRConfidence(lines);
      expect(result.highConfidenceText).not.toContain('---===');
      expect(result.highConfidenceText).toContain('Real text');
    });

    it('preserves phone numbers and emails in high-confidence text', () => {
      const lines = [
        { text: 'Contact: +9779815873277', confidence: 85 },
        { text: 'Email: test@example.com', confidence: 88 },
        { text: 'Be EE Fp', confidence: 10 },
      ];
      const result = analyzeOCRConfidence(lines);
      expect(result.highConfidenceText).toContain('+9779815873277');
      expect(result.highConfidenceText).toContain('test@example.com');
      expect(result.highConfidenceText).not.toContain('Be EE Fp');
    });
  });
});
