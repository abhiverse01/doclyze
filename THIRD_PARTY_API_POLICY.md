# Third-Party Library API Verification Policy

## Context

In v8, two calls were made to `pdfjs-dist` APIs that don't exist in the installed version:
- `paintJpegXObject` (does not exist; should be `paintImageXObject` / `paintImageXObjectRepeat`)
- `page.getObjects()` (does not exist on `PDFPageProxy`; should use `page.getOperatorList()`)

These compiled under `tsc --noEmit` because the calls were wrapped in `any` casts, but caused runtime failures. Neither `tsc` nor the unit tests caught these because the mock-based tests never exercise the real pdfjs runtime.

## Policy

**Before calling any method on a third-party library that hasn't already been proven working in this codebase:**

1. **Check the installed type definitions** — Look at `node_modules/<package>/` for `.d.ts` files or source to confirm the method exists and has the expected signature.
2. **Prefer typed imports** — Import specific types/interfaces rather than using `any` casts that bypass type checking.
3. **Document the verification** — Add a brief comment noting the API was verified against the installed version.
4. **If unsure, use a runtime check** — `if (typeof obj.method === 'function')` guards prevent crashes from API changes.

## Verified APIs (pdfjs-dist v6.2.108)

| API | Status | Verified Against |
|-----|--------|------------------|
| `pdfjsLib.getDocument()` | Working | Type defs + runtime |
| `pdfjsLib.GlobalWorkerOptions.workerSrc` | Working | Type defs + runtime |
| `pdfjsLib.OPS.paintImageXObject` | Working | `node_modules/pdfjs-dist/legacy/build/pdf.mjs` enum |
| `pdfjsLib.OPS.paintImageXObjectRepeat` | Working | `node_modules/pdfjs-dist/legacy/build/pdf.mjs` enum |
| `page.getOperatorList()` | Working | Type defs + runtime |
| `page.getTextContent()` | Working | Type defs + runtime |
| `page.getViewport()` | Working | Type defs + runtime |
| `page.render()` | Working | Type defs + runtime |

## Non-Existent APIs (do NOT use)

| API | Why it doesn't exist |
|-----|---------------------|
| `page.getObjects()` | Not a method on `PDFPageProxy` |
| `pdfjsLib.OPS.paintJpegXObject` | Removed in pdfjs-dist v4+; use `paintImageXObject` |

*Last updated: v9 (2026-08-15)*
