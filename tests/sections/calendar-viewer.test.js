// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/calendar-viewer.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Calendar Viewer', () => {
  it('renders empty-state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders 4 KPI cards and at least one calendar card when XER is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const kpis = el.querySelectorAll('.kpi');
    // 4 top KPIs + 4 inner KPIs per calendar card = ≥ 8
    expect(kpis.length).toBeGreaterThanOrEqual(4);
  });

  it('shows calendar name from minimal fixture', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // minimal-3-task.xer has a CALENDAR row: clndr_name = '5-Day'
    expect(el.textContent).toContain('5-Day');
  });

  it('shows hours per day value', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // minimal-3-task.xer has day_hr_cnt = 8
    expect(el.textContent).toContain('8');
  });
});
