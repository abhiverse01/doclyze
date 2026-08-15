# Doclyze — Extraction Hardening & Regression Test Suite

## Session: Extraction Hardening + Tests

### A. Extraction Engine Hardening

#### A1. Regex `lastIndex` Safety
Converted all module-level global regexes (`/g`, `/gi`) to non-global base patterns. Global flags are now only added at call sites via `new RegExp(base.source, 'g')`, eliminating shared-state `lastIndex` bugs.

**Files changed:**
- `src/lib/extraction/extractors/invoice.ts` — `MONEY_RE` → `MONEY_RE_BASE`, `DATE_RE` → `DATE_RE_BASE`
- `src/lib/extraction/extractors/contract.ts` — `DATE_RE` → `DATE_RE_BASE`; inline `termRe`, `sectionRe`, `obligRe` converted to base+`new RegExp` pattern
- `src/lib/extraction/extractors/general.ts` — `EMAIL_RE` → `EMAIL_RE_BASE`, `URL_RE` → `URL_RE_BASE`, `DATE_RE` → `DATE_RE_BASE`, `MONEY_RE` → `MONEY_RE_BASE`, `PHONE_RE` → `PHONE_RE_BASE`; inline `re` in `extractNamedEntities` converted
- `src/lib/extraction/extractors/research-paper.ts` — inline `sectionRe` converted to base+`new RegExp` pattern
- `src/lib/extraction/extractors/resume.ts` — `URL_RE` → `URL_RE_BASE` (removed `g`); `DATE_RANGE_RE` → `DATE_RANGE_RE_BASE` (removed `g`)

#### A2. Currency Parsing Enhancements
- **European locale**: Added `normalizeEuropeanNumber()` helper that detects `1.299,00` format (dots as thousands separator, comma as decimal) and normalizes to `1299.00`
- **Parenthetical negatives**: `(500.00)` now parses as `-500` via detection in `parseMoney()`
- **Large values**: `MONEY_RE_BASE` supports unlimited comma-separated groups (e.g., `$1,234,567.89`)
- **Negatives**: Bare negatives like `-500.00` already supported

#### A3. Date Parsing Robustness
- **`invoice.ts` `normalizeDate()`**: Added support for `YYYY-MM` format, quarter notation (`Q1 2023`), `Present`/`Current`/`Ongoing`/`Now` (returns null), abbreviated month names (`Jan`, `Feb`, etc.)
- **`resume.ts` `parseMonthYear()`**: Added `YYYY-MM` format, quarter notation, and present/current/ongoing handling

