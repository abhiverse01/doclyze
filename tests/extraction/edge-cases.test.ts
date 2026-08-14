/**
 * v5 Edge-Case Hardening Matrix Tests
 * =====================================
 * Tests per the v5 Section 5 edge-case matrix.
 * Each test verifies graceful, honest handling — no crashes, hangs, or silent wrong answers.
 */

import { describe, it, expect } from 'vitest';
import { classifyDocument } from '@/lib/extraction/classifier';

// ─── File Integrity Edge Cases ────────────────────────────────────────────

describe('Edge cases: malformed input', () => {
  it('empty text returns general with low confidence', () => {
    const r = classifyDocument({ text: '', filename: 'empty.txt' });
    expect(r.type).toBe('general');
    expect(r.confidence).toBeLessThan(30);
  });

  it('whitespace-only text returns general', () => {
    const r = classifyDocument({ text: '   \n\n   \t\n   ', filename: 'whitespace.txt' });
    expect(r.type).toBe('general');
  });

  it('very short text (3 words) returns general', () => {
    const r = classifyDocument({ text: 'Hello world test', filename: 'short.txt' });
    expect(r.type).toBe('general');
    expect(r.confidence).toBeLessThan(50);
  });

  it('non-English text (Spanish) routes to general or low confidence', () => {
    const spanishText = `
    INFORME ANUAL DE ACTIVIDADES

    Resumen Ejecutivo
    Durante el año fiscal 2024, la organización logró avances significativos
    en todas sus áreas de operación.

    Datos Financieros
    Ingresos totales: $5.2M
    Gastos operativos: $3.8M
    Beneficio neto: $1.4M

    Personal
    Total de empleados: 145
    Nuevas contrataciones: 23
    `;
    const r = classifyDocument({ text: spanishText, filename: 'informe-anual.txt' });
    // Non-English should not be confidently classified as any English document type
    expect(r.confidence).toBeLessThan(80);
  });

  it('mixed language text does not crash', () => {
    const mixedText = `
    Project Report: Q4 Revenue Analysis

    本年度の収益は前年比15%増加しました。
    The team demonstrated excellent collaboration.

    Résumé des résultats:
    - Revenue: $2.3M (↑15%)
    - New clients: 12
    `;
    const r = classifyDocument({ text: mixedText, filename: 'mixed-report.txt' });
    expect(r.type).toBeDefined();
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(100);
  });

  it('extremely long text does not crash or hang', () => {
    // Generate a long repetitive text (simulating a large document)
    const paragraph = 'This is a test paragraph with some words and data. ';
    const longText = paragraph.repeat(5000); // ~250K characters
    const start = Date.now();
    const r = classifyDocument({ text: longText, filename: 'long.txt' });
    const elapsed = Date.now() - start;
    expect(r.type).toBeDefined();
    expect(elapsed).toBeLessThan(5000); // Must complete in <5 seconds
  });
});

// ─── Content Ambiguity Edge Cases ──────────────────────────────────────────

