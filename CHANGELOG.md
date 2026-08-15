# Changelog

All notable changes to the Doclyze project are documented in this file.


## v9 — Zero-Defect Gate, UI/UX Godmode, Full Documentation (2026-08-15)

### Purpose

v8 found and fixed six bugs that all shipped while "0 TypeScript errors, 218/218 tests pass" was true. v9 closes the structural gap that let that happen by installing a real verification gate, then makes the product feel flagship-tier with a UI/UX pass and comprehensive README.

### Section 0 — The Missing Gate (Implemented)

- **Production build as a hard requirement** — `test:gate` script chains file integrity + unit tests + Playwright smoke tests. Run `bun run test:gate`.
- **Playwright smoke tests** (NEW: `tests/smoke/console-errors.spec.ts`): Loads `/`, `/dashboard`, and `/analyzer` in headless Chromium. **Fails if the browser console reports any error or React warning.** This is the direct fix for both the v8 `ReferenceError` and the duplicate-key warning.
- **Third-party API verification policy** (NEW: `THIRD_PARTY_API_POLICY.md`): Documents verified and non-existent APIs for pdfjs-dist v6.2.108, tesseract.js v7.0.0, and mammoth v1.12.1. Establishes a policy: check installed type definitions before calling any unverified library method.
- **File integrity safeguard expanded** (MODIFIED: `scripts/check-file-integrity.ts`): Now covers documentation files (`.md`, `.mdx`) including `README.md`, `CHANGELOG.md`, `EXTENDING.md`. Also adds null-byte corruption detection. CHANGELOG.md was found truncated in v8 because the script only covered `src/` and `tests/`.
- **Systemic ID/indexOf sweep**: Comprehensive audit of all `.ts`/`.tsx` files for locally-scoped counters used as globally-unique IDs and `.indexOf()` position bugs. Found 0 new confirmed bugs — the `layout-table-${t}` collision was already fixed in v7's `analyzeLayout()` global re-index.

**Gate effectiveness evidence**: The Playwright smoke test caught a **new bug** on its first run — a nested `<button>` inside `<button>` in the dashboard upload card, causing a React hydration mismatch error. This bug was invisible to `tsc --noEmit` and all 218 unit tests.

### Section 1 — Bug Fix: Dashboard Hydration Error

- **`dashboard.tsx`**: The quick-upload card wrapped a `<Button>` (renders `<button>`) inside a `<button>`, causing `In HTML, <button> cannot be a descendant of <button>` and a hydration mismatch. Fixed by changing the outer element to a `<div>` with `role="button"`, `tabIndex={0}`, and keyboard event handler.

### Section 2 — Bug Fix: Document Presentor Key

- **`document-presentor.tsx`**: Simplified the defensive React key from `tableIdx === 0 ? table.id : \`${table.id}-${tableIdx}\`` to always use `\`${table.id}-${tableIdx}\``. The root cause (per-page table ID counter) was already fixed in `layout.ts:analyzeLayout()` which re-indexes globally.

### Section 3 — UI/UX Godmode Pass

#### 3.1 First-Run Onboarding (Section 2.2)

- **`analyzer.tsx`**: Added "Try a sample resume" button in the empty-state upload area. Creates a realistic resume `File` object from an inline text template and runs it through the full extraction pipeline. New users can see the product's depth (structured sheet, entity typing, insights, confidence scoring) with one click, no upload needed.

#### 3.2 Processing Experience Motion (Section 2.1)

- **`analyzer.tsx`**: Wrapped all four tab content panels (Structure, Sheet, Insights, Raw) in `motion.div` with `initial={{opacity:0, y:8}}` → `animate={{opacity:1, y:0}}` entrance animation (0.3s, ease [0.4,0,0.2,1]). Results now reveal with a subtle slide-up rather than an abrupt content swap.

#### 3.3 Micro-interaction Consistency (Section 2.3)

- **`field-group-sheet.tsx`**: Added consistent `transition-colors`, `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1`, and `rounded-sm` to all icon-only buttons (provenance eye, save edit, cancel edit, remove annotation, add annotation, close annotation).
- **`insights-panel.tsx`**: Added `transition-colors` and focus ring to the "View in sheet" link button.
- **`structure-view.tsx`**: Added focus ring to the heading toggle button.
- **`analyzer.tsx`**: Added focus ring to the cancel-reclassification button.

#### 3.4 Empty/Loading/Error States (Section 2.5)

- Verified all four states across every view: empty (on-brand with branded icons and descriptive text), loading (animated spinner + stage labels + progress bar), error (actionable message with retry button), and no-structure (helpful suggestion to try raw text tab).
- Verified correspondence extractor results render properly through the standard FieldGroupSheet pipeline.

#### 3.5 Accessibility (Section 2.6)

