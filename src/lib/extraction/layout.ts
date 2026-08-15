/**
 * layout.ts — PDF layout analysis: column detection, table reconstruction,
 * heading detection from positional/font-size data.
 *
 * This module processes the raw TextItem[] from pdfjs-dist's getTextContent()
 * and produces a LayoutResult that downstream extractors can use for
 * structure-aware extraction instead of operating on flattened linear text.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single text item from PDF getTextContent(), enriched with derived fields. */
export interface LayoutTextItem {
  str: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  /** The original pdfjs text item transform matrix */
  transform: number[];
}

/** A detected heading with level inferred from font-size ranking. */
export interface DetectedHeading {
  text: string;
  level: number; // 1 = largest, higher = smaller
  page: number;
  y: number;
  fontSize: number;
}

/** A reconstructed table cell. */
export interface TableCell {
  text: string;
  col: number;
  row: number;
  x: number;
  y: number;
}

/** A reconstructed table. */
export interface LayoutTable {
  id: string;
  rows: string[][];
  columns: string[];
  /** Number of rows x columns, for quality reporting */
  rowCount: number;
  colCount: number;
  page: number;
  /** Y position of the first row */
  yStart: number;
}

/** A detected column region on a page. */
export interface ColumnRegion {
  xMin: number;
  xMax: number;
  /** 0-based column index */
  index: number;
  /** Items belonging to this column, already sorted top-to-bottom */
  items: LayoutTextItem[];
}

/** A page's layout analysis result. */
export interface PageLayout {
  page: number;
  columns: ColumnRegion[];
  headings: DetectedHeading[];
  tables: LayoutTable[];
  /** Body-font size estimate (median of non-heading items) */
  bodyFontSize: number;
  /** All items in reading order */
  readingOrder: LayoutTextItem[];
}

/** Full layout result for a document. */
export interface LayoutResult {
  pages: PageLayout[];
  /** All headings across pages, with absolute page refs */
  allHeadings: DetectedHeading[];
  /** All reconstructed tables across pages */
  allTables: LayoutTable[];
  /** Body font-size estimate (median across pages) */
  bodyFontSize: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Median of a number array. */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Group items by a key function. */
function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    let arr = map.get(k);
    if (!arr) {
      arr = [];
      map.set(k, arr);
    }
    arr.push(item);
  }
  return map;
}

/** Check if a text item is likely a heading based on font size. */
function isHeadingCandidate(item: LayoutTextItem, bodyFontSize: number, minBodyRatio: number = 1.25): boolean {
  return item.str.trim().length > 1 && item.fontSize >= bodyFontSize * minBodyRatio;
}

// ─── Column Detection ──────────────────────────────────────────────────────

/**
 * Detect column regions on a page by clustering text items by x-position.
 *
 * Algorithm:
 * 1. Compute x-position histogram (binned by quantile gaps)
 * 2. Find significant gaps (> 15% of page width or > 2x median item width)
 * 3. Cluster items into column regions separated by gaps
 * 4. Sort each column's items top-to-bottom
 */