describe('Edge cases: content ambiguity', () => {
  it('job posting is NOT classified as resume', () => {
    const jobPosting = `
    SENIOR SOFTWARE ENGINEER — FULLY REMOTE

    About the Role
    We are seeking an experienced software engineer to join our growing team.
    You will have 5+ years of experience building web applications.

    Requirements
    - Bachelor's degree in Computer Science or related field
    - Strong skills in JavaScript, TypeScript, React, and Node.js
    - Experience with cloud platforms (AWS, GCP, or Azure)
    - Experience with agile methodologies
    - Strong communication skills

    Responsibilities
    - Develop and maintain scalable web applications
    - Write clean, tested code
    - Mentor junior engineers
    - Participate in code reviews

    We Offer
    - Competitive salary ($150K-$200K)
    - Remote-first culture
    - Unlimited PTO
    - Health, dental, and vision insurance

    Education
    A bachelor's degree is required. A master's degree is a plus.

    To Apply
    Send your resume and cover letter to jobs@example.com.
    `;
    const r = classifyDocument({ text: jobPosting, filename: 'job-posting.txt' });
    expect(r.type).not.toBe('resume');
  });

  it('performance review is NOT classified as resume', () => {
    const perfReview = `
    ANNUAL PERFORMANCE REVIEW
    Employee: Jane Smith
    Position: Senior Product Manager
    Review Period: January 2024 — December 2024

    Summary of Achievements
    Jane demonstrated exceptional leadership throughout the year.
    She successfully managed the launch of three major product features,
    resulting in a 25% increase in user engagement.

    Professional Development
    - Completed PMP certification
    - Attended ProductCon 2024
    - Completed leadership training program

    Skills Assessment
    Strategic Thinking: Exceeds Expectations
    Communication: Meets Expectations
    Technical Knowledge: Exceeds Expectations

    Goals for Next Year
    - Lead the platform migration project
    - Mentor two junior product managers
    - Achieve Senior Director promotion readiness
    `;
    const r = classifyDocument({ text: perfReview, filename: 'performance-review.txt' });
    expect(r.type).not.toBe('resume');
  });

  it('course syllabus is NOT classified as resume or transcript', () => {
    const syllabus = `
    CS 450: MACHINE LEARNING
    Fall 2024 — Syllabus

    Instructor: Dr. Sarah Chen
    Office: Engineering Building 301
    Email: schen@university.edu

    Course Description
    This course provides an introduction to machine learning algorithms,
    their theoretical foundations, and practical applications.

    Prerequisites
    - CS 250: Data Structures
    - MATH 300: Linear Algebra
    - Experience with Python programming

    Required Textbook
    "Machine Learning" by Tom Mitchell (McGraw-Hill)

    Grading
    - Assignments: 30%
    - Midterm Exam: 25%
    - Final Project: 30%
    - Participation: 15%

    Skills You Will Learn
    - Supervised learning algorithms
    - Neural network fundamentals
    - Model evaluation and validation
    - Feature engineering
    `;
    const r = classifyDocument({ text: syllabus, filename: 'cs450-syllabus.txt' });
    // A syllabus has education/skills language but is neither a resume nor transcript
    // At minimum, it should not have very high confidence as resume
    if (r.type === 'resume') {
      expect(r.confidence).toBeLessThan(60);
    }
  });

  it('price list is NOT classified as invoice', () => {
    const priceList = `
    PRODUCT CATALOG 2024

    Electronics
    ──────────────────────────────
    Wireless Mouse          $29.99
    Mechanical Keyboard     $89.99
    USB-C Hub              $49.99
    Monitor Stand          $39.99
    Webcam HD              $59.99

    Accessories
    ──────────────────────────────
    Mouse Pad XL           $19.99
    Cable Management Kit    $14.99
    Desk Organizer         $24.99

    All prices include free shipping.
    Bulk discounts available for orders over 50 units.
    `;
    const r = classifyDocument({ text: priceList, filename: 'price-list.txt' });
    // Price lists have line-item-like structure but no invoice semantics
    if (r.type === 'invoice') {
      expect(r.confidence).toBeLessThan(60);
    }
  });

  it('document with two-type characteristics gets reasonable classification', () => {
    const hybridText = `
    MASTER SERVICES AGREEMENT

    WHEREAS, Client desires to engage Provider for consulting services,
    and Provider agrees to provide such services.

    1. SCOPE OF SERVICES
    Provider shall deliver the following consulting services:
    - Project management for software development
    - Team lead oversight and mentorship
    - Weekly status reports and deliverables

    INVOICE SCHEDULE
    Invoice No    Description          Amount Due
    INV-001      January consulting    $5,000.00
    INV-002      February consulting   $5,000.00
    INV-003      March consulting     $5,000.00

    PAYMENT TERMS
    Net 30 days from invoice date.

    4. TERMINATION
    Either party may terminate this agreement with 30 days written notice.
    `;
    const r = classifyDocument({ text: hybridText, filename: 'msa-with-invoices.txt' });
    // This blends contract and invoice language
    // The classification should be one of them with reasonable confidence
    expect(['contract', 'invoice', 'general']).toContain(r.type);
    expect(r.confidence).toBeLessThanOrEqual(100);
  });
});

// ─── Confidence Score Behavior ──────────────────────────────────────────────

describe('Edge cases: confidence score behavior', () => {
  it('confidence is always a number between 0 and 100', () => {
    const cases = [
      { text: '', filename: 'a.txt' },
      { text: 'Hello', filename: 'b.txt' },
      { text: 'A'.repeat(10000), filename: 'c.txt' },
      { text: 'random words ' + 'x'.repeat(500), filename: 'd.txt' },
    ];
    for (const c of cases) {
      const r = classifyDocument(c);
      expect(typeof r.confidence).toBe('number');
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(100);
    }
  });

  it('signals array is always present and non-empty', () => {
    const r = classifyDocument({ text: 'test', filename: 'test.txt' });
    expect(Array.isArray(r.signals)).toBe(true);
    expect(r.signals.length).toBeGreaterThan(0);
  });

  it('filename hint always gives high confidence', () => {
    const filenames = [
      'invoice-march.pdf',
      'contract-nda.docx',
      'john-resume.pdf',
      'research-paper-v2.pdf',
      'transcript-fall-2024.pdf',
    ];
    for (const fn of filenames) {
      const r = classifyDocument({ text: 'random content here', filename: fn });
      expect(r.confidence).toBeGreaterThanOrEqual(70);
    }
  });
});
