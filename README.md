<div align="center">

<img src="public/logo/doclyze-wordmark.svg" alt="Doclyze" width="320" />

**Document Intelligence** — ingest any document, get structured data and grounded insights.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-blue)](https://typescriptlang.org)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8)](https://tailwindcss.com)
[![shadcn/ui](https://img.shields.io/badge/shadcn/ui-000)](https://ui.shadcn.com)

</div>

---

Doclyze is a fully client-side document intelligence platform. It parses PDFs, DOCX files, images (via OCR), spreadsheets, and plain text — then classifies the document type, runs a type-specific extraction engine, detects PII, scores completeness, and surfaces grounded observations. All deterministic, all reproducible, all running in your browser with no data leaving your machine.

## What Doclyze Is

A single-page application built on Next.js 16 that turns unstructured documents into structured data. It is not a cloud service, not an API wrapper, and not a chatbot. Every extraction is a deterministic pipeline: the same file always produces the same result. The optional AI insights layer (off by default) sends only the already-extracted structured JSON to an LLM provider — never the raw file — and works with any provider that exposes an OpenAI-compatible chat endpoint.

## Supported Document Types

| Type | What Gets Extracted |
|------|---------------------|
| **Resume / CV** | Contact info, professional summary, work experience (company, title, dates, bullets), education (institution, degree, GPA), skills (categorized: languages, frameworks, tools, soft skills), certifications, projects, publications. Derived insights: total years of experience, employment gaps, ATS keyword coverage. |
| **Invoice / Receipt** | Vendor details, bill-to address, invoice number/date/due date, line items (description, quantity, unit price, total), subtotal, tax, grand total, currency. **Reconciliation engine**: verifies line items sum to the stated total and flags mismatches. |
| **Contract / Agreement** | Parties, defined terms glossary, effective/termination dates, numbered sections, **risk clauses** (auto-renewal, indemnification, non-compete, non-disclosure, exclusive, unlimited liability — each with severity rating), obligations. |
| **Research Paper** | Title, authors, abstract, section headings with levels, keywords, citation count estimate, references. |
| **Spreadsheet (CSV/TSV/XLSX)** | Headers, row/column counts, **inferred column types** (text, date, currency, number, URL, email, tag), null analysis, duplicate detection, preview rows. |
| **Academic Transcript** | Student name, institution, degree program, overall and major GPA (with scale), terms with courses (code, title, credits, grade), total credits, Dean's list terms, graduation date. |
| **Purchase Order** | PO number, date, buyer, vendor, ship-to address, line items, subtotal/tax/shipping/total, currency, payment terms, authorized by, delivery date. |
| **Financial Statement** | Company name, statement period, statement type (balance sheet/income statement/cash flow), revenue, net income, total assets/liabilities, equity, year-over-year comparisons, footnotes count. |
| **Medical / Lab Report** | Patient name (auto-de-identified as [PATIENT]), date, ordering physician, lab name, test results (name, value, unit, reference range, flag: normal/abnormal/critical), status, notes. |
| **Correspondence / Letter** | Sender and recipient (name + address), date, subject, salutation, body summary, closing, signature name, CC recipients, reference number, extracted requests/asks. **Letter sub-type classification**: cover letter, complaint, reference, business request, or general. |
| **General / Other** | Named entities (persons, organizations, locations), dates, emails, URLs, monetary amounts, phone numbers. Reading statistics (word count, Flesch-Kincaid readability). Section outline and recursive document structure tree. |

## Core Capabilities

### Layout-Aware PDF Extraction

PDFs are not treated as flat text. Doclyze uses pdfjs-dist to extract positional data (x/y coordinates, font sizes) from the text layer, then runs three analysis passes: **column detection** (x-position gap clustering for multi-column layouts), **heading detection** (font-size ranking relative to body text), and **table reconstruction** (positional grid alignment to rebuild tables from scattered text items). A reading-order algorithm then produces text that respects column flow and heading hierarchy.

### OCR with Confidence-Based Noise Filtering

Scanned PDFs and images are processed through Tesseract.js. The system retains per-line confidence scores from Tesseract's output and applies a gibberish heuristic (dictionary membership check against ~500 common words, consonant-cluster ratio analysis, structural signals) to separate high-confidence text from noise. Only high-confidence text feeds into extraction and scoring. Low-confidence content (stamps, logos, decorative elements) is preserved but excluded from analysis. This addresses a common failure mode where OCR garbage from stamp/logo elements contaminates extracted entities.

### Embedded Image Text Detection

For PDFs that have a text layer but also contain embedded raster images (e.g., scanned signatures, photographed stamps, screenshotted diagrams), Doclyze identifies pages with image XObjects via operator list analysis, renders those pages at 2x resolution, runs OCR, and diffs the result against the existing text layer to find text that only exists in the images.

### Classifier

A weighted, multi-signal classifier determines document type using three input types: normalized keyword lists (9 type-specific lists, scored as matched/total to prevent large lists from dominating), structural signals (11 binary detectors: contact blocks, section headers, line-item tables, numbered clauses, salutations, etc.), and filename-based shortcuts for high-confidence matches. Cross-type disambiguation penalties prevent misclassification between similar types (e.g., invoice vs. purchase order).

### Confidence Scoring and Completeness Calibration

A weighted completeness score (0-100) reflects how many expected fields were successfully extracted, with higher weight on fields that matter more per document type (e.g., vendor name and total for invoices, name and email for resumes). Penalties are applied for OCR usage, non-English content, and low-confidence fields.

### PII Detection and Redaction

Eight PII types are detected: SSN, credit card numbers, national IDs, dates of birth, phone numbers, email addresses, addresses, and medical terms. PII fields are flagged with visual severity indicators in the structured sheet. A toggle in the raw text view masks detected PII with redaction characters.

### Provenance Tracking

Every extracted field carries provenance metadata — a description of how and where the value was found. Clicking the provenance icon on any field shows a ~80-character snippet of the surrounding raw text context, so you can verify the extraction at its source.

### Inline Correction

Any extracted field value can be edited inline. Corrections are persisted in localStorage and tagged with an "Edited" badge. The export report includes corrections with `[EDITED]` annotations. Original values can be reverted.

### Annotations

Two-level annotation system: document-level sticky notes and per-field annotations. Both persist across sessions.

### Manual Reclassification

If the classifier picks the wrong type, users can force-reclassify to any of the 11 types. The extraction re-runs with the selected type's schema.

### Field-Level Search/Filter

Within extraction sheets, a filter input appears for field groups with more than 6 fields, allowing quick search by field label or value.

### Contextual Charting

The dashboard includes two charts: a bar chart showing document counts by type, and a line chart showing completeness score trends across recently analyzed documents.

### Report Export

Three export formats: **Print/PDF** (polished HTML report with print-ready CSS), **JSON** (full structured extraction result), and **Text** (formatted ASCII-art report with Unicode box drawing).

### Document Structure View

For general documents, a recursive collapsible tree visualizes the document's heading hierarchy. Each node shows body text preview and any embedded tables.

### AI-Assisted Insights (Optional)

An LLM pass reads the structured extraction and surfaces non-obvious patterns — resume improvement suggestions, invoice reconciliation notes, contract risk observations, paper citation issues. Provider-agnostic: works with any OpenAI-compatible endpoint. Disabled by default; no data is sent anywhere unless explicitly enabled.

### Language Detection

Deterministic language detection using Unicode character-range heuristics (CJK, Cyrillic, Arabic, Devanagari, Thai) and high-frequency word lists for 12 languages. Non-English documents are labeled and routed to the general extractor.

### Batch Upload

Drop multiple files at once. Files are processed sequentially with per-file progress tracking, completion/error counts, and automatic navigation to the last completed result.

### Command Palette

Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux) for quick navigation: jump to Dashboard, Analyzer, recent documents, toggle theme, or open Settings.

## Architecture

```
src/
  app/
    (app)/                          # App shell routes
      analyzer/page.tsx             # Upload / empty-state view
      analyzer/[docId]/page.tsx     # Document analysis view
      dashboard/page.tsx            # Document dashboard
    api/
      insights/route.ts             # AI insight endpoint (POST)
      insights/status/route.ts      # AI provider status (GET)
  components/
    doclyze/                        # Feature components
      landing.tsx                    # Marketing homepage
      app-shell.tsx                  # Sidebar + layout shell
      dashboard.tsx                  # Document dashboard + charts
      analyzer.tsx                   # Upload, progress, result tabs
      document-presentor.tsx         # Field groups + tables renderer
      presentor/
        field-group-sheet.tsx        # Typed field group with provenance
        table-sheet.tsx              # Reconstructed table with sort/export
        structure-view.tsx           # Recursive document structure tree
        document-annotation.tsx      # Document-level notes
        skeletons.tsx                # Loading skeletons
      insights-panel.tsx             # Deterministic + AI insights list
      export-report.tsx              # Print/JSON/Text export
      dropzone.tsx                   # Drag-and-drop upload
      command-palette.tsx            # Cmd+K command palette
      settings-panel.tsx             # Settings dialog
      data-management.tsx            # Export/clear data
      sidebar.tsx                    # Recent documents sidebar
    ui/                             # shadcn/ui component library (52 components)
  lib/
    extraction/
      types.ts                       # Extraction result schema (DocType union, FieldGroup, ExtractedTable, Insight)
      parsers.ts                     # File-to-text: PDF (layout-aware), DOCX, CSV/TSV, XLSX, image/OCR
      classifier.ts                  # Weighted multi-signal document type classifier
      orchestrator.ts                # Pipeline: parse > classify > extract > PII > score > insights
      layout.ts                      # PDF column detection, heading detection, table reconstruction
      ocr-confidence.ts              # Per-line OCR confidence analysis, noise segmentation
      normalize.ts                   # Text normalization, whitespace collapsing
      pii-detector.ts                # 8-type PII detection with overlapping range dedup
      lang-detect.ts                 # Unicode-range + word-list language detection
      redact.ts                      # PII text masking
      clean-span.ts                  # Span-level text cleaning for extraction
      extractors/
        resume.ts                    # Resume/CV extraction
        invoice.ts                    # Invoice/receipt with reconciliation
        contract.ts                   # Contract with risk clause detection
        research-paper.ts             # Academic paper extraction
        spreadsheet.ts                # CSV/TSV/XLSX with column type inference
        academic-transcript.ts        # Transcript with GPA/course analysis
        purchase-order.ts             # Purchase order extraction
        financial-statement.ts        # Financial statement with YoY comparison
        medical-report.ts             # De-identified medical/lab report
        correspondence.ts             # Letter sub-type classification + extraction
        general.ts                    # Entity extraction, readability stats, structure tree
    store.ts                        # Zustand store with localStorage persistence + rehydration validation
```

### Extraction Pipeline

1. **Ingest** — Magic-byte MIME sniffing routes the file to the correct parser (never trusts the file extension)
2. **Parse** — PDF (text layer or OCR), DOCX (via mammoth), CSV/TSV (via PapaParse), XLSX (via SheetJS), image (Tesseract OCR), plain text
3. **Layout Analysis** (PDF only) — Column detection, font-size heading analysis, table grid reconstruction from positional data
4. **Classify** — Weighted keyword + structural signal classifier with filename shortcuts
5. **Extract** — Type-specific extractor produces field groups, tables, and insights
6. **PII Scan** — 8-type PII detection with per-field severity flags
7. **Score** — Weighted completeness score calibrated per document type
8. **Assemble** — Final result with metadata, provenance, and quality signals

### State and Persistence

Zustand store with `persist` middleware. Document metadata, settings, field corrections, and annotations survive page reloads via localStorage. Full extraction results are intentionally not persisted (too large) — users re-analyze after refresh. Rehydration validates all persisted data; malformed entries are silently discarded.

## Getting Started

```bash
bun install
bun run db:push
bun run dev
```

The app runs at `http://localhost:3000`. No account or API key is required for the core extraction features.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| (none for core) | No | All extraction runs client-side with no server dependency |
| `AI_PROVIDER_API_KEY` | Only for AI insights | API key for the optional LLM insights provider |
| `AI_PROVIDER_BASE_URL` | Only for AI insights | Base URL for the LLM endpoint (defaults to OpenAI) |
| `AI_PROVIDER_MODEL` | Only for AI insights | Model identifier (defaults to gpt-4o-mini) |

## Running Tests

```bash
# Unit tests + file integrity check
bun run test

# Full gate: integrity + unit tests + Playwright smoke tests
bun run test:gate

# Playwright smoke tests only (requires dev server)
bun run test:smoke
```

The test suite includes 218 unit tests covering the extraction engine (all 11 extractors, the classifier, layout analysis, OCR confidence, normalizer, regex safety, edge cases, file integrity, and developer credit regression). The `test:gate` command additionally runs Playwright-based browser smoke tests that load every route and fail if any console error or React warning is detected.

## Verification Gate

The project uses a multi-layer verification gate to catch bugs that "TypeScript compiles clean" and "all tests pass" miss:

1. **File integrity check** — detects empty files and mid-line truncation across source code and documentation files
2. **Unit tests** — 218 tests covering the extraction engine
3. **Playwright smoke tests** — loads `/`, `/dashboard`, and `/analyzer` in a headless Chromium browser, failing if any console error or React warning appears. This directly catches runtime crashes (like the v8 `ReferenceError` from a missing import) and React warnings (like duplicate keys or hydration mismatches)
4. **Third-party API verification policy** — documented in `THIRD_PARTY_API_POLICY.md`, requires checking installed type definitions before calling any unverified library method

## Tech Stack

- **Next.js 16** with App Router and Turbopack
- **TypeScript 5** — strict typing throughout
- **Tailwind CSS 4** + **shadcn/ui** (52 components)
- **Zustand** for client state (localStorage-persisted with rehydration validation)
- **Framer Motion** for transitions
- **Recharts** for dashboard charts
- **pdf.js v6** for PDF text extraction with layout analysis
- **Tesseract.js v7** for OCR (scanned PDFs / images)
- **Mammoth.js** for DOCX parsing
- **PapaParse** for CSV/TSV parsing
- **SheetJS (xlsx)** for XLSX parsing
- **Playwright** for browser smoke tests
- **Vitest** for unit tests

## Known Limitations

- **No full-text search**: The analyzer provides field-level filtering within extraction sheets, but does not offer full-text search across the raw document content.
- **Two-document comparison**: Documented as an extension point in `EXTENDING.md`. The shared extraction schema and consistent field typing make this tractable, but it has not been implemented.
- **Embedded image OCR scope**: Handles 1-2 pages with embedded raster images per document. Vector graphics, Form XObjects, and documents with many small images are documented extension points.
- **Multi-language extraction depth**: Non-English documents are detected and labeled, but extraction uses the general extractor rather than type-specific extractors (which are tuned for English).
- **Small/complex embedded images**: Very small images or images inside Form XObjects are not individually extracted.
- **Server-side persistence**: Document history is stored in localStorage, which is cleared when browser data is cleared. Prisma + SQLite is scaffolded but not wired up.

## Extension Points

See `EXTENDING.md` for detailed implementation plans:
- Two-document comparison (MVP scope estimated)
- Adding new document extractors
- AI-powered field suggestions
- Cloud sync via Prisma
- Additional file formats (PPTX, email)

## License

Private — all rights reserved.

## Author

- **Abhishek Shah**
- GitHub: [abhiverse01](https://github.com/abhiverse01)
- Email: abhishek.aimarine@gmail.com
