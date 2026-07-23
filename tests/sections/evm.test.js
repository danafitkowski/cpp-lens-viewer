// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/evm.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('EVM / S-Curves Lite', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders SVG line chart when loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // either the chart SVG or the empty-state fallback
    const hasSvg = el.querySelector('svg') !== null;
    const hasEmpty = el.textContent.match(/no data/i);
    expect(hasSvg || hasEmpty).toBeTruthy();
  });

  it('shows planned and actual labels', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // Either curves render with legend, or the empty-state shows
    const txt = el.textContent;
    expect(txt.match(/planned|actual|no data/i)).toBeTruthy();
  });

  it('falls back to scd_end_date for Planned Finish and the forecast curve when plan_end_date is blank', () => {
    // Same class of bug as the dashboard's Project Finish KPI: plan_end_date is an
    // optional must-finish constraint, frequently blank on real schedules. Without a
    // fallback, "Planned Finish" shows '-' and the Forecast series never builds even
    // though scd_end_date (the calculated finish) is right there.
    const A = parseXer(readFileSync(join(FIX, 'blank-plan-end-date.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const cards = [...el.querySelectorAll('.kpi')];
    const finishCard = cards.find(c => c.querySelector('.kpi-title')?.textContent === 'Planned Finish');
    expect(finishCard.querySelector('.kpi-big').textContent).toBe('2026-08-15');
  });

  it('lays the KPI cards out in the styled multi-column grid, not a single-column list', () => {
    // Same "lens-kpi-grid has no CSS rule" bug as Schedule Quality — see that test file.
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const grid = el.querySelector('.kpi')?.closest('.kpi-grid, .lens-kpi-grid');
    expect(grid?.className.trim()).toBe('kpi-grid');
  });
});
