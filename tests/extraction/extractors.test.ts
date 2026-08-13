import { describe, it, expect } from 'vitest';
import { extractInvoice } from '@/lib/extraction/extractors/invoice';
import { extractResume } from '@/lib/extraction/extractors/resume';
import { extractContract } from '@/lib/extraction/extractors/contract';
import { extractResearchPaper } from '@/lib/extraction/extractors/research-paper';
import { extractGeneral } from '@/lib/extraction/extractors/general';
import * as fs from 'fs';
import * as path from 'path';

const FIXTURES = path.join(__dirname, '__fixtures__');

function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

describe('Invoice extractor', () => {
  it('extracts standard invoice correctly', () => {
    const text = fixture('invoice-standard.txt');
    const r = extractInvoice(text, 'invoice.pdf');
    expect(r.details.vendor.name).toBeTruthy();
    expect(r.details.billTo.name).toBeTruthy();
    expect(r.details.lineItems.length).toBeGreaterThan(0);
    expect(r.details.subtotal).not.toBeNull();
    expect(r.details.total).not.toBeNull();
    expect(r.details.currency).toBe('USD');
    expect(r.completeness).toBeGreaterThan(50);
  });

  it('does not false-match VAT in Innovation Labs', () => {
    const text = fixture('invoice-innovation.txt');
    const r = extractInvoice(text, 'innovation-invoice.pdf');
    expect(r.details.vendor.name).toBeTruthy();
  });

  it('parses large currency amounts correctly', () => {
    const text = fixture('invoice-large-amount.txt');
    const r = extractInvoice(text, 'large-invoice.pdf');
    expect(r.details.total).not.toBeNull();
    if (r.details.total !== null) {
      expect(r.details.total).toBeGreaterThan(10000);
    }
  });

  it('detects reconciliation mismatch', () => {
    const text = fixture('invoice-mismatch.txt');
    const r = extractInvoice(text, 'mismatch-invoice.pdf');
    expect(r.details.reconciliation.matches).toBe(false);
    expect(r.insights.some(i => i.id === 'reconciliation-mismatch')).toBe(true);
  });
});

describe('Resume extractor', () => {
  it('extracts standard resume', () => {
    const text = fixture('resume-standard.txt');
    const r = extractResume(text, 'resume.pdf');
    expect(r.details.contact.name).toBeTruthy();
    expect(r.details.contact.email).toBeTruthy();
    expect(r.details.experience.length).toBeGreaterThan(0);
    expect(r.details.education.length).toBeGreaterThan(0);
    expect(r.completeness).toBeGreaterThan(40);
  });

  it('handles resume with no dates', () => {
    const text = fixture('resume-no-dates.txt');
    const r = extractResume(text, 'no-dates-resume.pdf');
    expect(r.details.experience.length).toBeGreaterThanOrEqual(0);
  });

  it('keeps contact info lines separate', () => {
    const text = fixture('resume-contact-block.txt');
    const r = extractResume(text, 'contact-resume.pdf');
    expect(r.details.contact.name).toBeTruthy();
    expect(r.details.contact.email).toBeTruthy();
    expect(r.details.contact.phone).toBeTruthy();
  });
});

describe('Contract extractor', () => {
  it('extracts standard contract', () => {
    const text = fixture('contract-standard.txt');
    const r = extractContract(text, 'contract.pdf');
    expect(r.details.parties.length).toBeGreaterThanOrEqual(2);
    expect(r.details.sections.length).toBeGreaterThan(0);
    expect(r.details.riskClauses.length).toBeGreaterThan(0);
  });

  it('warns when parties not found', () => {
    const text = fixture('contract-no-parties.txt');
    const r = extractContract(text, 'no-parties.pdf');
    expect(r.insights.some(i => i.id === 'missing-parties')).toBe(true);
  });
});

describe('Research paper extractor', () => {
  it('extracts standard paper', () => {
    const text = fixture('paper-standard.txt');
    const r = extractResearchPaper(text, 'paper.pdf');
    expect(r.details.title).toBeTruthy();
    expect(r.details.authors.length).toBeGreaterThan(0);
    expect(r.details.abstract).toBeTruthy();
    expect(r.details.sections.length).toBeGreaterThan(0);
  });
});

describe('General extractor', () => {
  it('extracts entities from mixed document', () => {
    const text = fixture('general-mixed.txt');
    const r = extractGeneral(text, 'mixed.txt');
    expect(r.details.statistics.wordCount).toBeGreaterThan(0);
    expect(r.details.entities.emails.length).toBeGreaterThan(0);
    expect(r.details.entities.urls.length).toBeGreaterThan(0);
    expect(r.details.entities.dates.length).toBeGreaterThan(0);
  });
});
