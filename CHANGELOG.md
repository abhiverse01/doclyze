# Changelog

All notable changes to the Doclyze project are documented in this file.

## v5 — Parser Intelligence & End-to-End Truth (2026-08-14)

### Critical Fixes

- **Duplicate-file bug (0.1)**: Root-caused to the Dropzone component firing both `onFile` and `onFiles` callbacks for single file drops, causing two concurrent `runExtractionPipeline` calls each generating a different `crypto.randomUUID()`. Fixed by removing the dual-fire — only `onFiles` is now called, and `handleFiles` correctly delegates single files to `handleFile` internally. The v4 unit tests only tested same-ID store dedup and missed the actual call-site double-fire.

- **File integrity safeguard (0.2)**: Added `scripts/check-file-integrity.ts` — runs as part of `bun run test` to detect empty, truncated, or corrupted source files. Catches the class of silent corruption that previously left `table-sheet.tsx` truncated and undetected.

### Classifier Overhaul (Section 2)

- **Root cause of resume bias**: Four compounding causes identified:
  1. Generic keyword overlap ("experience", "education", "skills" appear across many document types)
  2. No score normalization by keyword-list size or document length
  3. Zero structural signal weighting (no detection of document layout patterns)
  4. Low confidence still returned a specific type instead of routing to "general"

- **Rebuilt classifier** with:
  - Normalized keyword scoring (matched/total ratio) preventing large keyword lists from dominating
  - Structural signal detection (contact blocks, section headers, line-item tables, numbered clauses, WHEREAS patterns, abstract blocks, reference sections, grade tables, medical reference ranges, financial tables)
  - Cross-type disambiguation penalties (e.g., document has resume keywords but invoice-like line-item structure)
  - Numeric confidence score (0-100) replacing coarse high/medium/low
  - Confidence threshold (below 25 → routes to general extractor)
  - Reduced resume keyword list (removed ultra-generic terms like "experience", "education", "skills")

- **Evaluation corpus**: 75 fixture files across 10 types (resume, invoice, contract, research_paper, academic_transcript, purchase_order, financial_statement, medical_report, general, ambiguous) checked into `__fixtures__/classification/`

- **Manual reclassification**: Added "Reclassify" button in the Presentor UI when classification confidence is low. Users can select the correct document type and re-run extraction without re-uploading. Orchestrator supports `forceType` parameter.

### Extraction Engine Hardening (Section 3)

- Added early rejection for empty (0-byte) and too-small (<10 byte) files
- Added structured error messages for all failure modes

### Data Presentation (Section 4)

- Classification confidence badge displayed in the analyzer header (color-coded: green ≥70, yellow ≥40, red <40)
- Document-level extraction quality summary (fields found/total, low-confidence count)
- Reclassification control with dropdown selector for all document types

### Edge-Case Hardening (Section 5)

- 14 edge-case tests covering: empty text, whitespace-only, very short text, non-English (Spanish), mixed-language, extremely long text (250K chars), job postings, performance reviews, course syllabi, price lists, hybrid documents, confidence score bounds, signal array integrity, filename hint confidence

### Verification

- All 162 tests pass (6 test files)
- File integrity check passes (0 errors, 6 warnings for missing trailing newlines)
- ESLint passes (0 errors, 2 pre-existing warnings)

## v4 — Presentor Sophistication (prior session)

- Provenance-on-demand, inline correction with tracking, insight-to-cell linking
- In-document search/filter, per-field annotations, contextual charting
- Report export, store invariants, field corrections, annotations

## v3 — Routing, Mobile, Light Mode (prior session)

- Route group layout, mobile drawer, light mode support
- PDF worker race condition fix, XLSX support, 7 client bug fixes

## v2 — Extraction Engine (initial)

- PDF.js parsing, DOCX via mammoth, CSV/TSV via PapaParse, OCR via Tesseract.js
- Multi-type classification and extraction pipeline
- PII detection, language detection, confidence scoring

## v1 — Initial Release

- File upload via drag-and-drop
- Basic document classification and field extraction
- Sidebar navigation, dark mode
