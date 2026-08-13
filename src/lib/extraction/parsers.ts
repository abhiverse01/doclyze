/**
 * Parsers -- turn raw file bytes into normalized text (and page list for PDFs).
 * All run on the client (no server roundtrip needed for v1).
 * Heavy work (OCR) is offloaded to a Web Worker via tesseract.js.
 */

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import mammoth from "mammoth/mammoth.browser.js";
import Papa from "papaparse";
import { createWorker } from "tesseract.js";

import { normalizeText } from "./normalize";

// --- PDF.js worker bootstrap ---------------------------------------------
// The worker file in /public is a copy of
// node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs and MUST be kept
// in sync when upgrading pdfjs-dist (run: cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs public/).
//
// CRITICAL: We set the worker URL eagerly at MODULE LOAD TIME (synchronous
// assignment). The previous implementation used an async ensurePdfjs()
// that was called WITHOUT await on line 63, creating a race condition:
//   pdfjsLib.getDocument() executed BEFORE the workerSrc was set,
//   causing: "No GlobalWorkerOptions.workerSrc specified."
//
// We use the legacy build because the standard build relies on top-level
// await which Turbopack (Next.js 16 default bundler) cannot bundle.
// The /public path is always correct in both dev and production.
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export interface ParseOutput {
  text: string;
  pages: string[];
  ocrUsed: boolean;
  /** For CSV/TSV -- the parsed rows, so we don't have to re-parse downstream. */
  tabular?: { headers: string[]; rows: Record<string, string | number | null>[] };
}

/** Sniff the real MIME type from magic bytes -- never trust the extension alone. */
export function sniffMimeType(bytes: Uint8Array, fallback: string): string {
  const b = bytes;
  // PDF: %PDF-
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // WEBP
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "image/webp";
  // ZIP-family (DOCX/XLSX/PPTX are zip)
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07)) {
    return "application/zip";
  }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  return fallback;
}

/**
 * ensurePdfjs -- no-op safety check. Worker URL is set at module level above.
 */
function ensurePdfjs() {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
}

async function parsePdf(
  bytes: Uint8Array,
  onProgress?: (stage: string, pct: number) => void
): Promise<ParseOutput> {
  ensurePdfjs();

  onProgress?.("extracting_text", 0.1);
  let pdf: PDFDocumentProxy;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: bytes,
    });
    pdf = await loadingTask.promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF parsing failed: ${msg}. The file may be corrupted or password-protected.`);
  }

  const pages: string[] = [];
  let totalText = "";
  let needsOcr = true;
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.("extracting_text", 0.1 + 0.6 * (i / pdf.numPages));
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lines: { y: number; parts: string[] }[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      let line = lines.find((l) => Math.abs(l.y - y) < 3);
      if (!line) {
        line = { y, parts: [] };
        lines.push(line);
      }
      line.parts.push(item.str);
    }
    lines.sort((a, b) => b.y - a.y);
    const pageText = lines
      .map((l) => l.parts.join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    pages.push(pageText);
    totalText += pageText + "\n\n";
    if (pageText.trim().length > 80) needsOcr = false;
  }

  // OCR fallback for scanned PDFs
  if (needsOcr && pdf.numPages > 0) {
    onProgress?.("running_ocr", 0.7);
    const ocrText = await runOcrOnPdfPages(pdf, onProgress);
    if (ocrText.trim().length > 0) {
      return {
        text: normalizeText(ocrText),
        pages: [ocrText],
        ocrUsed: true,
      };
    }
  }

  onProgress?.("extracting_text", 0.95);
  return { text: normalizeText(totalText), pages, ocrUsed: false };
}

async function runOcrOnPdfPages(
  pdf: PDFDocumentProxy,
  onProgress?: (stage: string, pct: number) => void
): Promise<string> {
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") {
        onProgress?.("running_ocr", 0.7 + m.progress * 0.25);
      }
    },
  });
  let full = "";
  try {
    const totalPages = Math.min(pdf.numPages, 8);
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx, viewport } as any).promise;
      const { data } = await worker.recognize(canvas);
      full += data.text + "\n\n";
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Doclyze] OCR partially failed on PDF page: ${msg}`);
  } finally {
    await worker.terminate();
  }
  return full;
}

