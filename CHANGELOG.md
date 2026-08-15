# Changelog

All notable changes to the Doclyze project are documented in this file.


## v10 (2026-08-15)

### Purpose
v9 built a Playwright gate but the next pass didn't run it. v10 enforces the gate as mandatory, fixes the gate's own test failures, adds interaction tests, formalizes the navigation model, audits the MIME-type pattern, and modernizes the sidebar.

### Gate
**Status: PASS — 126 files OK, 218/218 unit, 9/9 Playwright.**
- Fixed 2 gate test failures: strict-mode selector in settings test, listener cleanup TypeError in scroll-behavior test.
- Added CTA button rendering test (Bug #8/#9).
- Total: 3 console-error route tests + 6 interaction tests = 9 Playwright tests.
- VERIFICATION.md: Expanded with interaction-bug classification, navigation model docs, MIME safety rule.

### Navigation Model (Section 2)
- Decided and documented: Logo inside app → `/dashboard` (app home). Homepage → explicit `ExternalLink` link in sidebar footer → `/`.
- Applied consistently across: sidebar header, mobile header, app-shell header.
- Command palette navigates only to app routes (`/dashboard`, `/analyzer`) — correct by design.

### MIME Audit (Section 3)
- 0 new vulnerable instances found across 5 source files with `new Blob`/`new File`.
- All export paths (JSON, CSV, HTML, text) use correct MIME for their content and do NOT re-feed through the extraction pipeline.
- Shared helper `synthetic-file.ts` already exists and is used by the reclassify path.

### Settings/Search Positioning (Section 4)
- Root cause: The original complaint was about an inline settings panel at the bottom of the sidebar. This was already fixed by converting settings to a Dialog in the prior pass.
- Current sidebar footer layout (settings button + search bar + homepage link + version) is structurally correct — flex column with ScrollArea `flex-1` above it.
- No positioning bug remains.

### Sidebar Modernization (Section 5)
- Added time-based document grouping: "Today", "Earlier this week", "Older" (expanded mode only; collapsed shows flat list).
- Improved hover/active states on NavItem and RecentDocRow: added `active:bg-sidebar-accent/80 active:scale-[0.995]` for press feedback.
- Quality signals (confidence %, OCR badge) remain well-integrated with color-coded type icons — no visual competition.
- Mobile drawer reuses the same grouped `recent` variable.

### Homepage CSS (Section 6)
- Verified via Playwright: hero CTA buttons ("Analyze a document", "View dashboard") and navbar "Launch app" button all render correctly.
- FeatureCard gradient hovers and PipelineStages staggered animations are structurally sound (code-reviewed).

### 11-Bug Live Verification Status
| # | Bug | Status |
|---|-----|--------|
| 1 | Sidebar can't reopen | Confirmed live (Playwright) |
| 2 | Sidebar UI boring | Code-reviewed (visual) |
| 3 | Reclassify crashes PDFs | Code-reviewed only (needs seeded state) |
| 4 | Recent docs not clickable | Code-reviewed only (needs seeded state) |
| 5 | No way home from dashboard | Confirmed live (Playwright) |
| 6 | Settings too low/ugly | Confirmed live (Playwright dialog test) |
| 7 | Logo navigation broken | Confirmed live (Playwright) |
| 8 | Analyze button CSS | Confirmed live (Playwright CTA test) |
| 9 | Navbar button bulky | Confirmed live (Playwright CTA test) |
| 10 | Capabilities/stages design | Code-reviewed (visual) |
| 11 | scroll-behavior warning | Confirmed live (Playwright console capture) |

### Tests
- 218/218 unit tests.
- 9/9 Playwright tests (3 route smoke + 6 interaction).
- Build passes clean.