export function detectColumns(
  items: LayoutTextItem[],
  pageWidth: number,
): ColumnRegion[] {
  if (items.length === 0) return [];

  // Get unique x positions (rounded to 1 decimal) with item counts
  const xPosCounts = new Map<number, number>();
  for (const item of items) {
    const x = Math.round(item.x * 10) / 10;
    xPosCounts.set(x, (xPosCounts.get(x) ?? 0) + 1);
  }

  const xPositions = Array.from(xPosCounts.entries())
    .filter(([, count]) => count >= 2) // Only consider x-positions with 2+ items
    .map(([x]) => x)
    .sort((a, b) => a - b);

  if (xPositions.length < 2) {
    // Single column — all items belong to one region
    return [{
      xMin: Math.min(...items.map(i => i.x)),
      xMax: Math.max(...items.map(i => i.x + i.width)),
      index: 0,
      items: [...items].sort((a, b) => b.y - a.y), // top-to-bottom (PDF y is inverted)
    }];
  }

  // Find gaps between consecutive x-positions
  const gaps: Array<{ x: number; gap: number }> = [];
  for (let i = 1; i < xPositions.length; i++) {
    gaps.push({
      x: xPositions[i - 1],
      gap: xPositions[i] - xPositions[i - 1],
    });
  }

  // Compute median item width for relative gap threshold
  const itemWidths = items.filter(i => i.width > 0).map(i => i.width);
  const medianWidth = itemWidths.length > 0 ? median(itemWidths) : 20;
  const absoluteGapThreshold = Math.max(pageWidth * 0.12, medianWidth * 1.5);

  // Find significant gaps
  const significantGaps = gaps.filter(g => g.gap >= absoluteGapThreshold);

  if (significantGaps.length === 0) {
    // No significant gaps — single column
    return [{
      xMin: Math.min(...items.map(i => i.x)),
      xMax: Math.max(...items.map(i => i.x + i.width)),
      index: 0,
      items: [...items].sort((a, b) => b.y - a.y),
    }];
  }

  // Build column boundaries from significant gaps
  const boundaries: number[] = [0];
  for (const gap of significantGaps) {
    boundaries.push(gap.x + gap.gap / 2); // Split at midpoint of gap
  }
  boundaries.push(pageWidth);

  // Assign items to columns
  const columns: ColumnRegion[] = [];
  for (let c = 0; c < boundaries.length - 1; c++) {
    const xMin = boundaries[c];
    const xMax = boundaries[c + 1];
    const colItems = items
      .filter(i => i.x >= xMin - 2 && i.x < xMax + 2) // 2pt tolerance
      .sort((a, b) => b.y - a.y);
    if (colItems.length > 0) {
      columns.push({
        xMin: Math.min(...colItems.map(i => i.x)),
        xMax: Math.max(...colItems.map(i => i.x + i.width)),
        index: c,
        items: colItems,
      });
    }
  }

  return columns.length > 0 ? columns : [{
    xMin: Math.min(...items.map(i => i.x)),
    xMax: Math.max(...items.map(i => i.x + i.width)),
    index: 0,
    items: [...items].sort((a, b) => b.y - a.y),
  }];
}

// ─── Heading Detection ─────────────────────────────────────────────────────

/**
 * Detect headings based on font-size analysis.
 *
 * Algorithm:
 * 1. Compute median font size (body text baseline)
 * 2. Find all items with font-size significantly larger than body
 * 3. Rank heading levels by font-size quantiles
 * 4. Exclude items that look like running text (very long, no uppercase)
 */
export function detectHeadings(
  items: LayoutTextItem[],
  bodyFontSize: number,
): DetectedHeading[] {
  if (items.length === 0 || bodyFontSize === 0) return [];

  const MIN_BODY_RATIO = 1.2; // At least 20% larger than body to be a heading
  const MAX_HEADING_LENGTH = 120; // Headings shouldn't be extremely long

  // Collect heading candidates
  const candidates = items
    .filter(item => {
      const text = item.str.trim();
      if (text.length < 2) return false;
      if (text.length > MAX_HEADING_LENGTH) return false;
      if (!isHeadingCandidate(item, bodyFontSize, MIN_BODY_RATIO)) return false;
      // Exclude pure numeric items
      if (/^\d+(\.\d+)*$/.test(text)) return false;
      return true;
    });

  if (candidates.length === 0) return [];

  // Get unique font sizes (larger than body), sorted descending
  const headingFontSizes = [...new Set(candidates.map(c => c.fontSize))]
    .filter(fs => fs >= bodyFontSize * MIN_BODY_RATIO)
    .sort((a, b) => b - a);

  if (headingFontSizes.length === 0) return [];

  // Assign levels: biggest = level 1, etc.
  // If there are many distinct sizes, cluster them into max 4 levels
  const maxLevels = Math.min(headingFontSizes.length, 4);
  const sizeToLevel = new Map<number, number>();

  if (headingFontSizes.length <= maxLevels) {
    headingFontSizes.forEach((fs, i) => sizeToLevel.set(fs, i + 1));
  } else {
    // Cluster: divide the range into maxLevels buckets
    const minFs = headingFontSizes[headingFontSizes.length - 1];
    const maxFs = headingFontSizes[0];
    const range = maxFs - minFs;
    const bucketSize = range / maxLevels;
    for (const fs of headingFontSizes) {
      const level = Math.min(maxLevels, Math.max(1, Math.ceil((maxFs - fs) / bucketSize) + 1));
      sizeToLevel.set(fs, level);
    }
  }

  // Build heading list, deduplicating items on the same y-line
  const yLineHeadings = new Map<string, DetectedHeading>();
  for (const item of candidates) {
    const key = `${item.page}:${Math.round(item.y)}`;
    const existing = yLineHeadings.get(key);
    // Prefer the item with the larger font size on the same line
    if (!existing || item.fontSize > existing.fontSize) {
      const level = sizeToLevel.get(item.fontSize) ?? maxLevels;
      yLineHeadings.set(key, {
        text: item.str.trim(),
        level,
        page: item.page,
        y: item.y,
        fontSize: item.fontSize,
      });
    }
  }

  // Sort by page then y position (top-to-bottom within page)
  return Array.from(yLineHeadings.values())
    .sort((a, b) => a.page === b.page ? b.y - a.y : a.page - b.page);
}