- Added `aria-label` to 4 icon-only buttons that were missing them (save edit, cancel edit, cancel annotation, cancel reclassification).
- Verified command palette ARIA (CommandDialog wraps Radix Dialog with proper `aria-labelledby`/`aria-describedby` via cmdk's native `role="listbox"`/`role="option"`).
- Verified Tabs ARIA (built on `@radix-ui/react-tabs` with native `role="tablist"`/`role="tab"`/`role="tabpanel"` and arrow-key navigation).

### Section 4 — Comprehensive README

- **`README.md`** (REWRITTEN): Fully verified against the live codebase. Covers: accurate positioning statement, all 11 document types with what each extractor actually captures, 16 core capabilities described precisely (layout-aware PDF, OCR noise filtering, embedded image text, classifier, confidence scoring, PII detection/redaction, provenance, inline correction, annotations, reclassification, field search, charting, export, structure view, AI insights, language detection, batch upload, command palette), full architecture diagram with pipeline stages, state/persistence description, setup instructions with environment variables, test commands including the new gate, verification gate description, tech stack with versions, known limitations (honest: no full-text search, no comparison, embedded image scope, multi-language depth, localStorage-only persistence), and extension points.

### Section 5 — Updated Documentation

- **`EXTENDING.md`**: Updated last-updated date to v9.
- **`CHANGELOG.md`**: This entry.

### Tests

- All 218 unit tests passing
- All 3 Playwright smoke tests passing (/, /dashboard, /analyzer)
- File integrity check passing (124 files, 0 errors)
- 1 new bug caught and fixed by the new gate (dashboard nested button hydration error)


## v8 — OCR Intelligence & Product Maturity (2026-08-15)

### Purpose

v7 closed the verification gap. v8 addresses two missions:

1. A **technical fix** (Sections 0-2): OCR garbage contamination from stamp/logo elements in scanned documents, and embedded image OCR for PDFs with text layers.
2. A **product maturity and design pass** (Sections 3-7): data management, correspondence type, sidebar quality signals, homepage accuracy, UI coherence.

### Section 0 - Root Cause Diagnosis

**Confirmed root cause of OCR noise contamination:**

The `parseImage()` function previously discarded Tesseract's rich result - keeping only `data.text` (the flat string). Tesseract.js's `recognize()` returns `data.lines[]` and `data.words[]`, each with `confidence` scores (0-100). This is the same class of bug that v6 fixed for PDF layout data - discard the rich data, keep only the flattened string.

**Completeness display inconsistency:**

The analyzer showed TWO different metrics close together:
1. **"Extraction quality: X/100"** - a calibrated completeness score computed by the orchestrator, accounting for OCR penalty, non-English penalty, and low-confidence field penalty.
2. **"N of M fields populated"** - a raw field count from the `ClassificationControl` component.

These are genuinely different signals. Resolved by clearly labeling them: "Extraction quality" for the calibrated score (with progress bar) and "Field coverage" for the raw count (with reclassification control).

### Section 1 - OCR Confidence & Noise Detection

- **`src/lib/extraction/ocr-confidence.ts`** (NEW): 310-line module that:
  - Retains per-line confidence from Tesseract's `data.lines[]`
  - Implements a gibberish heuristic: dictionary membership check (~500 common words), consonant-cluster ratio, short-token frequency, and structural signals
  - Segments OCR output into high-confidence and low-confidence regions
  - Only high-confidence text feeds into entity extraction, heading detection, and completeness scoring
  - Low-confidence text is preserved in a collapsed section in the raw text view

- **`src/lib/extraction/parsers.ts`** (MODIFIED):
  - `parseImage()` now calls `extractOCRLinesFromResult()` and `analyzeOCRConfidence()` instead of discarding to flat string
  - `runOcrOnPdfPagesWithConfidence()` does the same for scanned PDFs
  - Returns `ocrConfidence: OCRConfidenceResult` in `ParseOutput`

- **`src/lib/extraction/orchestrator.ts`** (MODIFIED):
  - OCR penalty is now noise-aware: if `ocrConfidence` exists and `highConfidenceRatio` is high, only -5 penalty (vs -10 for legacy path)
  - Adds OCR insight with noise-line count and high-confidence ratio
  - Passes `ocrConfidence` through to the result

- **`src/components/doclyze/analyzer.tsx`** (MODIFIED):
  - Raw text view includes collapsible "low-confidence content" section when OCR noise is detected
  - "Field coverage" label clearly distinguishes from "Extraction quality" score

### Section 2 - Embedded Image Text in PDFs

- **`src/lib/extraction/parsers.ts`** - `extractEmbeddedImageText()` (NEW):
  - Enumerates image XObject operations via `page.getOperatorList()`
  - Identifies pages with embedded images (via `paintImageXObject` / `paintImageXObjectRepeat` ops)
  - Renders candidate pages at 2x and runs OCR, applying the same noise filtering from Section 1
  - Scoped honestly: handles 1-2 pages with embedded images; vector graphics, Form XObjects, and many small images are documented extension points

### Section 3 - Developer Credit Regression

- **Audit result**: Credit present in all 3 locations (landing footer, Settings About, README.md)
- **`tests/regression/dev-credit.test.ts`** (EXISTING): 3 tests checking string presence across all locations - still passing
- No credit was actually lost; the earlier concern was a false alarm

### Section 4 - Correspondence / Formal Letter Document Type

- **`src/lib/extraction/extractors/correspondence.ts`** (NEW): 439-line extractor with:
  - 16 extracted fields: sender, recipient, date, subject, reference number, salutation, body summary, closing, signature name, requests, CC recipients, letter type
  - 5 letter sub-types: `cover_letter`, `complaint`, `reference`, `business_request`, `general`
  - Request detection (up to 5 asks extracted from letter body)
  - Completeness scoring over 10 expected dimensions

- **`src/lib/extraction/classifier.ts`** (MODIFIED): 21 correspondence keywords, salutation structural signal (+25 bonus), filename shortcuts

- **`src/lib/extraction/types.ts`** (MODIFIED): `CorrespondenceDetails` interface, `"correspondence"` in `DocType` union

- **`__fixtures__/classification/correspondence/`** (NEW): 8 fixture letters covering all 5 sub-types

### Section 5 - Product Maturity

- **Settings panel**: Data management section (export history, clear documents, clear all data), AI provider status indicator with free-tier setup guidance, theme picker, keyboard shortcuts, developer credit - all present and coherent
- **Sidebar**: Per-document quality signals (completeness %, type badge, OCR indicator, relative time) in recent documents list
- **Homepage**: Feature copy accurately reflects current capabilities (layout-aware PDF, typed entity extraction, grounded insights, privacy-by-design)

### Section 6 - UI/CSS Coherence

- Verified spacing, typography, and elevation consistency across all views
- Fixed corrupted `data-management.tsx` (duplicated JSX from prior session truncation)
- Added missing `correspondence` to `TYPE_ICONS` and `TYPE_OPTIONS` in dashboard

### Bug Fixes

- **`landing.tsx`**: Missing `Type` import from lucide-react (runtime ReferenceError)
- **`data-management.tsx`**: Duplicated JSX block causing TS2657/TS1003 errors
- **`dashboard.tsx`**: Missing `correspondence` entry in `TYPE_ICONS` Record (TS2741)
- **`store.ts`**: `clearAllData` action missing from `AppState` interface (TS2339)
- **`parsers.ts`**: `paintJpegXObject` does not exist in current pdfjs-dist (replaced with `paintImageXObjectRepeat`); `page.getObjects()` does not exist on `PDFPageProxy` (rewrote embedded image detection to use operator list counting)

### Tests

- All 218 tests passing across 11 test files
- No regressions introduced


## v7 - Verification Discipline (2026-08-14)

### Purpose

Close the verification gap identified across v2-v6: "tests pass" did not mean "bug fixed." This pass focused on building real verification infrastructure.

### Changes

- Programmatic full-pipeline verification scripts
- Live-verification harness for running extraction against real files
- File-integrity checks to catch silent truncation
- Regression smoke tests


## v6 - Layout-Aware PDF Extraction (2026-08-13)

### Purpose

Fix the fundamental PDF extraction approach: stop treating PDF text as a flat string and start using positional/font-size data from pdfjs-dist.

### Changes

- Column detection via x-position gap clustering
- Heading detection from font-size clustering
- Table grid reconstruction from positional data
- Reading-order text building
- Entity exclusion of heading text
- Document structure tree for general documents


## v5 - Classifier Rewrite (2026-08-12)

### Purpose

Replace fragile keyword-counting classifier with a normalized, structural-signal-aware scoring system.

### Changes

- Weighted keyword lists per document type
- Structural signals (headings, sections, tables, salutations)
- Filename-based shortcuts
- Cross-type disambiguation
- Manual reclassification control in the UI


## v4 - Inline Correction & Annotation (2026-08-11)

### Purpose

Allow users to correct extracted values and add annotations directly in the structured sheet view.

### Changes

- Field-level inline correction with persistence
- Per-document annotation system
- Insight-to-cell linking


## v3 - Theme & Polish (2026-08-10)

### Purpose

Add dark mode and establish design system foundations.

### Changes

- Light/dark/system theme support
- CSS custom properties for design tokens
- Elevation/shadow audit
- Mobile-responsive layout


## v2 - Multi-Format Support (2026-08-09)

### Purpose

Expand beyond PDF to support all common document formats.

### Changes

- DOCX via mammoth
- CSV/TSV via papaparse
- XLSX via SheetJS
- Image OCR via Tesseract.js
- Magic-byte MIME sniffing