async function parseImage(
  bytes: Uint8Array,
  onProgress?: (stage: string, pct: number) => void
): Promise<ParseOutput> {
  onProgress?.("running_ocr", 0.1);
  const blob = new Blob([bytes.slice()], { type: "image/*" });
  const url = URL.createObjectURL(blob);
  try {
    const worker = await createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") {
          onProgress?.("running_ocr", 0.1 + m.progress * 0.85);
        }
      },
    });
    try {
      const { data } = await worker.recognize(url);
      return {
        text: normalizeText(data.text || ""),
        pages: [data.text || ""],
        ocrUsed: true,
      };
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`OCR failed: ${msg}. The image may be corrupted or in an unsupported format (PNG, JPG, WEBP expected).`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function parseDocx(bytes: Uint8Array): Promise<ParseOutput> {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  try {
    const text = await (mammoth as any).extractRawText({ arrayBuffer });
    if (!text.value || text.value.trim().length === 0) {
      return { text: "", pages: [], ocrUsed: false };
    }
    return {
      text: normalizeText(text.value),
      pages: [],
      ocrUsed: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`DOCX parsing failed: ${msg}. The file may be corrupted or password-protected.`);
  }
}

async function parseXlsx(bytes: Uint8Array): Promise<ParseOutput> {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const allText: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(ws);
      allText.push(`--- Sheet: ${sheetName} ---\n${csv}`);
    }
    const text = allText.join("\n\n");
    return {
      text: normalizeText(text),
      pages: [],
      ocrUsed: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`XLSX parsing failed: ${msg}. The file may be corrupted.`);
  }
}

async function parseCsv(
  text: string,
  delimiter: "," | "\t"
): Promise<ParseOutput> {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
  });
  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data.map((r) => {
    const out: Record<string, string | number | null> = {};
    for (const h of headers) {
      const v = r[h];
      out[h] = v === undefined || v === "" ? null : v;
    }
    return out;
  });
  return {
    text: normalizeText(text),
    pages: [],
    ocrUsed: false,
    tabular: { headers, rows },
  };
}

export async function parseFile(
  file: File,
  mimeType: string,
  onProgress?: (stage: string, pct: number) => void
): Promise<ParseOutput> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const realType = sniffMimeType(bytes, mimeType);

  // XLSX and DOCX share the same magic bytes (PK/zip header).
  // Filename extension is the only reliable disambiguator.
  const isZip = realType === "application/zip";
  const isXlsx = isZip && /\.xlsx$/i.test(file.name);
  const isDocx = isZip && /\.docx$/i.test(file.name);
  const isImage = realType.startsWith("image/");
  const isPdf = realType === "application/pdf";
  const isCsv = /\.csv$/i.test(file.name) || realType === "text/csv";
  const isTsv = /\.tsv$/i.test(file.name);
  const isText =
    realType === "text/plain" ||
    realType === "text/markdown" ||
    /\.(txt|md|markdown)$/i.test(file.name);

  if (isPdf) return parsePdf(bytes, onProgress);
  if (isImage) return parseImage(bytes, onProgress);
  if (isXlsx) return parseXlsx(bytes);
  if (isDocx) return parseDocx(bytes);
  if (isCsv) {
    const text = new TextDecoder().decode(bytes);
    return parseCsv(text, ",");
  }
  if (isTsv) {
    const text = new TextDecoder().decode(bytes);
    return parseCsv(text, "\t");
  }
  if (isText) {
    const text = new TextDecoder().decode(bytes);
    return { text: normalizeText(text), pages: [], ocrUsed: false };
  }

  throw new Error(
    `Unsupported file type: ${realType || mimeType}. Doclyze supports PDF, DOCX, TXT, MD, CSV/TSV, XLSX, and images (PNG/JPG/WEBP).`
  );
}