// ─── Table Detection ───────────────────────────────────────────────────────

/**
 * Detect tables from positional grid alignment.
 *
 * Algorithm:
 * 1. Group items by y-position (rows) — items within 3pt vertical tolerance
 * 2. For each row, collect unique x-positions (potential columns)
 * 3. Find rows that share 3+ common column x-positions → table region
 * 4. Reconstruct the table grid from aligned rows
 */
export function detectTables(
  items: LayoutTextItem[],
  bodyFontSize: number,
): LayoutTable[] {
  if (items.length < 4) return []; // Need at least a 2x2 table

  const ROW_TOLERANCE = Math.max(3, bodyFontSize * 0.3); // Vertical tolerance for same row
  const MIN_ROWS = 2;
  const MIN_COLS = 2;
  const MIN_ALIGNED_COLS = 2; // At least 2 columns must align across rows

  // Step 1: Group items into rows by y-position
  const rowGroups = new Map<number, LayoutTextItem[]>();
  for (const item of items) {
    const y = Math.round(item.y);
    // Find existing row within tolerance
    let matched = false;
    for (const [rowY, rowItems] of rowGroups) {
      if (Math.abs(rowY - y) <= ROW_TOLERANCE) {
        rowItems.push(item);
        matched = true;
        break;
      }
    }
    if (!matched) {
      rowGroups.set(y, [item]);
    }
  }

  // Step 2: For each row, get the set of x-positions (rounded to 5pt bins)
  const X_BIN = 5;
  const rowXPositions: Array<{
    y: number;
    items: LayoutTextItem[];
    xBins: Set<number>;
  }> = [];

  for (const [y, rowItems] of rowGroups) {
    if (rowItems.length < MIN_COLS) continue;
    const xBins = new Set<number>();
    for (const item of rowItems) {
      xBins.add(Math.round(item.x / X_BIN) * X_BIN);
    }
    if (xBins.size >= MIN_COLS) {
      rowXPositions.push({ y, items: rowItems, xBins });
    }
  }

  if (rowXPositions.length < MIN_ROWS) return [];

  // Step 3: Find groups of rows that share aligned columns
  // Use a simple approach: check consecutive rows for column overlap
  const tableRegions: Array<{
    rows: typeof rowXPositions;
    sharedXs: Set<number>;
  }> = [];

  let currentRegion: typeof rowXPositions = [];
  let currentSharedXs: Set<number> | null = null;

  for (let i = 0; i < rowXPositions.length; i++) {
    const row = rowXPositions[i];

    if (currentRegion.length === 0) {
      currentRegion = [row];
      currentSharedXs = new Set(row.xBins);
      continue;
    }

    // Check overlap with current region's shared x-positions
    const overlap = new Set<number>();
    for (const x of row.xBins) {
      if (currentSharedXs!.has(x)) overlap.add(x);
    }

    if (overlap.size >= MIN_ALIGNED_COLS) {
      // Extend current region
      currentRegion.push(row);
      // Update shared xs to intersection
      currentSharedXs = overlap;
    } else {
      // Save current region if it qualifies as a table
      if (currentRegion.length >= MIN_ROWS && currentSharedXs!.size >= MIN_COLS) {
        tableRegions.push({ rows: currentRegion, sharedXs: currentSharedXs! });
      }
      // Start new region
      currentRegion = [row];
      currentSharedXs = new Set(row.xBins);
    }
  }

  // Don't forget the last region
  if (currentRegion.length >= MIN_ROWS && currentSharedXs!.size >= MIN_COLS) {
    tableRegions.push({ rows: currentRegion, sharedXs: currentSharedXs! });
  }

  // Step 4: Reconstruct table grids
  const tables: LayoutTable[] = [];

  for (let t = 0; t < tableRegions.length; t++) {
    const region = tableRegions[t];
    const colXs = Array.from(region.sharedXs).sort((a, b) => a - b);

    // Assign items to cells: for each row, place item text into the nearest column
    const grid: string[][] = [];
    const colNames: string[] = colXs.map((_, i) => `Column ${i + 1}`);

    for (const rowData of region.rows) {
      const rowCells = new Array(colXs.length).fill("");
      // Sort row items by x position
      const sortedItems = [...rowData.items].sort((a, b) => a.x - b.x);

      for (const item of sortedItems) {
        const itemBin = Math.round(item.x / X_BIN) * X_BIN;
        // Find nearest column
        let bestCol = 0;
        let bestDist = Infinity;
        for (let c = 0; c < colXs.length; c++) {
          const dist = Math.abs(itemBin - colXs[c]);
          if (dist < bestDist) {
            bestDist = dist;
            bestCol = c;
          }
        }
        // Only assign if reasonably close (within 1.5x bin size)
        if (bestDist <= X_BIN * 1.5) {
          const text = item.str.trim();
          if (text) {
            rowCells[bestCol] = rowCells[bestCol] ? `${rowCells[bestCol]} ${text}` : text;
          }
        }
      }

      // Only add rows that have content in at least 2 cells
      if (rowCells.filter(c => c.length > 0).length >= 1) {
        grid.push(rowCells);
      }
    }

    if (grid.length >= MIN_ROWS) {
      // Try to use first row as column headers
      const firstRow = grid[0];
      const allShort = firstRow.every(c => c.length <= 40);
      if (allShort && firstRow.filter(c => c.length > 0).length >= MIN_COLS) {
        // Use first row as headers
        for (let c = 0; c < colXs.length; c++) {
          if (firstRow[c]) colNames[c] = firstRow[c];
        }
        grid.shift(); // Remove header row from data
      }

      if (grid.length >= 1) {
        tables.push({
          id: `layout-table-${t}`,
          rows: grid,
          columns: colNames,
          rowCount: grid.length,
          colCount: colXs.length,
          page: region.rows[0]?.items[0]?.page ?? 0,
          yStart: region.rows[0]?.y ?? 0,
        });
      }
    }
  }

  return tables;
}

