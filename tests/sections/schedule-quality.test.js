// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/schedule-quality.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Schedule Quality', () => {
  it('renders empty-state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders 8 KPI cards when XER is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const cards = el.querySelectorAll('.kpi');
    expect(cards.length).toBe(8);
  });

  it('lays the cards out in the styled multi-column grid, not a single-column list', () => {
    // Regression: the cards container used class "lens-kpi-grid", which has no CSS
    // rule anywhere in the stylesheet (display defaults to block), so all 8 cards
    // stacked full-width in a single column instead of a responsive grid. The
    // Executive Dashboard's "kpi-grid" class is the one that actually carries
    // display:grid — the fix is to use that same class here.
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const grid = el.querySelector('.kpi')?.closest('.kpi-grid, .lens-kpi-grid');
    expect(grid?.className.trim()).toBe('kpi-grid');
  });
});