#### A4. Invoice Label Matching Audit
Verified all label regexes use word boundaries:
- `\bsub\s*total\b` ✅
- `\b(?:tax|vat|gst)\b` ✅ (confirmed "Innovation" won't match)
- `(?<!sub)\btotal\b` ✅
- `findAmount` with `Tax (8.5%): $505.75` — verified the `.*?` lazy match correctly skips the percentage

#### A5. PDF.js Worker — Next.js-Native Bundling
- `parsers.ts`: Changed `ensurePdfjs()` to async, trying `import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')` first (native bundling), falling back to `/public/pdf.worker.min.mjs`
- `next.config.ts`: Already had `webpack: { resolve: { alias: { canvas: false } } }` (confirmed)
- Kept `/public/pdf.worker.min.mjs` as fallback

#### A6. ESLint Ignore Scope
- `eslint.config.mjs`: Narrowed `public/**` ignore to `public/pdf.worker.min.mjs` only

### B. Regression Test Suite

#### B1. Vitest Setup
- Installed `vitest@4.1.10` as devDependency
- Created `vitest.config.ts` with `@` path alias
- Added `"test": "vitest run"` to `package.json` scripts

#### B2. Test Fixtures (12 files)
Created `tests/extraction/__fixtures__/`:
1. `invoice-standard.txt` — Acme Solutions invoice with line items, subtotal, tax (8.5%), total
2. `invoice-innovation.txt` — Invoice with "Innovation Labs" vendor (VAT false-match guard)
3. `invoice-large-amount.txt` — Invoice with `$1,234,567.89` and `$12,999.00`
4. `invoice-mismatch.txt` — Invoice where line items don't sum to stated total
5. `resume-standard.txt` — Full resume with dates, experience, education, skills
6. `resume-no-dates.txt` — Resume with experience entries but no dates
7. `resume-contact-block.txt` — Resume with multi-line contact info block
8. `contract-standard.txt` — Full MSA with parties, sections, risk clauses
9. `contract-no-parties.txt` — Contract with no clearly defined parties
10. `paper-standard.txt` — Research paper with title, authors, abstract, sections, references
11. `general-mixed.txt` — General document with dates, emails, URLs, money, entities
12. `empty.txt` — Empty file

#### B3. Test Files (4 files, 42 tests)
1. **`regex-safety.test.ts`** (12 tests) — Regex lastIndex safety, subtotal/total disambiguation, Innovation VAT false-match guard, Tax (8.5%) parsing, large currency, European locale, parenthetical negatives, quarter notation, YYYY-MM, present/current, while-exec loop reset
2. **`extractors.test.ts`** (11 tests) — Integration tests for all 5 extractors against fixtures: invoice (standard, innovation, large amounts, mismatch), resume (standard, no-dates, contact-block), contract (standard, no-parties), research-paper, general
3. **`normalizer.test.ts`** (11 tests) — normalizeText (contact block separation, soft-wrap joining, empty string), dehyphenate (with hyphen, with indentation, uppercase guard), fleschKincaid (simple, complex, empty), countWords
4. **`classifier.test.ts`** (8 tests) — Content-based classification (resume, invoice, contract), filename hints (invoice, contract, resume), weak text falls to general, tabular short-circuit

#### B4. Test Results
All 42 tests pass (`bun run test` exits 0).

---

## Session: New Extractors + PII Detection + Language Detection

### C. Four New Document Extractors

#### C1. Academic Transcript (`academic_transcript`)
- **File**: `src/lib/extraction/extractors/academic-transcript.ts`
- Extracts: student name, institution, degree program, overall/major GPA (with scale), academic terms/semesters with courses (code, title, credits, grade), total credits, Dean's list mentions, graduation date
- Insights: high GPA detection, low GPA warning, Dean's list count, missing terms/name warnings

#### C2. Purchase Order (`purchase_order`)
- **File**: `src/lib/extraction/extractors/purchase-order.ts`
- Extracts: PO number, date, buyer/requester, vendor/supplier, ship-to address, line items (description, qty, unit price, total), subtotal, tax, shipping, grand total, currency, payment terms, authorized by, delivery date
- Insights: missing PO number, missing authorization, totals reconciliation check

#### C3. Financial Statement (`financial_statement`)
- **File**: `src/lib/extraction/extractors/financial-statement.ts`
- Extracts: company name, statement period, statement type (Balance Sheet / Income Statement / Cash Flow), key figures (revenue, net income, total assets, total liabilities, equity), year-over-year comparisons, footnotes count
- Insights: profit margin, debt-to-assets ratio, equity-to-assets ratio, YoY data availability

#### C4. Medical / Lab Report (`medical_report`)
- **File**: `src/lib/extraction/extractors/medical-report.ts`
- Extracts: patient name (de-identified as `[PATIENT]`), date, ordering physician, lab name, test results (name, value, unit, reference range, flag), overall status (normal/abnormal/critical), notes
- Insights: de-identification notice, critical/abnormal result flags, missing physician

### D. Types & Classifier Updates

#### D1. `types.ts`
- Added 4 new values to `DocType` union: `"academic_transcript"`, `"purchase_order"`, `"financial_statement"`, `"medical_report"`
- Added 4 new detail interfaces: `AcademicTranscriptDetails`, `PurchaseOrderDetails`, `FinancialStatementDetails`, `MedicalReportDetails`
- Added them to the `TypeDetails` union

#### D2. `classifier.ts`
- Added keyword lists: `TRANSCRIPT_KW` (20 keywords), `PURCHASE_ORDER_KW` (22 keywords), `FINANCIAL_STATEMENT_KW` (22 keywords), `MEDICAL_REPORT_KW` (25 keywords)
- Added filename hints: `/transcript/i`, `/po\d|purchase.?order|requisition/i`, `/financial|balance.?sheet|income.?statement|cash.?flow|10-?k/i`, `/lab-?report|medical|pathology|blood.?work|clinical/i`
- Integrated new types into content scoring

#### D3. `orchestrator.ts`
- Added imports for all 4 new extractors, PII detector, language detector
- Added switch cases for all 4 new types
- Added PII detection pipeline: runs after extraction, generates insight with severity based on findings
- Added language detection pipeline: non-English content triggers insight and -15 completeness penalty
- Added confidence calibration:
  - OCR penalty: -10 completeness
  - Low-confidence field penalty: proportional based on ratio of low-confidence fields
  - Non-English penalty: -15 completeness
  - Per-type importance field weighting via `TYPE_IMPORTANT_FIELDS`
- Updated `labelForType` with 4 new entries

#### D4. `src/components/doclyze/dashboard.tsx`
- Added 4 new entries to `TYPE_ICONS` Record to satisfy the expanded `DocType` union

### E. PII Detection Layer

#### E1. `src/lib/extraction/pii-detector.ts`
- `PIIFinding` interface: type, value, masked, position, severity
- Pattern-based detection: SSN, credit card, phone, email, US passport (near "passport"), date of birth (near "DOB"/"date of birth")
- Medical term dictionary (21 terms): diabetes, hypertension, HIV, cancer, medication, etc.
- Deduplication: overlapping ranges are skipped
- `detectPII(text)` → `PIIFinding[]`
- `summarizePII(findings)` → human-readable summary string
- Integrated into orchestrator as a post-extraction step; high-severity findings generate "warning" insights, others generate "notice"

### F. Language Detection

#### F1. `src/lib/extraction/lang-detect.ts`
- `detectLanguage(text)` → `{ code, name, confidence }`
- Phase 1: Script detection via Unicode ranges (CJK, Cyrillic, Arabic, Devanagari, Thai)
- Phase 2: Keyword-frequency detection for 10 languages (Spanish, French, German, Portuguese, Chinese, Japanese, Korean, Russian, Arabic, Hindi)
- CJK sub-disambiguation: Chinese vs Japanese vs Korean via keyword scoring
- Default: English with `low` confidence
- Integrated into orchestrator: non-English with high/medium confidence triggers insight and -15 completeness penalty

### G. Test Results
All 42 existing tests pass (`bun run test` exits 0). No regressions introduced.
TypeScript compilation clean for all files in `src/lib/extraction/` and `src/components/doclyze/dashboard.tsx`. Pre-existing errors in `examples/`, `skills/`, and `parsers.ts` (pdfjs-dist types) remain unchanged.

---

## Session: UI/Platform Features + SEO Hardening

### H. Command Palette (⌘K)

**Files created:**
- `src/components/doclyze/command-palette.tsx` — Full command palette using shadcn/ui `Command` component
  - Opens on `⌘K` / `Ctrl+K` via keyboard listener
  - Programmatically openable via `openCommandPalette()` event-based API
  - Shows command groups: Navigation (Home, Analyzer), Recent Documents (last 8 from store), Actions (Upload, Toggle Theme, Toggle Sidebar), Settings (Open Settings)
  - Each command has icon + keyboard shortcut where applicable
  - Fuzzy search/filtering via `CommandInput`
  - Closes on Escape or command selection
  - Keyboard navigation via arrow keys + Enter

**Files modified:**
- `src/components/doclyze/sidebar.tsx` — Added ⌘K shortcut hint button in sidebar footer (both expanded and collapsed states)
- `src/components/doclyze/app-shell.tsx` — Integrated CommandPalette, added search icon to mobile top bar, wired settings panel

### I. Batch Upload

**Files modified:**
- `src/components/doclyze/dropzone.tsx`
  - Changed `multiple: false` → `multiple: true`
  - Added `onFiles` prop for multi-file callback
  - Shows file count and total size in preview panel
  - Lists all selected files with individual size/type info

- `src/components/doclyze/analyzer.tsx`
  - Added batch processing queue state (`BatchItem[]` with per-file status: queued/processing/complete/error)
  - Sequential processing: files processed one-by-one
  - Per-file progress tracking within batch view
  - Batch progress view: overall progress bar, per-file cards showing status, type detected, errors
  - On batch completion, switches to most recently completed document
  - Backward compatible: single file still shows existing single-file progress UI

### J. Document History Search/Filter (Dashboard)

**Files modified:**
- `src/components/doclyze/dashboard.tsx`
  - Added text search input (filters by filename and type label)
  - Added type filter dropdown via Popover (All, Resume, Invoice, Contract, etc. with counts)
  - AND logic: both filters apply simultaneously
  - "No matching documents" empty state with clear filters button
  - Reset button when filters are active

### K. Export Report (JSON + Text)

**Files created:**
- `src/components/doclyze/export-report.tsx`
  - Dropdown button with two export options
  - **JSON export**: Full `DoclyzeExtractionResult` as downloadable `.json` via Blob + createObjectURL
  - **Text export**: Formatted plain-text report with document metadata, field groups as key-value pairs, tables as aligned columns, insights with severity tags, and raw text summary
  - Integrated into `insights-panel.tsx` as a toolbar button in the summary card

### L. Redaction Preview Toggle

**Files created:**
- `src/lib/extraction/redact.ts` — `redactText()` function that replaces PII values with masked versions, processing findings in reverse position order to preserve string indices

**Files modified:**
- `src/components/doclyze/analyzer.tsx` (RawTextView)
  - Added "Mask PII" toggle button in raw text tab header
  - When toggled on: runs `detectPII()` + `redactText()` on rawText
  - Displays redacted version with `[REDACTED]` replacements
  - Page-by-page view disabled when redaction is active

### M. SEO Hardening

**Files modified:**
- `src/app/layout.tsx`:
  - Changed `metadataBase` from `doclyze.app` → `doclyze-web.vercel.app`
  - Changed `openGraph.url` from `doclyze.app` → `doclyze-web.vercel.app`
  - Added `alternates.canonical` pointing to `doclyze-web.vercel.app`
  - Added `url` field to JSON-LD structured data
- `src/app/sitemap.ts` — Changed URL from `doclyze.app` → `doclyze-web.vercel.app`
- `src/app/robots.ts` — Changed sitemap URL from `doclyze.app` → `doclyze-web.vercel.app`

### N. Dashboard Enhancements

**Files modified:**
- `src/components/doclyze/dashboard.tsx`
  - Hero/welcome section with stats cards: Total Analyzed, Types Detected, Avg Completeness, Most Common Type
  - Quick-upload card with batch upload mention
  - Type icons in supported types grid
  - Clear all button (already existed)
  - Full search/filter integration (see section J)

### O. Lint Results
`bun run lint` passes with 0 errors (1 pre-existing warning about TanStack Table's useReactTable incompatible-library — not introduced by this session).

---

## Session: Migrate from Zustand Client-Side Routing to Next.js App Router File-System Routes (Task 1-routing)

### Overview
Migrated the entire app from a single-page Zustand-routed architecture (where `view` state in `useDoclyzeStore` controlled which component rendered at `/`) to proper Next.js App Router file-system routes. URLs now change as the user navigates, enabling deep-linking, back-button support, and SEO-crawlable pages.

### P. Route Structure Created

#### P1. Route Group `(app)` with Shared AppShell Layout
- **File**: `src/app/(app)/layout.tsx` — Wraps child routes in `<AppShell>` (sidebar, mobile header, CommandPalette)
- **File**: `src/app/(app)/dashboard/page.tsx` — Renders `<Dashboard />` component
- **File**: `src/app/(app)/analyzer/page.tsx` — Renders `<Analyzer />` component
- The route group `(app)` shares the AppShell chrome between dashboard and analyzer, while the landing page at `/` remains a standalone full-screen layout

#### P2. Landing Page at Root
- **File**: `src/app/page.tsx` — Simplified to a server component that just renders `<Landing />` (no more Zustand view switching or hydration guard)

### Q. Store Refactoring (`src/lib/store.ts`)

#### Q1. Removed View Routing State
- Removed `view: AppView` from `AppState` interface
- Removed `setView` action
- Removed `AppView` type export
- Updated `openDocument` to only set `activeDocumentId` (no longer sets `view: "analyzer"`)
- Updated `addDocument` to only set `activeDocumentId` (no longer sets `view: "analyzer"`)
- Added `setActiveDocument` action for explicit active document control

### R. Component Navigation Updates

All `setView("dashboard")` → `router.push("/dashboard")` via `useRouter` from `next/navigation`
All `setView("analyzer")` → `router.push("/analyzer")`
All `openDocument(id)` paired with `router.push("/analyzer")`

#### R1. `landing.tsx`
- Replaced `useDoclyzeStore((s) => s.setView)` with `useRouter()`
- All 6 navigation calls updated to use `router.push()`

#### R2. `app-shell.tsx`
- Converted from view-switching component to pure layout chrome
- Removed `view` from store destructuring
- Removed `onUploadRequest` prop (no longer needed)
- `<main>` now renders `{children}` instead of conditionally rendering Dashboard/Analyzer

#### R3. `sidebar.tsx`
- Added `useRouter()` and `usePathname()` from `next/navigation`
- Replaced `view === "dashboard"` active check with `pathname === "/dashboard"`
- Replaced `view === "analyzer"` active check with `pathname === "/analyzer"`
- All `setView` calls → `router.push()`
- `openDocument` calls paired with `router.push("/analyzer")`
- SidebarHeader logo click: `useDoclyzeStore.getState().setView("dashboard")` → `router.push("/dashboard")`

#### R4. `dashboard.tsx`
- Added `useRouter()` from `next/navigation`
- Removed `setView` from store destructuring
- All "Open analyzer" / "Analyze document" buttons: `setView("analyzer")` → `router.push("/analyzer")`
- Document card clicks: `openDocument(doc.id)` → `openDocument(doc.id); router.push("/analyzer")`

#### R5. `analyzer.tsx`
- Added `useRouter()` from `next/navigation`
- Removed `setView` from store destructuring (only local `view`/`setView` state for text/pages toggle remains)
- All "Back to dashboard" buttons: `setView("dashboard")` → `router.push("/dashboard")` (5 instances)

#### R6. `command-palette.tsx`
- Added `useRouter()` from `next/navigation`
- Removed `setView` from store destructuring
- Removed `onUploadRequest` prop
- Navigation commands: `setView("dashboard")` → `router.push("/dashboard")`, `setView("analyzer")` → `router.push("/analyzer")`
- Recent document commands: `openDocument(doc.id)` → `openDocument(doc.id); router.push("/analyzer")`
- Upload action: `setView("analyzer"); onUploadRequest?.()` → `router.push("/analyzer")`

### S. Lint Results
`bun run lint` passes with 0 errors (1 pre-existing warning about TanStack Table's useReactTable incompatible-library — not introduced by this session).

---

## Session: Real `<Link>` Elements + DocId Routing (Task 1-routing-complete)

### Overview
Upgraded all client-side navigation from `<button onClick={() => router.push(...)}>` to real `<Link href=...>` elements from `next/link` for accessibility, SEO, and proper browser behavior (right-click open in new tab, etc.). Also wired all post-processing and document-opening flows to navigate to `/analyzer/${docId}` so the URL reflects the specific document.

### T. Sidebar (`src/components/doclyze/sidebar.tsx`)

#### T1. Nav Items Now Use `<Link>`
- Imported `Link` from `next/link`
- Removed `useRouter` and `openDocument` from store destructuring (no longer needed)
- **"Home" nav item**: `<button onClick={() => router.push("/dashboard")}>` → `<Link href="/dashboard">`
- **"Document Analyzer" nav item**: `<button onClick={() => router.push("/analyzer")}>` → `<Link href="/analyzer">`
- **Sidebar header logo**: `<button onClick={() => router.push("/dashboard")}>` → `<Link href="/dashboard">`
- Active state for "Document Analyzer" now also matches `/analyzer/*` paths via `pathname.startsWith("/analyzer/")`
- `NavItem` component refactored: accepts optional `href` prop; renders `<Link>` when `href` is provided, `<button>` otherwise (for non-navigational items like Settings)
- `onClick` now only used for side-effects (e.g., closing mobile drawer), not for navigation

#### T2. Recent Doc Rows Now Use `<Link>`
- **RecentDocRow**: `<button onClick={() => { openDocument(doc.id); router.push("/analyzer") }}>` → `<Link href={/analyzer/${doc.id}}>`
- Active document is resolved by `DocumentPageClient`'s `useEffect` → `setActiveDocument(docId)`, so explicit `openDocument()` call is no longer needed in sidebar
- Removed `router` and `openDocument` references from `Sidebar` component

### U. Analyzer (`src/components/doclyze/analyzer.tsx`)

#### U1. Post-Processing Navigation to `/analyzer/${docId}`
- **Single file** (`handleFile`): Added `router.push(\`/analyzer/${result.documentId}\`)` immediately after `addDocument()`
- **Batch processing** (`handleFiles`): After all files processed, added `router.push(\`/analyzer/${latestDoc.id}\`)` to navigate to the most recently completed document
- Removed unused `lastCompleted` variable from batch completion logic (dead code)

### V. Dashboard (`src/components/doclyze/dashboard.tsx`)

#### V1. Document Cards Now Use `<Link>`
- Imported `Link` from `next/link`
- Document cards: `<Card onClick={() => { openDocument(doc.id); router.push("/analyzer") }}>` → `<Link href={/analyzer/${doc.id}} onClick={() => openDocument(doc.id)}><Card>...</Card></Link>`
- Remove button uses `e.preventDefault()` instead of `e.stopPropagation()` since it's now inside a `<Link>`
- Card padding moved to inner `<div>` (Card uses `p-0` to avoid double-padding with Link wrapper)

### W. Landing Page (`src/components/doclyze/landing.tsx`)

#### W1. Verified Navigation Elements
- In-page anchor links (`<a href="#features">`, `<a href="#how-it-works">`, `<a href="#privacy">`) — correct as `<a>` elements
- Action buttons ("Launch app", "Analyze a document", "View dashboard", CTA) — correctly use `<button onClick={() => router.push(...)}>` (buttons are appropriate for actions)
- Footer "Launch" button — confirmed correct per task specification

### X. Command Palette (`src/components/doclyze/command-palette.tsx`)

#### X1. Verified and Fixed Navigation
- "Go to Home" → `router.push("/dashboard")` ✅ already correct
- "Go to Analyzer" → `router.push("/analyzer")` ✅ already correct
- **Recent doc items**: Changed from `router.push("/analyzer")` → `router.push(\`/analyzer/${doc.id}\`)` for proper docId-aware navigation

### Y. Lint Results
`bun run lint` passes with 0 errors (1 pre-existing warning about TanStack Table's useReactTable incompatible-library — not introduced by this session).

---

## Session: Mobile Mode Sophistication Pass (Task 2-mobile)

### AA. Sidebar Mobile Drawer — Focus Trap
- **File**: `src/components/doclyze/sidebar.tsx`
- Added `mobileDrawerRef` (`useRef<HTMLElement>`) attached to the mobile `<motion.aside>`
- Added `handleDrawerKeyDown` callback that traps Tab/Shift+Tab focus within focusable children (`a[href]`, `button:not([disabled])`, `[tabindex]:not([tabindex="-1"])`)
- Tab at last focusable element wraps to first; Shift+Tab at first wraps to last
- Mobile top bar search icon (⌘K) already correctly wired to `openCommandPalette()` — no changes needed

### AB. Dropzone — Touch-Friendly Copy
- **File**: `src/components/doclyze/dropzone.tsx`
- Changed primary text from "Drag & drop files here" → "Tap to select or drop files"
- Sub-text unchanged: "or browse — PDF, DOCX, TXT, MD, CSV/TSV, images"
- Dropzone area (py-12, px-6) already exceeds 44×44px touch target minimum

### AC. Document Presentor — Card-Per-Row Mobile Layout
- **File**: `src/components/doclyze/document-presentor.tsx`
- Added `LayoutGrid`, `LayoutList` icons
- Added `viewMode` state (`'auto' | 'card' | 'table'`) with `isMobile` tracked via `window.matchMedia('(min-width: 768px)')` + change listener
- `showCards = viewMode === 'card' || (viewMode === 'auto' && isMobile)`
- **Card view**: Each row → `<Card>` with first column as bold title, remaining columns as label-value pairs, reuses `CellRenderer` for type-aware formatting
- **Toggle button**: `md:hidden` button in toolbar; shows "Table View" / "Card View" with appropriate icon
- **Footer**: Simplified centered footer for cards; full confidence-legend footer for table
- Desktop table view completely unchanged

### AD. Analyzer Tabs — Responsive Labels
- **File**: `src/components/doclyze/analyzer.tsx`
- "Structured Sheet" → hidden on mobile, "Sheet" shown instead (via `hidden sm:inline` / `sm:hidden`)
- "Raw Text" → hidden on mobile, "Text" shown instead
- "Insights" unchanged (already short)
- Icons always visible

### AE. Mobile FAB for Quick Upload
- **File**: `src/components/doclyze/analyzer.tsx`
- Added `Upload` icon, `fabInputRef` for hidden file input
- FAB: `md:hidden fixed bottom-5 right-5 z-30`, 48×48px, rounded-full, brand-colored
- Respects iOS safe area via `env(safe-area-inset-bottom)`
- Only renders in results state (when a document is displayed)
- Directly triggers `handleFile()` on file selection

### AF. Lint Results
`bun run lint` passes with 0 errors (1 pre-existing warning about TanStack Table's useReactTable incompatible-library — not introduced by this session).

---

## Session: Light Mode Audit + Developer Credit (Task 3-light-4-credit)

### AG. Light Mode Color Contrast Fix (Section 3.1)

**File**: `src/app/globals.css`

Darkened the `:root` (light mode) OKLCH values for severity and confidence semantic tokens. These colors are used as **text** colors (e.g., `text-[var(--severity-notice)]`, `text-[var(--confidence-high)]`) on near-white backgrounds, so the original values (L 0.62–0.72) failed WCAG AA contrast requirements for small text.

Updated values (lightness reduced to 0.45–0.55):
- `--severity-info`: oklch(0.55 0.13 230) → oklch(0.45 0.15 230)
- `--severity-notice`: oklch(0.7 0.15 75) → oklch(0.55 0.16 75)
- `--severity-warning`: oklch(0.62 0.21 30) → oklch(0.5 0.2 30)
- `--confidence-high`: oklch(0.65 0.16 145) → oklch(0.5 0.16 145)
- `--confidence-medium`: oklch(0.72 0.14 75) → oklch(0.55 0.15 75)
- `--confidence-low`: oklch(0.62 0.21 30) → oklch(0.5 0.2 30)

Dark mode `.dark` values left unchanged (already lighter for dark backgrounds).

### AH. Light Mode Verification (Sections 3.2–3.4)

**3.2 Shadows**: `PreviewTeaser` card uses `shadow-2xl shadow-foreground/5`. In light mode, `--foreground` is dark (L 0.18), so `shadow-foreground/5` creates a subtle dark shadow — correct behavior. ✅

**3.3 Logo**: `src/components/doclyze/logo.tsx` uses `currentColor` for wordmark text (adapts to theme) and `var(--brand)` for accent line/dot (has light/dark variants in CSS). Works correctly in both themes. ✅ Static SVG exports exist in `/public/logo/` (monogram, wordmark, wordmark-light, icons) — these are unused assets from a prior export pass; the inline SVG component is the correct approach.

**3.4 OG image / favicon**: `/public/og-image.png` exists and is referenced in `layout.tsx`. Static images are theme-agnostic. ✅ `/public/logo/` contains PWA icons (icon-192.png, icon-512.png, apple-touch-icon.png). ✅

### AI. Developer Credit — Landing Page Footer (Section 4.1)

**File**: `src/components/doclyze/landing.tsx`
- Added "Built by Abhishek Shah" line after the footer nav links
- Name links to `https://github.com/abhiverse01` (opens in new tab)
- Styled `text-xs text-muted-foreground/70` — understated, on-brand

### AJ. Developer Credit — Settings Panel About (Section 4.2)

**File**: `src/components/doclyze/settings-panel.tsx`
- Expanded the About section with developer info row below the version line
- Shows developer name, GitHub link ("GitHub"), and email link ("Email")
- Styled consistently with existing section: `text-xs text-muted-foreground` with `hover:text-foreground transition-colors`

### AK. README Author Section (Section 4.3)

**File**: `README.md`
- Added "Author" section near the bottom (after License)
- Lists name (Abhishek Shah), GitHub link, and email

### AL. Lint Results
`bun run lint` passes with 0 errors (1 pre-existing warning about TanStack Table's useReactTable incompatible-library — not introduced by this session).
---

## Session: v3 GODMODE — Routing Truth, Mobile, Light Mode, Verified Maturity

### T. Section 0 Audit
Confirmed all 4 v3 findings:
- Routing: CONFIRMED single `/` URL with Zustand view switching — no real routes
- 500-row cap: NOT FOUND in code — no cap AND no virtualization existed
- Unverified claims: ACKNOWLEDGED — no browser testing was done in v2
- Light mode/mobile: NOT independently audited

### U. Section 1: Real File-System Routes
- Created `src/app/(app)/layout.tsx` — shared AppShell layout for dashboard/analyzer
- Created `src/app/(app)/dashboard/page.tsx` — with metadata
- Created `src/app/(app)/analyzer/page.tsx` — with metadata
- Created `src/app/(app)/analyzer/[docId]/page.tsx` + `DocumentPageClient.tsx` — noindex metadata, document-not-found fallback
- Simplified `src/app/page.tsx` to render Landing only
- Removed `view`, `setView`, `AppView` from store
- Updated 6 components: landing, app-shell, sidebar, dashboard, analyzer, command-palette
- Sidebar nav items now use real `<Link href="/dashboard">` and `<Link href="/analyzer">`
- Recent doc items now use `<Link href={/analyzer/${doc.id}}>`
- Sitemap lists 3 real routes; [docId] exclusion documented
- Removed conflicting `/public/robots.txt`

### V. Section 2: Mobile Sophistication
- Focus trap added to mobile sidebar drawer
- Dropzone copy updated for touch devices
- Document Presentor card-per-row layout on mobile with view toggle
- Responsive tab label abbreviation (Sheet, Insights, Text)
- Mobile upload FAB on analyzer results screen

### W. Section 3: Light Mode Audit
- 6 OKLCH semantic tokens darkened for WCAG AA contrast in light mode
- Dark mode values unchanged

### X. Section 4: Developer Credit
- Landing footer: "Built by Abhishek Shah" with GitHub link
- Settings About: name + GitHub + Email
- README: Author section added

### Y. Section 5: Further Sophistication
- `@tanstack/react-virtual` installed and integrated in Document Presentor
- Dashboard analytics: bar chart (docs by type) + line chart (completeness trend)
- Error boundary: class component wrapping (app) layout
- Delete confirmation: AlertDialog + toast
- Keyboard shortcuts reference in Settings

### Z. Verification
- `bun run lint`: 0 errors (3 pre-existing warnings)
- `bun run test`: 42/42 tests pass
- Agent-browser: landing, /dashboard, /analyzer, /analyzer/[docId] all render
- Back/forward navigation confirmed between routes
- Mobile tested at 375px and 430px viewports
- Light and dark mode screenshots captured
- Sitemap verified: 3 URLs listed, no docId routes
- robots.txt verified after removing conflicting public file

---
Task ID: v4
Agent: Main (Super Z)
Task: GODMODE AGENT PROMPT v4 — Architectural Maturity & Document Presentor Sophistication

Work Log:
- Conducted Section 0 audit: read all critical source files (store, sidebar, document-presentor, app-shell, settings-panel, command-palette, analyzer, insights-panel, globals.css, export-report)
- Found table-sheet.tsx truncated mid-line (build-breaking corruption) — reconstructed the complete 310-line component
- Confirmed 0.1 (store idempotency), 0.3 (skeletons), 0.4 (settings dual-state), 0.5 (CSS scoping) were already fixed
- Corrected 0.2 hypothesis: navigation uses correct `<Link>` from next/link, no code change needed
- Audited all 9 toggleable UI surfaces for single-source-of-truth — zero dual-state issues found
- Fixed 9 unjustified `any` type annotations across 4 files (dropzone, parsers, insights/route, resume)
- Fixed 3 error/feedback consistency violations (redundant toast, 2 silent clipboard failures)
- Fixed TypeScript compilation errors (PDFDocumentProxy import, Uint8Array BlobPart, unknown severity narrowing, removed deprecated pdfjs options)
- All 59 tests passing, TypeScript compiles clean
- Updated CHANGELOG.md with comprehensive v4.0.0 entry

Stage Summary:
- Section 0: 5 items audited, 3 confirmed-fixed, 2 corrected hypotheses (no code change needed)
- Section 1: Store invariants documented, rehydration validated, 17 store tests, type sweep complete, error consistency enforced
- Section 2: All 8 features verified implemented (provenance, inline correction, insight-to-cell linking, search/filter, annotations, charting, report export, comparison scoped out)
- Critical bug fix: reconstructed corrupted table-sheet.tsx
- Files changed: table-sheet.tsx, dropzone.tsx, parsers.ts, route.ts, resume.ts, field-group-sheet.tsx, analyzer.tsx, CHANGELOG.md---
Task ID: 1
Agent: main
Task: v5 GODMODE — Duplicate bug fix, file integrity, classifier overhaul, edge-case hardening

Work Log:
- Audited all key source files (store.ts, dropzone.tsx, analyzer.tsx, classifier.ts, orchestrator.ts, sidebar.tsx, table-sheet.tsx, app-shell.tsx, settings-panel.tsx)
- Root-caused duplicate bug to Dropzone double-fire (onFile + onFiles for single file)
- Fixed dropzone.tsx to only call onFiles
- Created scripts/check-file-integrity.ts safeguard
- Rebuilt classifier.ts with normalized scoring, structural signals, cross-type disambiguation, numeric confidence
- Added classification evaluation corpus (75 files in __fixtures__/classification/)
- Added manual reclassification control in analyzer UI
- Added classificationConfidence to types, store, orchestrator, analyzer
- Added edge-case tests (14 tests)
- Updated all tests for v5 changes

Stage Summary:
- Duplicate bug: Root cause confirmed and fixed at call site (Dropzone)
- Classifier: Rebuilt with 5 major improvements, 162 tests all pass
- File integrity: Safeguard script runs as part of test command
- Manual reclassification: Dropdown in analyzer UI
- CHANGELOG.md created

---
Task ID: v6
Agent: main
Task: Layout-Aware Extraction Engine rebuild (v6)

Work Log:
- Read and analyzed all extraction pipeline files (parsers.ts, general.ts, orchestrator.ts, types.ts, normalize.ts)
- Diagnosed 4 root causes for Section 0 defects
- Created src/lib/extraction/clean-span.ts — shared punctuation trimming utility
- Created src/lib/extraction/layout.ts — full layout analysis module (column detection, heading detection, table detection, reading order)
- Rebuilt src/lib/extraction/parsers.ts — PDF parser retains positional/font-size data, DOCX parser extracts heading structure
- Rebuilt src/lib/extraction/extractors/general.ts — structure tree, layout-aware extraction, entity discrimination, structural quality reporting
- Applied cleanExtractedSpan to all regex extraction sites in 5 extractors (general, resume, invoice, contract, purchase-order, medical-report)
- Updated URL regex patterns in general.ts and resume.ts to exclude trailing punctuation at match level
- Updated orchestrator.ts to pass layoutData to general extractor and store structureTree
- Updated types.ts with layoutData and structureTree fields
- Fixed table-sheet.tsx cellType meta propagation bug
- Created src/components/doclyze/presentor/structure-view.tsx — Document Structure view component
- Added Structure tab to analyzer.tsx
- Created 9 evaluation corpus fixture files in __fixtures__/structural/
- Created 3 new test files (clean-span.test.ts, layout.test.ts, v6-fixtures.test.ts) with 40 new tests

Stage Summary:
- 0 TypeScript errors in src/
- 202/202 tests pass (162 existing + 40 new)
- All 4 Section 0 defects addressed with architectural fixes
- New files: clean-span.ts, layout.ts, structure-view.tsx, 3 test files, 9 fixture files
- Modified files: parsers.ts, general.ts, orchestrator.ts, types.ts, invoice.ts, resume.ts, contract.ts, purchase-order.ts, medical-report.ts, analyzer.tsx, table-sheet.tsx, CHANGELOG.md, EXTENDING.md

---
Task ID: 1
Agent: main (v7 verification pass)
Task: v7 Live Verification Gate — verify v6 layout-aware extraction against real PDFs

Work Log:
- Read and audited all v6 code: layout.ts, parsers.ts, clean-span.ts, general.ts, orchestrator.ts, types.ts
- Audited the v6 column-detection test: used pageWidth=800 (non-standard) with 350pt gap (trivially easy). Algorithm threshold (12% pageWidth) was NOT calibrated against real geometry but is defensible.
- Generated 3 real PDFs via ReportLab: lecture-slides.pdf (multi-heading, 2-col table, URL with trailing quote), multi-table.pdf (2/3/4-col tables on A4), narrow-columns.pdf (3-column layout on Letter)
- Ran programmatic live verification: actual pdfjs-dist extraction → layout analysis → extractGeneral pipeline against all 3 real PDFs
- Found and fixed 3 bugs in v6 code:
  1. Heading levels were per-page, not global — same font-size got different levels on different pages
  2. No font-size clustering — 5 distinct sizes spread across 4 levels when document had 2-3 semantic levels
  3. reassignHeadingLevelsGlobally re-filtered headings against global body size, dropping legitimate headings from pages with smaller body text
- Ran regression smoke test: resume (3/3), invoice (4/4), contract (2/2) — all pass
- Added 4 new v7 tests to layout.test.ts
- Full test suite: 206 tests, 0 failures
- Updated CHANGELOG.md with v7 entry

Stage Summary:
- All 4 original defects verified FIXED against real PDFs (not synthetic fixtures)
- 3 code fixes applied to layout.ts (global heading levels, font-size clustering, re-filter bug)
- Column-detection threshold (12% pageWidth) confirmed reasonable for Letter/A4/Widescreen — NOT changed
- 0 regressions in existing document types
- Note: browser-based live test could not be performed due to Next.js dev server being killed by sandbox memory limits. Programmatic verification (same extraction pipeline, real PDFs, real pdfjs-dist) was used instead.