// ─── Main Analysis ─────────────────────────────────────────────────────────

/**
 * Analyze the layout of a single page.
 */
export function analyzePageLayout(
  items: LayoutTextItem[],
  pageWidth: number,
  pageNum: number,
): PageLayout {
  // Estimate body font size (median of all items)
  const allFontSizes = items.map(i => i.fontSize);
  const bodyFontSize = median(allFontSizes) || 12;

  // Detect columns
  const columns = detectColumns(items, pageWidth);

  // Detect headings
  const headings = detectHeadings(items, bodyFontSize);

  // Detect tables (exclude heading-sized items from table detection)
  const bodyItems = items.filter(i => !isHeadingCandidate(i, bodyFontSize, 1.2));
  const tables = detectTables(bodyItems, bodyFontSize);

  // Build reading order: for each column, items are already top-to-bottom;
  // columns are read left-to-right
  const readingOrder = columns
    .sort((a, b) => a.xMin - b.xMin)
    .flatMap(col => col.items);

  return {
    page: pageNum,
    columns,
    headings,
    tables,
    bodyFontSize,
    readingOrder,
  };
}

/**
 * Analyze layout for an entire document (multiple pages of text items).
 * v7: Heading levels are assigned GLOBALLY across all pages,
 * not per-page, so the same font-size always maps to the same level.
 */
