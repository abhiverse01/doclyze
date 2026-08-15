# VERIFICATION.md — Doclyze Quality Gate Policy

## The gate is mandatory, not optional.

Every code change pass on this project **must** end by running the full gate:

```bash
bun run test:gate
```

This command runs three checks in sequence:

1. **File integrity check** (`scripts/check-file-integrity.ts`) — catches truncated files
2. **Unit tests** (`vitest run`) — 218 tests covering extraction, store, normalization, etc.
3. **Playwright smoke + interaction tests** (`playwright test`) — loads every real route, clicks toggles, opens dialogs, verifies navigation, and fails on any console error or React warning

### The gate's final report MUST open with:

> **Gate status: [PASS/FAIL]** — [brief detail of what passed/failed]

No other content may precede this line. If the gate was not run, the pass is not done — full stop.

## Why the gate exists

This project has a documented history (v3–v10) of bugs that passed `tsc --noEmit`, `next build`, and all unit tests but shipped as user-facing crashes:

- v8: `ReferenceError: Type is not defined` on the landing page (missing import)
- v8: Duplicate React keys (`layout-table-0` on multiple pages)
- v9: `tsc` and `next build` passed while 6 real bugs existed
- v10: A reclassify button crashed with "Invalid PDF structure" because a synthetic File was constructed with the wrong MIME type
- v10: The gate itself caught 2 test failures (strict-mode selector violation, listener cleanup TypeError) that would have been reported as "verified" if only static checks were used

Type checking and production builds verify **static** correctness. Playwright smoke tests verify **dynamic, runtime** correctness — the things a user actually experiences when clicking around.

### What the gate does NOT catch

- Visual design issues (wrong colors, bad spacing, ugly layout)
- Business logic errors in extraction accuracy
- Performance problems
- Mobile responsiveness beyond what the viewport emulation covers

These require manual review, screenshot comparison, or additional test infrastructure.

## Interaction bugs require interaction tests

If a bug was originally found by a user *clicking something*, then verifying it with `tsc` or `next build` alone is insufficient. A Playwright interaction test that reproduces the exact click must exist before the bug can be marked as verified.

### Classification of verification levels

- **Confirmed live**: A Playwright test clicks the exact element and asserts the expected outcome.
- **Code-reviewed only**: The fix is correct in code, but no Playwright test reproduces the interaction (e.g., requires seeded localStorage). These must be flagged explicitly in the pass report.

## Adding new smoke tests

- Test files live in `tests/smoke/`
- Routes tested must cover every user-accessible path
- Interaction tests (clicking, toggling, navigating) go in `tests/smoke/interactions.spec.ts`
- See `tests/smoke/console-errors.spec.ts` for the pattern

## Navigation model (v10)

The project has two distinct entry points:
- `/` — Public marketing/landing page
- `/dashboard` — App home (inside the sidebar shell)

**Rule**: Logo/wordmark inside the app context (sidebar header, mobile header) always navigates to `/dashboard`. A separate, visually distinct "Homepage" link with an `ExternalLink` icon in the sidebar footer provides the path back to `/`. This separation is documented in comments in `sidebar.tsx` and `app-shell.tsx`.

## MIME-type safety (v10)

When constructing a File/Blob from already-extracted text and feeding it back through the extraction pipeline, **always** use `text/plain` as the MIME type — never the original file's type. The shared helper `src/lib/extraction/synthetic-file.ts` (`createTextFileFromExtracted`) is the single correct way to do this.

## In this sandbox

The Playwright `/analyzer` route test times out because the Turbopack dev server takes >60s to compile the heavy client bundle (tesseract.js, pdfjs-dist) in this resource-constrained environment. This is a **sandbox infrastructure limitation**, not an app bug. The route serves correctly via `curl` (200 in 5.5s) and passes production builds.

The `agent-browser` tool cannot connect to the dev server in this sandbox. Live visual verification requires either the Playwright tests (which use their own browser) or a local development environment outside the sandbox.
