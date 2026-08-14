/**
 * v6: Regression tests for the Section 0 failure case defects.
 * These tests simulate the specific failures observed with the
 * web-programming-day1.pdf lecture-slide document.
 */
import { describe, it, expect } from "vitest";
import { extractGeneral } from "@/lib/extraction/extractors/general";
import type { LayoutResult } from "@/lib/extraction/layout";

/**
 * Simulate the lecture-slide PDF's layout data:
 * - Multiple headings at different font sizes
 * - A two-column term/definition table
 * - URLs with trailing punctuation
 * - Many capitalized phrases that are headings, not entities
 */
function makeLectureSlideLayout(): LayoutResult {
  return {
    pages: [],
    bodyFontSize: 14,
    allHeadings: [
      { text: 'WEB PROGRAMMING', level: 1, page: 1, y: 750, fontSize: 28 },
      { text: 'Day 1', level: 1, page: 1, y: 700, fontSize: 22 },
      { text: 'The Big Picture', level: 2, page: 1, y: 650, fontSize: 18 },
      { text: 'Three Languages', level: 2, page: 1, y: 600, fontSize: 18 },
      { text: 'Two Sides', level: 2, page: 1, y: 550, fontSize: 18 },
      { text: 'Before We Begin', level: 2, page: 1, y: 500, fontSize: 18 },
      { text: 'Core Terminology', level: 2, page: 1, y: 450, fontSize: 18 },
      { text: 'The Three Core Languages', level: 3, page: 1, y: 400, fontSize: 15 },
      { text: 'Side: Terms', level: 3, page: 1, y: 350, fontSize: 15 },
      { text: 'Tools You Use Every Day', level: 2, page: 1, y: 300, fontSize: 18 },
    ],
    allTables: [
      {
        id: 'layout-table-0',
        columns: ['Term', 'Definition'],
        rows: [
          ['HTML', 'HyperText Markup Language — the standard language for creating web pages'],
          ['CSS', 'Cascading Style Sheets — controls the presentation and layout of web pages'],
          ['DOM', 'Document Object Model — a programming interface for web documents'],
          ['Attribute', 'A property that provides additional information about an HTML element'],
          ['Client', 'The user\'s browser or device that requests and displays web pages'],
          ['Browser', 'Software application used to access and view web pages on the internet'],
          ['Frontend', 'Everything the user sees and interacts with directly in the browser'],
          ['Rendering', 'The process of converting HTML/CSS/JavaScript into a visual display on screen'],
        ],
        rowCount: 8,
        colCount: 2,
        page: 1,
        yStart: 420,
      },
    ],
  };
}

/** Simulated text from a lecture-slide PDF (flattened). */
const LECTURE_TEXT = `
WEB PROGRAMMING
Day 1
The Big Picture
Three Languages
Two Sides
Before We Begin
Core Terminology
The Three Core Languages
Side: Terms
Tools You Use Every Day

Visit https://github.com/abhiverse01" for the course repository.

HTML HyperText Markup Language the standard language for creating web pages
CSS Cascading Style Sheets controls the presentation and layout
DOM Document Object Model a programming interface for web documents
Attribute A property that provides additional information about an HTML element
Client The user's browser or device that requests and displays web pages
Browser Software application used to access and view web pages
Frontend Everything the user sees and interacts with directly in the browser
Rendering The process of converting HTML/CSS/JavaScript into a visual display

Contact: instructor@university.edu for questions.
`.trim();