export function analyzeLayout(
  pages: Array<{ pageNum: number; items: LayoutTextItem[]; pageWidth: number }>,
): LayoutResult {
  const pageLayouts: PageLayout[] = [];

  for (const page of pages) {
    pageLayouts.push(
      analyzePageLayout(page.items, page.pageWidth, page.pageNum)
    );
  }

  // Collect global body font size estimate
  const allBodySizes = pageLayouts.map(p => p.bodyFontSize).filter(s => s > 0);
  const bodyFontSize = allBodySizes.length > 0 ? median(allBodySizes) : 12;

  // v7: Reassign heading levels globally using all pages' heading font sizes.
  // Per-page level assignment causes the same font-size to get different
  // levels on different pages (e.g., 18pt = H2 on page 2 but H1 on page 3).
  const allHeadings = pageLayouts.flatMap(p => p.headings);
  const globalHeadings = reassignHeadingLevelsGlobally(allHeadings, bodyFontSize);

  // Update per-page headings with globally-assigned levels
  const globalLevelMap = new Map<string, number>();
  for (const h of globalHeadings) {
    globalLevelMap.set(`${h.page}:${Math.round(h.y)}`, h.level);
  }
  for (const pl of pageLayouts) {
    pl.headings = pl.headings.map(h => ({
      ...h,
      level: globalLevelMap.get(`${h.page}:${Math.round(h.y)}`) ?? h.level,
    }));
  }

  // Collect all tables — deduplicate IDs across pages (detectTables uses
  // local indices per page, so page 1 and page 2 can both produce
  // layout-table-0). Re-index globally to guarantee uniqueness.
  const allTables = pageLayouts.flatMap(p => p.tables).map((t, i) => ({
    ...t,
    id: `layout-table-${i}`,
  }));

  return {
    pages: pageLayouts,
    allHeadings: globalHeadings,
    allTables,
    bodyFontSize,
  };
}

/**
 * Reassign heading levels using the GLOBAL font-size distribution.
 * Ensures the same font-size always maps to the same heading level,
 * regardless of which page it appears on.
 */
function reassignHeadingLevelsGlobally(
  headings: DetectedHeading[],
  bodyFontSize: number,
): DetectedHeading[] {
  if (headings.length === 0) return [];

  const MIN_BODY_RATIO = 1.2;
  const maxLevels = 4;

  // Get unique font sizes across ALL headings, sorted descending.
  // v7: Do NOT filter by MIN_BODY_RATIO here — headings were already
  // validated during per-page detection (each page has its own bodyFontSize).
  // Re-filtering with the global median would drop legitimate headings
  // from pages where body text is smaller.
  const rawFontSizes = [...new Set(headings.map(h => h.fontSize))]
    .sort((a, b) => b - a);

  if (rawFontSizes.length === 0) return headings;

  // v7: Cluster font sizes that are within 20% of each other.
  // E.g., 24pt and 22pt differ by only 9% → same level.
  // This prevents spreading 5 distinct sizes across 4 levels
  // when the document really has 2-3 semantic levels.
  const CLUSTER_RATIO = 1.2; // Sizes within 20% get merged
  const allFontSizes: number[] = [];
  for (const fs of rawFontSizes) {
    const last = allFontSizes[allFontSizes.length - 1];
    if (last !== undefined && fs >= last / CLUSTER_RATIO) {
      // Close enough to the previous size — skip (same cluster)
      continue;
    }
    allFontSizes.push(fs);
  }

  // Assign levels: biggest font = H1, etc.
  const sizeToLevel = new Map<number, number>();
  const numSizes = Math.min(allFontSizes.length, maxLevels);

  if (allFontSizes.length <= maxLevels) {
    allFontSizes.forEach((fs, i) => sizeToLevel.set(fs, i + 1));
  } else {
    const minFs = allFontSizes[allFontSizes.length - 1];
    const maxFs = allFontSizes[0];
    const range = maxFs - minFs;
    const bucketSize = range / maxLevels;
    for (const fs of allFontSizes) {
      const level = Math.min(maxLevels, Math.max(1, Math.ceil((maxFs - fs) / bucketSize) + 1));
      sizeToLevel.set(fs, level);
    }
  }

  // Map non-clustered sizes to the level of their nearest cluster representative
  for (const fs of rawFontSizes) {
    if (sizeToLevel.has(fs)) continue;
    // Find the nearest clustered size
    let bestDist = Infinity;
    let bestLevel = numSizes;
    for (const [clusterFs, level] of sizeToLevel) {
      const dist = Math.abs(clusterFs - fs);
      if (dist < bestDist) {
        bestDist = dist;
        bestLevel = level;
      }
    }
    sizeToLevel.set(fs, bestLevel);
  }

  return headings.map(h => ({
    ...h,
    level: sizeToLevel.get(h.fontSize) ?? numSizes,
  }));
}

