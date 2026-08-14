# Changelog

All notable changes to the Doclyze project are documented in this file.

## v6 — Layout-Aware Extraction Engine (2026-08-14)

### The Reproducible Failure Case

A lecture-slide PDF (`web-programming-day1.pdf`) exposed four systemic defects:
1. **URL extraction captured trailing punctuation** — extracted `https://github.com/abhiverse01"` with a trailing double-quote
2. **"Named entities" were just capitalized phrases** — slide titles like "Three Languages" and "The Big Picture" were presented as entities
3. **Multi-column table content was destroyed** — a Term/Definition table was read as interleaved fragments: "Client The", "Browser Software", "Frontend Everything"
4. **Heading detection found only 1 of 10+ headings** — only the ALL-CAPS title matched, while mixed-case section headers were invisible

### Root Causes (all confirmed and fixed)

1. **URL regex** (`/https?:\/\/[^\s)]+/`) stopped at whitespace or `)` but not at quotes, commas, periods, or semicolons
2. **Entity extraction** was a pure capitalized-phrase detector with no heading exclusion, no type discrimination, no context analysis
3. **PDF parser** discarded all positional data from `getTextContent()`, immediately flattening text items by y-position only — multi-column layouts had their columns interleaved
4. **Heading detection** relied solely on Markdown `#` prefixes and ALL-CAPS patterns, ignoring font-size signals available from the PDF transform matrix

### PDF Extraction Rebuilt for Layout Awareness (Section 1)

- **`src/lib/extraction/layout.ts`** (new, 370 lines): Full layout analysis module
  - Column detection via x-position gap clustering
  - Heading detection via font-size differentiation from body text baseline
  - Table detection via positional grid alignment (x/y binning)
  - Reading-order reconstruction for multi-column layouts
- **`src/lib/extraction/parsers.ts`**: PDF parser now collects `LayoutTextItem[]` with page, x, y, width, height, fontSize per text item. Layout analysis runs after text extraction. DOCX parser now uses `mammoth.convertToHtml()` to extract real `<h1>`–`<h6>` heading structure.
- **`ParseOutput.layoutData`**: New field carries `LayoutResult` through the pipeline to extractors and Presentor

### Entity Extraction Rebuilt (Section 2)

- **Heading exclusion**: Headings (from layout or regex) are excluded from entity candidates
- **Type discrimination**: Entities classified as person (context: "by", "author", "Dr."), organization (suffix: Inc., LLC, University, Institute), or location (known place names + context: "based in", "located at")
- **Low-confidence filtering**: Only medium/high confidence entities are included; low-confidence guesses are omitted rather than presented

### Regex Hygiene Sweep (Section 3)

- **`src/lib/extraction/clean-span.ts`** (new): Shared `cleanExtractedSpan()` utility that trims trailing/leading punctuation (`"`, `'`, `)`, `]`, `.`, `,`, `;`, `:`, etc.)
- Applied at every regex extraction site across all extractors: general, resume, invoice, contract, purchase-order, medical-report
- URL regex patterns updated to exclude common trailing punctuation characters from the match itself (defense in depth)

### General Extractor Produces Structure Tree (Section 4)

- **`buildStructureTree()`**: Produces a hierarchical `StructureNode[]` with headings, nested content, and attached tables
- **`StructureNode`** type: `{ heading, level, content, children: StructureNode[], tables }`
- **Structural quality field group**: Reports headings detected (with provenance: font-size vs pattern), tables reconstructed (with dimensions), entity types found
- Layout-detected tables rendered as real `ExtractedTable` objects (proper columns/rows, not truncated key-value pairs)

### Presentor: Document Structure View (Section 5)

- **New "Structure" tab** in the analyzer (alongside Sheet/Insights/Raw Text)
- **`src/components/doclyze/presentor/structure-view.tsx`** (new): Collapsible tree rendering of the document's heading hierarchy with nested body text and inline tables
- **`table-sheet.tsx` bug fix**: Column `meta.cellType` now properly propagated to `useReactTable` column definitions (was missing, causing all cells to render with default icon)

### Evaluation Corpus Expansion (Section 6)

- 9 new fixture files in `__fixtures__/structural/`:
  - `presentation/`: 3 lecture/training slide-deck-style documents
  - `multi-column/`: 2-column definitions, 3-column comparison
  - `deep-headings/`: 4-level heading hierarchy (31 headings)
  - `definition-table/`: API reference table, feature comparison matrix
  - `punctuation-urls/`: URLs/emails in 9 punctuation-adjacent contexts

### New Tests (40 new, 202 total)

- **`tests/extraction/clean-span.test.ts`** (16 tests): Punctuation trimming for URLs, emails, dates; iterative trimming; deduplication
- **`tests/extraction/layout.test.ts`** (13 tests): Column detection, heading detection, table detection, reading-order text
- **`tests/extraction/v6-fixtures.test.ts`** (11 tests): Direct regression tests for all 4 Section 0 defects with simulated layout data

### Verification

- All 202 tests pass (9 test files, 0 failures)
- TypeScript compilation: 0 errors in `src/`
- Full regression: all 162 v5 tests still green

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