describe('v6 Section 0 Defect Regression Tests', () => {
  const layout = makeLectureSlideLayout();

  describe('Defect #1: URL trailing punctuation', () => {
    it('strips trailing double-quote from extracted URL', () => {
      const result = extractGeneral(LECTURE_TEXT, 'lecture.pdf', layout);
      const urls = result.details.entities.urls;
      // The URL in the text has a trailing double-quote
      expect(urls.length).toBeGreaterThanOrEqual(1);
      for (const url of urls) {
        expect(url.endsWith('"')).toBe(false);
        expect(url.endsWith("'")).toBe(false);
        expect(url.endsWith('.')).toBe(false);
      }
      // Specifically, the github URL should be clean
      expect(urls).toContain('https://github.com/abhiverse01');
    });
  });

  describe('Defect #2: Named entities exclude headings', () => {
    it('does NOT include heading texts as named entities', () => {
      const result = extractGeneral(LECTURE_TEXT, 'lecture.pdf', layout);
      const entities = result.details.entities.namedEntities;
      const headings = layout.allHeadings.map(h => h.text);

      // None of these headings should appear as named entities
      const headingLikeEntities = [
        'WEB PROGRAMMING', 'The Big Picture', 'Three Languages',
        'Two Sides', 'Core Terminology', 'The Three Core Languages',
      ];
      for (const entity of entities) {
        for (const headingLike of headingLikeEntities) {
          expect(entity).not.toBe(headingLike);
        }
      }
    });

    it('classifies entities with type labels (person/org/location)', () => {
      const result = extractGeneral(LECTURE_TEXT, 'lecture.pdf', layout);
      const entities = result.details.entities.namedEntities;
      // All entities should have type labels
      for (const entity of entities) {
        // Format: "Entity Name [type]"
        if (entity) {
          expect(entity).toMatch(/\[person\]|\[organization\]|\[location\]/);
        }
      }
    });
  });

  describe('Defect #3: Table content not truncated', () => {
    it('reconstructs tables with full cell content, not truncated fragments', () => {
      const result = extractGeneral(LECTURE_TEXT, 'lecture.pdf', layout);
      // Should have at least the outline table + layout-detected tables
      expect(result.tables.length).toBeGreaterThanOrEqual(2);

      // Find the layout-detected table
      const layoutTable = result.tables.find(t => t.id === 'layout-table-0');
      if (layoutTable) {
        // Check that definitions are NOT truncated to 1-2 words
        // The old bug produced: "Client The", "Browser Software", etc.
        const clientRow = layoutTable.rows.find(r =>
          (r['col_0'] as string)?.includes('Client')
        );
        if (clientRow) {
          const def = String(clientRow['col_1'] ?? '');
          // The definition should be much longer than 2 words
          expect(def.split(/\s+/).length).toBeGreaterThan(3);
        }
      }
    });
  });

  describe('Defect #4: Heading detection finds all headings', () => {
    it('detects multiple headings, not just one', () => {
      const result = extractGeneral(LECTURE_TEXT, 'lecture.pdf', layout);
      const outline = result.details.sectionOutline;
      // Old behavior: only 1 heading ("WEB PROGRAMMING" from ALL-CAPS)
      // New behavior: should detect 10 headings from layout data
      expect(outline.length).toBeGreaterThanOrEqual(5);
    });

    it('includes heading levels from font-size analysis', () => {
      const result = extractGeneral(LECTURE_TEXT, 'lecture.pdf', layout);
      const outline = result.details.sectionOutline;
      const levels = new Set(outline.map(h => h.level));
      // Should have multiple levels (1, 2, and 3)
      expect(levels.size).toBeGreaterThanOrEqual(2);
    });

    it('heading count is reflected in the quality summary', () => {
      const result = extractGeneral(LECTURE_TEXT, 'lecture.pdf', layout);
      const qualityGroup = result.fieldGroups.find(fg => fg.id === 'structure-quality');
      expect(qualityGroup).toBeDefined();
      const headingsField = qualityGroup!.fields.find(f => f.key === 'headingsDetected');
      expect(headingsField?.value).not.toBe('0');
    });
  });

  describe('Structure tree', () => {
    it('produces a structure tree for layout-aware documents', () => {
      const result = extractGeneral(LECTURE_TEXT, 'lecture.pdf', layout);
      expect(result.structureTree).toBeDefined();
      expect(result.structureTree!.length).toBeGreaterThan(0);
    });

    it('structure tree includes nested children', () => {
      const result = extractGeneral(LECTURE_TEXT, 'lecture.pdf', layout);
      const hasChildren = result.structureTree?.some(
        node => node.children.length > 0
      );
      expect(hasChildren).toBe(true);
    });
  });

  describe('Structural quality field group', () => {
    it('reports layout-detected tables in quality summary', () => {
      const result = extractGeneral(LECTURE_TEXT, 'lecture.pdf', layout);
      const qualityGroup = result.fieldGroups.find(fg => fg.id === 'structure-quality');
      expect(qualityGroup).toBeDefined();
      const tablesField = qualityGroup!.fields.find(f => f.key === 'tablesReconstructed');
      expect(tablesField?.value).toBe('1');
    });
  });
});

describe('v6 clean-span integration in general extractor', () => {
  it('URLs in various punctuation contexts are cleaned', () => {
    const text = `
      Visit https://example.com. For more info.
      Check (https://example.org) for details.
      See "https://example.net" for reference.
      Email: user@example.com, or admin@example.com;
    `;
    const result = extractGeneral(text, 'test.txt');
    const urls = result.details.entities.urls;
    const emails = result.details.entities.emails;

    for (const url of urls) {
      expect(url.endsWith('.')).toBe(false);
      expect(url.endsWith(')')).toBe(false);
      expect(url.endsWith('"')).toBe(false);
    }
    for (const email of emails) {
      expect(email.endsWith(',')).toBe(false);
      expect(email.endsWith(';')).toBe(false);
    }
  });
});
