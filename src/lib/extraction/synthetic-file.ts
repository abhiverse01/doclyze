/**
 * Synthetic file construction helpers.
 *
 * v10: After a reclassify bug where a File was created from raw text
 * but kept the original MIME type (application/pdf), causing the parser
 * to fail on non-PDF content, this helper enforces the correct pattern:
 * when constructing a File from already-extracted text, ALWAYS use
 * text/plain — never the original file's MIME type.
 *
 * This is the single correct way to create a file from extracted text
 * that will be fed back through runExtractionPipeline().
 */

/**
 * Create a File object from already-extracted text, suitable for
 * feeding back through runExtractionPipeline().
 *
 * The returned File always has type "text/plain" — this is critical
 * because the parser's MIME detection would fail if given "application/pdf"
 * content that is actually plain text.
 *
 * @param rawText - The extracted text content
 * @param filename - A descriptive filename (extension will be .txt)
 * @returns A File object safe to pass to runExtractionPipeline()
 */
export function createTextFileFromExtracted(
  rawText: string,
  filename: string,
): File {
  const blob = new Blob([rawText], { type: 'text/plain' });
  // Normalize extension to .txt to match the MIME type
  const safeName = filename.replace(/\.[^.]+$/, '.txt');
  return new File([blob], safeName, { type: 'text/plain' });
}
