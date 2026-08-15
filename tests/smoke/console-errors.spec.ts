/**
 * Smoke tests: load every route and fail if the browser console
 * reports any error or React warning.
 *
 * This is the direct fix for the class of bugs where "TypeScript compiles
 * clean" and "all tests pass" but a runtime ReferenceError or duplicate
 * React key warning still ships to users.
 *
 * Routes tested:
 *   /               — Landing page (previous ReferenceError crash site)
 *   /dashboard      — Document dashboard
 *   /analyzer       — Upload / empty-state analyzer
 *
 * NOTE: /analyzer/[docId] requires a processed document in the store,
 * which is client-side Zustand state. We test the empty-state path here.
 * Full document-view testing would require seeding localStorage.
 */

import { test, expect } from '@playwright/test';

/**
 * Helper: collect all console messages during page load, then assert
 * none are errors or React warnings.
 */
async function expectNoConsoleErrors(page: import('@playwright/test').Page, route: string) {
  const errors: string[] = [];
  const warnings: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    // React errors
    if (msg.type() === 'error') {
      errors.push(text);
    }
    // React warnings (e.g. "Each child in a list should have a unique key")
    if (msg.type() === 'warning' && (
      text.includes('React does not recognize') ||
      text.includes('Each child in a list') ||
      text.includes('unique "key" prop') ||
      text.includes('Received NaN') ||
      text.includes('Cannot read') ||
      text.includes('is not defined') ||
      text.includes('Failed to')
    )) {
      warnings.push(text);
    }
  });

  // Also catch uncaught page errors
  page.on('pageerror', (err) => {
    errors.push(`PageError: ${err.message}`);
  });

  // Use 'commit' rather than 'load' — some routes (e.g. /analyzer) import
  // heavy client-side libs (tesseract.js, pdfjs-dist) that make 'load'
  // unreliable in CI/sandboxed environments where Turbopack compiles on first hit.
  await page.goto(route, { waitUntil: 'commit', timeout: 60_000 });

  // Wait for React hydration and any deferred rendering
  await page.waitForTimeout(4000);

  if (errors.length > 0) {
    throw new Error(
      `Console errors on ${route}:\n${errors.map(e => `  ❌ ${e}`).join('\n')}`
    );
  }
  if (warnings.length > 0) {
    throw new Error(
      `React warnings on ${route}:\n${warnings.map(w => `  ⚠️  ${w}`).join('\n')}`
    );
  }
}

test.describe('Smoke: no console errors on any route', () => {
  test('Landing page / loads without errors', async ({ page }) => {
    await expectNoConsoleErrors(page, '/');
    // Verify the page actually rendered content
    await expect(page.locator('h1')).toBeVisible();
  });

  test('Dashboard /dashboard loads without errors', async ({ page }) => {
    await expectNoConsoleErrors(page, '/dashboard');
  });

  test('Analyzer /analyzer loads without errors', async ({ page }) => {
    await expectNoConsoleErrors(page, '/analyzer');
  });
});