/**
 * Build reading-order text from layout columns.
 * Joins items within each column by space, then joins columns left-to-right
 * with a double newline between columns on the same y-range.
 */
export function buildReadingOrderText(layout: LayoutResult): string {
  const pageTexts: string[] = [];

  for (const pageLayout of layout.pages) {
    if (pageLayout.columns.length === 1) {
      // Single column: join all items top-to-bottom, grouped by y-line
      const lines = groupItemsByYLine(pageLayout.readingOrder);
      pageTexts.push(lines.join("\n"));
    } else {
      // Multi-column: reconstruct by merging columns in reading order
      const text = mergeColumnsToText(pageLayout.columns);
      pageTexts.push(text);
    }
  }

  return pageTexts.join("\n\n");
}

/**
 * Group items by y-position (within tolerance) into text lines.
 */
function groupItemsByYLine(items: LayoutTextItem[], tolerance: number = 3): string[] {
  if (items.length === 0) return [];

  const lines: Array<{ y: number; parts: string[] }> = [];

  for (const item of items) {
    const y = Math.round(item.y);
    let line = lines.find(l => Math.abs(l.y - y) < tolerance);
    if (!line) {
      line = { y, parts: [] };
      lines.push(line);
    }
    line.parts.push(item.str);
  }

  // Sort lines top-to-bottom (PDF y is inverted)
  lines.sort((a, b) => b.y - a.y);

  return lines
    .map(l => l.parts.join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Merge multi-column layout into reading-order text.
 * Within each column, items flow top-to-bottom.
 * Columns are processed left-to-right.
 * When columns have overlapping y-ranges, we interleave by y-position
 * (top portion of left col, then top portion of right col, etc.)
 * to approximate natural reading order for parallel columns.
 */
function mergeColumnsToText(columns: ColumnRegion[]): string {
  if (columns.length === 0) return "";
  if (columns.length === 1) {
    return groupItemsByYLine(columns[0].items).join("\n");
  }

  // Strategy: for multi-column, try line-by-line interleaving
  // Get y-lines across all columns
  const allYs = new Set<number>();
  for (const col of columns) {
    for (const item of col.items) {
      allYs.add(Math.round(item.y / 3) * 3); // 3pt bins
    }
  }

  const sortedYs = Array.from(allYs).sort((a, b) => b - a); // top-to-bottom
  const lines: string[] = [];

  for (const yBin of sortedYs) {
 const lineParts: string[] = [];
    for (const col of columns.sort((a, b) => a.xMin - b.xMin)) {
      // Find items in this column at this y-position
      const matchingItems = col.items.filter(
        i => Math.abs(Math.round(i.y / 3) * 3 - yBin) < 4
      );
      if (matchingItems.length > 0) {
        const text = matchingItems
          .sort((a, b) => a.x - b.x)
          .map(i => i.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text) lineParts.push(text);
      }
    }
    if (lineParts.length > 0) {
      lines.push(lineParts.join("  ")); // Columns separated by double-space
    }
  }

  return lines.join("\n");
}
