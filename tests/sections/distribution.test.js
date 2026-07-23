// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/distribution.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Distribution', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders at least one chart when loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1);
  });

  it('has three card sections for the three histograms', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/duration/i);
    expect(el.textContent).toMatch(/float/i);
    expect(el.textContent).toMatch(/month/i);
  });

  it('scopes the month histogram title to the next 12 months, since the chart silently excludes activities finishing before the data date or beyond 12 months out', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const headings = Array.from(el.querySelectorAll('h3')).map(h3 => h3.textContent);
    const monthHeading = headings.find(t => /month/i.test(t));
    expect(monthHeading).toMatch(/next 12 months/i);
  });
});
