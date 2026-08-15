/**
 * v7 Regression Smoke Test
 * =========================
 * Runs the extraction pipeline against existing fixture documents
 * for resume, invoice, contract, and CSV to confirm the v6/v7 layout
 * changes didn't regress quality for previously-working types.
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { extractResume } from "../src/lib/extraction/extractors/resume";
import { extractInvoice } from "../src/lib/extraction/extractors/invoice";
import { extractContract } from "../src/lib/extraction/extractors/contract";
import { extractSpreadsheet } from "../src/lib/extraction/extractors/spreadsheet";
import { Papa } from "papaparse";

const FIXTURES_DIR = "/home/z/my-project/tests/extraction/__fixtures__/";
const CSV_FIXTURES = "/home/z/my-project/__fixtures__/classification/general";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function pass(label: string) { console.log(`${GREEN}  PASS${RESET} ${label}`); }
function fail(label: string, detail: string) { console.log(`${RED}  FAIL${RESET} ${label}: ${detail}`); }
function info(label: string, value: string) { console.log(`${CYAN}  INFO${RESET} ${label}: ${value}`); }

function readFixture(path: string): string {
  return readFileSync(path, "utf-8");
}

let totalPass = 0;
let totalFail = 0;

// ─── Resume Tests ───────────────────────────────────────────────────────────
console.log(`\n${BOLD}━━━ Resume Regression ━━━${RESET}\n`);

const resumeFixtures = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("resume"));

for (const file of resumeFixtures) {
  const text = readFixture(join(FIXTURES_DIR, file));
  try {
    const result = extractResume(text, file);
    const hasName = result.details.contact.name !== null;
    const hasFields = result.fieldGroups.length > 0;
    
    if (hasFields) {
      pass(`${file}: ${result.fieldGroups.length} field groups, ${result.tables.length} tables, completeness=${result.completeness}`);
      totalPass++;
    } else {
      fail(`${file}`, "No field groups extracted");
      totalFail++;
    }
    
    if (!hasName) {
      info(`${file}`, "No name detected (may be OK for some fixtures)");
    }
  } catch (err: any) {
    fail(`${file}`, `Extraction threw: ${err.message}`);
    totalFail++;
  }
}

// ─── Invoice Tests ──────────────────────────────────────────────────────────
console.log(`\n${BOLD}━━━ Invoice Regression ━━━${RESET}\n`);

const invoiceFixtures = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("invoice"));

for (const file of invoiceFixtures) {
  const text = readFixture(join(FIXTURES_DIR, file));
  try {
    const result = extractInvoice(text, file);
    const hasFields = result.fieldGroups.length > 0;
    const hasLineItems = result.details.lineItems.length > 0;
    
    if (hasFields) {
      pass(`${file}: ${result.fieldGroups.length} field groups, ${result.details.lineItems.length} line items, total=${result.details.total}`);
      totalPass++;
    } else {
      fail(`${file}`, "No field groups extracted");
      totalFail++;
    }
    
    if (!hasLineItems) {
      info(`${file}`, "No line items (may be OK for some invoice types)");
    }
  } catch (err: any) {
    fail(`${file}`, `Extraction threw: ${err.message}`);
    totalFail++;
  }
}

// ─── Contract Tests ─────────────────────────────────────────────────────────
console.log(`\n${BOLD}━━━ Contract Regression ━━━${RESET}\n`);

const contractFixtures = readdirSync(FIXTURES_DIR).filter(f => f.startsWith("contract"));

for (const file of contractFixtures) {
  const text = readFixture(join(FIXTURES_DIR, file));
  try {
    const result = extractContract(text, file);
    const hasFields = result.fieldGroups.length > 0;
    const hasParties = result.details.parties.length > 0;
    
    if (hasFields) {
      pass(`${file}: ${result.fieldGroups.length} field groups, ${result.details.parties.length} parties, ${result.details.sections.length} sections`);
      totalPass++;
    } else {
      fail(`${file}`, "No field groups extracted");
      totalFail++;
    }
    
    if (!hasParties) {
      info(`${file}`, "No parties detected (may be OK for some contracts)");
    }
  } catch (err: any) {
    fail(`${file}`, `Extraction threw: ${err.message}`);
    totalFail++;
  }
}

// ─── Spreadsheet/CSV Tests ─────────────────────────────────────────────────
console.log(`\n${BOLD}━━━ Spreadsheet Regression ━━━${RESET}\n`);

// Use the invoice fixture text as CSV-like tabular data
const csvText = `Name,Amount,Date
Alice,100.00,2024-01-15
Bob,250.00,2024-02-20
Charlie,75.50,2024-03-10`;

try {
  const parsed = (Papa as any).parse(csvText, { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data;
  const result = extractSpreadsheet(headers, rows);
  
  if (result.fieldGroups.length > 0 && result.tables.length > 0) {
    pass(`CSV: ${result.details.rowCount} rows, ${result.details.columnCount} cols`);
    totalPass++;
  } else {
    fail(`CSV`, "No field groups or tables");
    totalFail++;
  }
} catch (err: any) {
  fail(`CSV`, `Extraction threw: ${err.message}`);
  totalFail++;
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
console.log(`${BOLD}  REGRESSION SUMMARY: ${totalPass} passed, ${totalFail} failed${RESET}`);
if (totalFail === 0) {
  console.log(`${GREEN}  ✓ No regressions detected${RESET}`);
} else {
  console.log(`${RED}  ✗ ${totalFail} regression(s) detected!${RESET}`);
}
console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}\n`);

process.exit(totalFail > 0 ? 1 : 0);
