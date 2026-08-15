/**
 * File Integrity Safeguard (v9)
 * =============================
 * Fails if any tracked file is:
 *   - Empty (0 bytes)
 *   - Doesn't end with a newline AND the final character is not
 *     a plausible statement/block terminator (catches mid-line truncation)
 *
 * v9: Expanded coverage to include documentation files (.md, .mdx)
 * in addition to source code. CHANGELOG.md was found truncated in v8
 * because this script only covered src/ and tests/.
 *
 * Run: bun run scripts/check-file-integrity.ts
 */

import { readdir, stat, readFile, lstat } from "node:fs/promises";
import { join, extname, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC_DIRS = ["src", "tests"];
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const DOC_EXTS = new Set([".md", ".mdx"]);
const DOC_FILES = ["README.md", "CHANGELOG.md", "EXTENDING.md", "CONTRIBUTING.md"];

/** Characters that are plausible end-of-file terminators even without a trailing newline */
const PLAUSIBLE_CODE = ["}", ")", "]", ";", ",", "`"];
/** For markdown, ending without newline is acceptable if it ends with a block element */
const PLAUSIBLE_MD = ["`", ")", "]", "|", "#", "-", ">", "*"];

let errors = 0;
let warnings = 0;
let checked = 0;

async function walk(dir: string, exts: Set<string>): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === ".next" || entry.name === "download") continue;
    if (entry.isDirectory()) {
      results.push(...(await walk(full, exts)));
    } else if (exts.has(extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

async function checkFile(file: string, plausibleEndings: string[]): Promise<void> {
  checked++;
  const rel = relative(ROOT, file);
  try {
    const buf = await readFile(file);
    const content = buf.toString("utf-8");

    // 1. Empty file
    if (buf.length === 0) {
      errors++;
      console.error(`  ❌ ${rel}: file is empty (0 bytes)`);
      return;
    }

    // 2. Missing trailing newline + bad final character = likely truncated
    if (!content.endsWith("\n")) {
      const lastChar = content[content.length - 1];
      if (!plausibleEndings.includes(lastChar)) {
        errors++;
        console.error(
          `  ❌ ${rel}: does not end with newline and ends with 0x${lastChar.charCodeAt(0).toString(16)} "${lastChar}" — likely truncated mid-line`
        );
      } else {
        warnings++;
      }
    }

    // 3. Check for null bytes (sign of binary corruption in text files)
    if (buf.includes(0x00)) {
      errors++;
      console.error(`  ❌ ${rel}: contains null bytes — likely corrupted`);
    }
  } catch (err) {
    errors++;
    console.error(`  ❌ ${rel}: failed to read: ${err}`);
  }
}

async function main() {
  console.log("\n🔍 File Integrity Check (v9)\n");

  // Check source code files
  for (const dir of SRC_DIRS) {
    const fullDir = join(ROOT, dir);
    let statResult;
    try {
      statResult = await stat(fullDir);
    } catch {
      continue;
    }
    if (!statResult.isDirectory()) continue;

    const files = await walk(fullDir, CODE_EXTS);
    for (const file of files) {
      await checkFile(file, PLAUSIBLE_CODE);
    }
  }

  // Check root documentation files
  for (const docFile of DOC_FILES) {
    const fullPath = join(ROOT, docFile);
    try {
      const s = await lstat(fullPath);
      if (s.isFile()) {
        await checkFile(fullPath, PLAUSIBLE_MD);
      }
    } catch {
      // File doesn't exist — that's fine, not all docs are required
    }
  }

  // Check any .md/.mdx files in src/ (e.g. inline docs)
  for (const dir of SRC_DIRS) {
    const fullDir = join(ROOT, dir);
    let statResult;
    try {
      statResult = await stat(fullDir);
    } catch {
      continue;
    }
    if (!statResult.isDirectory()) continue;

    const mdFiles = await walk(fullDir, DOC_EXTS);
    for (const file of mdFiles) {
      await checkFile(file, PLAUSIBLE_MD);
    }
  }

  console.log(`  Checked ${checked} files, ${errors} error(s), ${warnings} warning(s) (missing trailing newline only).\n`);
  if (errors > 0) {
    console.error("  ⛔ File integrity check FAILED — fix the above errors before proceeding.\n");
    process.exit(1);
  } else {
    console.log("  ✅ All files pass integrity check.\n");
  }
}

main();
