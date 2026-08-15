/**
 * Regression test: developer credit presence
 * Locks in that the developer credit (Abhishek Shah) appears in
 * the correct rendered components and README.
 *
 * This test exists because v3-v5 history shows files being silently
 * truncated or rewritten during aggressive multi-file sessions.
 * If credit is accidentally removed, this test will fail.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('Developer credit regression guard', () => {
  it('README.md contains developer credit', () => {
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
    expect(readme).toContain('Abhishek Shah');
    expect(readme).toContain('abhiverse01');
    expect(readme).toContain('abhishek.aimarine@gmail.com');
  });

  it('Landing page footer contains developer credit', () => {
    const landing = fs.readFileSync(path.join(ROOT, 'src/components/doclyze/landing.tsx'), 'utf-8');
    expect(landing).toContain('Abhishek Shah');
    expect(landing).toContain('github.com/abhiverse01');
  });

  it('Settings panel About section contains developer credit', () => {
    const settings = fs.readFileSync(path.join(ROOT, 'src/components/doclyze/settings-panel.tsx'), 'utf-8');
    expect(settings).toContain('Abhishek Shah');
    expect(settings).toContain('github.com/abhiverse01');
    expect(settings).toContain('abhishek.aimarine@gmail.com');
  });
});
