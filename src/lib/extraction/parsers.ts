/**
 * Parsers -- turn raw file bytes into normalized text (and page list for PDFs).
 * All run on the client (no server roundtrip needed for v1).
 * Heavy work (OCR) is offloaded to a Web Worker via tesseract.js.
 *
 * v6: PDF parsing now retains positional/font-size data via layout analysis.
 * The `layoutData` field in ParseOutput provides column detection, heading
 * detection, and table reconstruction for downstream extractors.
 */

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import mammoth from "mammoth/mammoth.browser.js";
import Papa from "papaparse";
import { createWorker } from "tesseract.js";

import { normalizeText } from "./normalize";
import {
  type LayoutTextItem,
  type LayoutResult,
  analyzeLayout,
  buildReadingOrderText,
} from "./layout";
import {
  analyzeOCRConfidence,
  extractOCRLinesFromResult,
  type OCRConfidenceResult,
} from "./ocr-confidence";

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
  /** v6: Layout analysis data for PDF documents. Contains positional info,
   *  detected columns, headings, and reconstructed tables. */
  layoutData?: LayoutResult;
  /** v8: OCR confidence analysis — separates high-confidence text from noise.
   *  Only present when OCR was used. */
  ocrConfidence?: OCRConfidenceResult;
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

/**
 * Derive font size from a pdfjs text item's transform matrix.
 * transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
 * Font size = scaleY (absolute value). Falls back to 12 if unparseable.
 */
function deriveFontSize(transform: number[]): number {
  // transform[3] is scaleY — the font size for normal horizontal text
  const fs = Math.abs(transform[3]);
  return fs > 0 ? Math.round(fs * 10) / 10 : 12;
}

/**
 * v8: Extract text from large embedded raster images in a PDF.
 *
 * For PDFs that have a text layer but also contain embedded images
 * (e.g. scanned signatures, photographed stamps, screenshotted diagrams),
 * this function identifies pages with image XObjects and renders the full
 * page at high resolution to run OCR, then diffs against the existing text
 * layer to find text that only exists in the image.
 *
 * SCOPE (honest per Section 2):
 * - Handled: Pages where the text layer is sparse but an embedded image
 *   likely contains additional text (scanned signature blocks, stamps)
 * - NOT handled: Vector graphics with embedded text, many small images,
 *   images inside Form XObjects, images in patterns, selective cropping
 *   of individual images from a rendered page
 * - Extension point: For full coverage, use pdfjs page.getOperatorList()
 *   to walk all XObject references including nested Form XObjects and
 *   extract individual image bitmaps via obj.getData()
 */
