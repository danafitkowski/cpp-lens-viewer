// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/wbs-rollup.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('WBS Roll-up', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders roll-up rows from fixture', () => {
    const A = parseXer(readFileSync(join(FIX, 'deep-wbs.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('lays the KPI cards out in the styled multi-column grid, not a single-column list', () => {
    // Same "lens-kpi-grid has no CSS rule" bug as Schedule Quality — see that test file.
    const A = parseXer(readFileSync(join(FIX, 'deep-wbs.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const grid = el.querySelector('.kpi')?.closest('.kpi-grid, .lens-kpi-grid');
    expect(grid?.className.trim()).toBe('kpi-grid');
  });
});
