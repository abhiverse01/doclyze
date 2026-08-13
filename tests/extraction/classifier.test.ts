import { describe, it, expect } from 'vitest';
import { classifyDocument } from '@/lib/extraction/classifier';

const RESUME_TEXT = `
PROFESSIONAL SUMMARY
Experienced software engineer with 5 years of experience.

WORK EXPERIENCE
Senior Engineer at Tech Corp — 2020 to Present
Junior Developer at Startup Inc — 2018 to 2020

EDUCATION
Bachelor of Science in Computer Science — 2018

SKILLS
JavaScript, TypeScript, Python, React, Node.js
`;

const INVOICE_TEXT = `
INVOICE
Invoice No: INV-001
Bill To: Customer Corp
Description    Qty    Unit Price    Amount
Services       5      $100.00       $500.00
Subtotal: $500.00
Tax: $40.00
Total: $540.00
Payment Terms: Net 30
`;

const CONTRACT_TEXT = `
MASTER SERVICES AGREEMENT
This Agreement is entered into by and between Party A and Party B.

1. SCOPE OF SERVICES
Provider shall deliver services as described.

2. INDEMNIFICATION
Provider shall indemnify Client.

3. CONFIDENTIAL INFORMATION
All confidential information shall be protected.

4. GOVERNING LAW
This Agreement shall be governed by applicable law.

5. TERMINATION
Either party may terminate for convenience.
`;

describe('Classifier', () => {
  it('classifies resume text as resume', () => {
    const r = classifyDocument({ text: RESUME_TEXT, filename: 'document.txt' });
    expect(r.type).toBe('resume');
  });

  it('classifies invoice text as invoice', () => {
    const r = classifyDocument({ text: INVOICE_TEXT, filename: 'document.txt' });
    expect(r.type).toBe('invoice');
  });

  it('classifies contract text as contract', () => {
    const r = classifyDocument({ text: CONTRACT_TEXT, filename: 'document.txt' });
    expect(r.type).toBe('contract');
  });

  it('filename hints override content scoring', () => {
    const r = classifyDocument({ text: 'Some random text here.', filename: 'invoice-2024.pdf' });
    expect(r.type).toBe('invoice');
    expect(r.confidence).toBe('high');
  });

  it('contract filename hint works', () => {
    const r = classifyDocument({ text: 'Random content.', filename: 'master-agreement.pdf' });
    expect(r.type).toBe('contract');
    expect(r.confidence).toBe('high');
  });

  it('resume filename hint works', () => {
    const r = classifyDocument({ text: 'Random content.', filename: 'john_resume.pdf' });
    expect(r.type).toBe('resume');
    expect(r.confidence).toBe('high');
  });

  it('weak text with no filename hint falls to general', () => {
    const r = classifyDocument({ text: 'Hello world this is some text.', filename: 'notes.txt' });
    expect(r.type).toBe('general');
  });

  it('tabular file short-circuits to spreadsheet', () => {
    const r = classifyDocument({ text: 'a,b,c\n1,2,3', filename: 'data.csv', tabular: true });
    expect(r.type).toBe('spreadsheet');
    expect(r.confidence).toBe('high');
  });
});
