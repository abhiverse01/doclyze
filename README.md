<div align="center">

<img src="public/logo/doclyze-wordmark.svg" alt="Doclyze" width="320" />

**Document Intelligence** — ingest any document, get structured data and grounded insights.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-blue)](https://typescriptlang.org)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8)](https://tailwindcss.com)
[![shadcn/ui](https://img.shields.io/badge/shadcn/ui-000)](https://ui.shadcn.com)

</div>

---

Doclyze is a fully client-side document intelligence platform. It parses PDFs, DOCX files, images (via OCR), CSVs, and plain text, then extracts structured data using deterministic heuristic engines — no LLM, no server roundtrips, no data leaving your browser.

## Supported Document Types

| Type | Extraction | Status |
|------|-----------|--------|
| Resume / CV | Contact, experience, education, skills (categorized), ATS analysis | Stable |
| Invoice / Receipt | Vendor, bill-to, line items, reconciliation (line items sum vs. stated total) | Stable |
| Contract / Agreement | Parties, defined terms, sections, risk clauses, obligations | Stable |
| Research Paper | Title, authors, abstract, sections, citations, references | Stable |
| Spreadsheet (CSV/TSV) | Column type inference, null analysis, duplicate detection | Stable |
| Academic Transcript | Student, GPA, courses/terms, credits, Dean's list | **New** |
| Purchase Order | PO number, buyer, vendor, line items, authorization | **New** |
| Financial Statement | Company, statement type, key figures, YoY comparisons | **New** |
| Medical / Lab Report | Tests, values, reference ranges, flags (de-identified) | **New** |
| General Document | Entity extraction, readability, word stats | Stable |

## Key Features

- **Deterministic extraction** — every result is reproducible and auditable
- **Reconciliation engine** — verifies invoice line items sum to stated totals
- **PII detection** — flags SSNs, credit cards, and sensitive data with visual indicators
- **Multi-language awareness** — detects non-English content and labels accordingly
- **Confidence calibration** — weighted completeness scores that reflect field importance per doc type
- **Batch upload** — process multiple files with per-file progress tracking
- **Command palette** — `Cmd+K` / `Ctrl+K` for quick navigation
- **Export** — JSON or formatted text report per document
- **Redaction preview** — toggle PII masking in the raw text view
- **Document history** — search and filter by filename or document type
- **Dark/light theme** — system-aware with manual override

## Tech Stack

- **Next.js 16** with App Router and Turbopack
- **TypeScript 5** — strict typing throughout
- **Tailwind CSS 4** + **shadcn/ui** component library
- **Zustand** for client state (localStorage-persisted)
- **Framer Motion** for transitions
- **pdf.js** for PDF text extraction
- **Tesseract.js** for OCR (scanned PDFs / images)
- **Mammoth.js** for DOCX parsing
- **PapaParse** for CSV/TSV parsing
- **Vitest** for extraction engine regression tests

## Getting Started

```bash
bun install
bun run db:push
bun run dev
```

## Running Tests

```bash
bun run test
```

42 regression tests covering regex safety, all extractors, normalizer functions, and the classifier.

## Architecture

```
src/
  app/                    # Next.js App Router (single / route, Zustand-driven views)
  components/
    doclyze/              # Feature components (landing, app-shell, dashboard, analyzer, ...)
    ui/                   # shadcn/ui component library
  lib/
    extraction/
      types.ts            # Strict extraction result schema (v1)
      parsers.ts           # File-to-text: PDF, DOCX, CSV, image/OCR
      classifier.ts        # Keyword-based document type classifier
      orchestrator.ts      # Pipeline: parse > classify > extract > assemble
      normalize.ts         # Text normalization, readability scores
      pii-detector.ts      # PII/sensitive data detection
      lang-detect.ts       # Multi-language detection
      redact.ts            # PII text redaction
      extractors/
        resume.ts
        invoice.ts
        contract.ts
        research-paper.ts
        spreadsheet.ts
        academic-transcript.ts
        purchase-order.ts
        financial-statement.ts
        medical-report.ts
        general.ts
  hooks/                  # Custom React hooks
  store.ts                # Zustand global store
```

## Extension Points

See `EXTENDING.md` for documented extension points including:
- Adding a real database (Prisma + SQLite is scaffolded)
- Adding new document extractors
- Integrating AI-powered insights via the z-ai-web-dev-sdk

## License

Private — all rights reserved.

## Author

- **Abhishek Shah**
- GitHub: [abhiverse01](https://github.com/abhiverse01)
- Email: abhishek.aimarine@gmail.com
