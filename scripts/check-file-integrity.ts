/**
 * File Integrity Safeguard (v5)
 * =============================
 * Fails if any tracked source file is:
 *   - Empty (0 bytes)
 *   - Doesn't end with a newline AND the final character is not
 *     a plausible statement/block terminator (catches mid-line truncation)
 *
 * Run: bun run scripts/check-file-integrity.ts
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { join, extname, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC_DIRS = ["src", "tests"];
const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);

/** Characters that are plausible end-of-file terminators even without a trailing newline */
const PLAUSIBLE = ["}", ")", "]", ";", ",", "`" ];

let errors = 0;
let warnings = 0;
let checked = 0;

async function walk(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === ".next") continue;
    if (entry.isDirectory()) {
      results.push(...(await walk(full)));
    } else if (CODE_EXTS.has(extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

async function main() {
  console.log("\n🔍 File Integrity Check\n");

  for (const dir of SRC_DIRS) {
    const fullDir = join(ROOT, dir);
    let statResult;
    try {
      statResult = await stat(fullDir);
    } catch {
      continue;
    }
    if (!statResult.isDirectory()) continue;

    const files = await walk(fullDir);
    for (const file of files) {
      checked++;
      const rel = relative(ROOT, file);
      try {
        const buf = await readFile(file);
        const content = buf.toString("utf-8");

        // 1. Empty file
        if (buf.length === 0) {
          errors++;
          console.error(`  ❌ ${rel}: file is empty (0 bytes)`);
          continue;
        }

        // 2. Missing trailing newline + bad final character = likely truncated
        if (CODE_EXTS.has(extname(file)) && !content.endsWith("\n")) {
          const lastChar = content[content.length - 1];
          if (!PLAUSIBLE.includes(lastChar)) {
            errors++;
            console.error(
              `  ❌ ${rel}: does not end with newline and ends with 0x${lastChar.charCodeAt(0).toString(16)} "${lastChar}" — likely truncated mid-line`
            );
          } else {
            warnings++;
          }
        }
      } catch (err) {
        errors++;
        console.error(`  ❌ ${rel}: failed to read: ${err}`);
      }
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