async function extractEmbeddedImageText(
  pdf: PDFDocumentProxy,
): Promise<{ text: string; confidence: OCRConfidenceResult } | null> {
  const MAX_PAGES_TO_CHECK = 6;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates: Array<{ pageNum: number; imgOpCount: number }> = [];

  for (let i = 1; i <= Math.min(pdf.numPages, MAX_PAGES_TO_CHECK); i++) {
    try {
      const page = await pdf.getPage(i);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ops: any = await page.getOperatorList();
      // Count image XObject paint operations on this page
      const imgOpCount = ops.fnArray.filter(
        (fn: number) => fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintImageXObjectRepeat
      ).length;
      if (imgOpCount > 0) {
        candidates.push({ pageNum: i, imgOpCount });
      }
    } catch {
      // Best-effort per page
    }
  }

  if (candidates.length === 0) return null;

  // Sort by image op count (more images = more likely to contain text)
  candidates.sort((a, b) => b.imgOpCount - a.imgOpCount);
  const toProcess = candidates.slice(0, 2);

  // Render and OCR the candidate pages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allLines: Array<{ text: string; confidence: number }> = [];
  let fullText = '';

  try {
    const worker = await createWorker('eng', 1);
    try {
      for (const candidate of toProcess) {
        try {
          const page = await pdf.getPage(candidate.pageNum);
          // Render at 2x for better OCR quality
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await page.render({ canvasContext: ctx, viewport } as any).promise;

          const { data } = await worker.recognize(canvas);
          if (data.text && data.text.trim().length > 3) {
            fullText += data.text + '\n\n';
            const pageLines = extractOCRLinesFromResult(data);
            allLines.push(...pageLines);
          }
          // Clean up canvas to free memory
          canvas.width = 0;
          canvas.height = 0;
        } catch {
          // Best-effort per page
        }
      }
    } finally {
      await worker.terminate();
    }
  } catch {
    // Tesseract init failed — embedded OCR is best-effort
    return null;
  }

  if (fullText.trim().length === 0) return null;

  const confidence = analyzeOCRConfidence(allLines);
  return { text: fullText, confidence };
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

  // v6: Collect layout-aware text items per page
  const allPageItems: Array<{
    pageNum: number;
    items: LayoutTextItem[];
    pageWidth: number;
  }> = [];

  // Legacy flat text per page (kept for raw text tab compatibility)
  const pages: string[] = [];
  let totalText = "";
  let needsOcr = true;

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.("extracting_text", 0.1 + 0.6 * (i / pdf.numPages));
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    // v6: Build LayoutTextItem[] with full positional data
    const pageItems: LayoutTextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const fontSize = deriveFontSize(item.transform);
      pageItems.push({
        str: item.str,
        page: i,
        x: Math.round(item.transform[4] * 10) / 10,
        y: Math.round(item.transform[5] * 10) / 10,
        width: Math.round((item.width || 0) * 10) / 10,
        height: Math.round((item.height || fontSize) * 10) / 10,
        fontSize,
        transform: [...item.transform],
      });
    }
    allPageItems.push({
      pageNum: i,
      items: pageItems,
      pageWidth: viewport.width,
    });

    // Also build legacy flat text (for raw text tab)
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

  // v6: Run layout analysis on collected items
  let layoutData: LayoutResult | undefined;
  if (allPageItems.some(p => p.items.length > 0)) {
    layoutData = analyzeLayout(allPageItems);
  }

  // v6: Use layout-aware text if available; fall back to flat text
  const layoutText = layoutData ? buildReadingOrderText(layoutData) : "";
  let primaryText = layoutText.trim().length > 0 ? layoutText : totalText;

  // v8: Embedded image OCR — for PDFs that have a text layer AND contain
  // embedded raster images (e.g. a scanned signature, a photographed stamp
  // pasted into an otherwise-digital document).
  // We only OCR images that are large enough to likely contain meaningful text
  // (not small decorative icons or bullet-point graphics).
  let embeddedOcrConfidence: OCRConfidenceResult | undefined;
  if (!needsOcr) {
    try {
      const embeddedResult = await extractEmbeddedImageText(pdf);
      if (embeddedResult) {
        embeddedOcrConfidence = embeddedResult.confidence;
        if (embeddedResult.confidence.highConfidenceText.trim()) {
          primaryText += "\n\n" + embeddedResult.confidence.highConfidenceText;
        }
      }
    } catch (err) {
      // Embedded image OCR is best-effort — don't fail the whole parse
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Doclyze] Embedded image OCR skipped: ${msg}`);
    }
  }

  // Merge OCR confidence data (embedded image OCR)
  const ocrConfidence = embeddedOcrConfidence;

  // OCR fallback for scanned PDFs
  if (needsOcr && pdf.numPages > 0) {
    onProgress?.("running_ocr", 0.7);
    const ocrResult = await runOcrOnPdfPagesWithConfidence(pdf, onProgress);
    if (ocrResult.text.trim().length > 0) {
      return {
        text: normalizeText(ocrResult.confidence.highConfidenceText),
        pages: [ocrResult.confidence.highConfidenceText],
        ocrUsed: true,
        ocrConfidence: ocrResult.confidence,
      };
    }
  }

  onProgress?.("extracting_text", 0.95);
  return {
    text: normalizeText(primaryText),
    pages,
    ocrUsed: false,
    layoutData,
    ocrConfidence,
  };
}

async function runOcrOnPdfPagesWithConfidence(
  pdf: PDFDocumentProxy,
  onProgress?: (stage: string, pct: number) => void
): Promise<{ text: string; confidence: OCRConfidenceResult }> {
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") {
        onProgress?.("running_ocr", 0.7 + m.progress * 0.25);
      }
    },
  });
  let fullText = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allLines: Array<{ text: string; confidence: number }> = [];
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
      fullText += data.text + "\n\n";
      // v8: Retain per-line confidence data instead of discarding it
      const pageLines = extractOCRLinesFromResult(data);
      allLines.push(...pageLines);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Doclyze] OCR partially failed on PDF page: ${msg}`);
  } finally {
    await worker.terminate();
  }
  const confidence = analyzeOCRConfidence(allLines);
  return { text: fullText, confidence };
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
      // v8: Retain per-line confidence data instead of discarding it.
      // This is the same class of bug v6 fixed for PDF layout data.
      const ocrLines = extractOCRLinesFromResult(data);
      const ocrConfidence = analyzeOCRConfidence(ocrLines);
      return {
        text: normalizeText(ocrConfidence.highConfidenceText),
        pages: [ocrConfidence.highConfidenceText],
        ocrUsed: true,
        ocrConfidence,
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
    // v6: Use mammoth's convertToHtml to capture heading structure
    const mammothResult = await (mammoth as any).convertToHtml({ arrayBuffer });
    const html = mammothResult.value || "";

    // Extract heading structure from HTML
    const headingRegex = /<(h[1-6])[^>]*>(.*?)<\/\1>/gi;
    const docxHeadings: Array<{ text: string; level: number }> = [];
    let headingMatch;
    while ((headingMatch = headingRegex.exec(html)) !== null) {
      const level = parseInt(headingMatch[1][1]);
      const text = headingMatch[2].replace(/<[^>]*>/g, "").trim();
      if (text) docxHeadings.push({ text, level });
    }

    // Also get raw text
    const textResult = await (mammoth as any).extractRawText({ arrayBuffer });
    const rawText = textResult.value || "";

    if (!rawText.trim()) {
      return { text: "", pages: [], ocrUsed: false };
    }

    // Build a LayoutResult from DOCX headings for uniform downstream handling
    const layoutData: LayoutResult = {
      pages: [],
      allHeadings: docxHeadings.map((h, i) => ({
        text: h.text,
        level: h.level,
        page: 0,
        y: i, // Use index as pseudo-y for ordering
        fontSize: 0, // No font size data from mammoth
      })),
      allTables: [],
      bodyFontSize: 12, // Default assumption
    };

    return {
      text: normalizeText(rawText),
      pages: [],
      ocrUsed: false,
      layoutData,
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
