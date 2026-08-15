# Extending Doclyze

This document describes specific extension points for future development.

---

## Two-Document Comparison (MVP)

### Goal
Enable side-by-side structured-diff view for two documents of the same type (e.g. two resumes, two versions of a contract).

### Prerequisites
- Both documents must be in the Zustand store with full `result` in memory
- Both documents must share the same `detectedType`
- Field groups must have matching `id` / `key` values (this is already true for same-type docs since extractors use fixed field keys)

### Implementation Plan

#### 1. Comparison State (store)
Add to `src/lib/store.ts`:
```ts
comparisonIds: [string, string] | null;  // two document IDs
setComparison: (ids: [string, string] | null) => void;
```
Persist this to localStorage (IDs only, not results).

#### 2. Comparison Selector UI
In the Dashboard, add a "Compare" mode:
- When 2+ documents of the same type exist, show a "Compare" button
- Opens a selection UI (checkboxes) to pick exactly 2 documents
- Validates same type, sets `comparisonIds` in store, navigates to `/analyzer/compare`

#### 3. New Route: `/analyzer/compare`
Create `src/app/(app)/analyzer/compare/page.tsx`:
- Server component wrapper
- Client component `CompareView` that reads `comparisonIds` from store
- Retrieves both full results from the store
- Renders side-by-side panels

#### 4. Comparison Component: `CompareView`
File: `src/components/doclyze/compare-view.tsx`

**Field Group Diff:**
- For each field group, render a 3-column layout: Field | Doc A Value | Doc B Value
- Highlight cells that differ (background color)
- Show confidence comparison
- Allow toggling "show only differences"

**Table Diff:**
- For tables, use a row-by-row comparison keyed on the first column or a natural key
- Highlight added/removed/changed rows
- Use a simple diff algorithm (LCS-based or row hashing)

**Insight Comparison:**
- Show insights from both documents side-by-side
- Highlight insights that appear in one but not the other

#### 5. Estimated Complexity
- **Store changes**: ~20 lines
- **Dashboard selector**: ~100 lines
- **CompareView component**: ~400-500 lines
- **Route files**: ~30 lines
- **Total**: ~600-650 lines of new code

#### 6. Key Design Decisions
- **No backend needed**: Comparison runs entirely client-side using in-memory results
- **Result availability**: After page refresh, results are stripped from persistence. The compare view should detect this and prompt the user to re-analyze both documents
- **Table diff strategy**: Use first text column as a natural key for row matching. If no suitable key exists, fall back to positional matching with a visual indicator that positional matching is being used
- **Export**: Add a "Compare" export option that generates a diff report (similar to the existing report export but with diff annotations)

---

## Other Extension Points

### AI-Powered Field Suggestions
Use the LLM insight endpoint to suggest corrections for low-confidence fields. The response schema would need a new `suggestedCorrections` field.

### Cloud Sync
Replace localStorage persistence with a server-side store (Prisma + SQLite already exist in the project). The API routes at `/api/` could be extended for CRUD on documents.

### Real-Time Collaboration
Use WebSocket or Supabase realtime to allow multiple users to view/annotate the same document simultaneously.

### Additional File Formats
- PPTX: Use `python-pptx` via the existing Python runtime bridge
- Images (JPG/PNG without OCR metadata): Already supported via Tesseract OCR
- Email (.eml/.msg): Parse with a dedicated extractor

---

*Last updated: v6 (2026-08-14)*
