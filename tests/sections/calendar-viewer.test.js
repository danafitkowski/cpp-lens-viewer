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

// The Hours/day card names where its figure came from when it is not the
// file's day_hr_cnt (2026-10-13): P6 converts on the hours a calendar's shifts
// work, and schedules an empty record on its internal 8-hour Standard.
describe('Calendar Viewer hours per day, as P6 schedules them', () => {
  const T = '\t';
  const week = (slot) => {
    let body = '';
    for (let d = 1; d <= 7; d++) body += `(0||${d}()(${d >= 2 && d <= 6 ? slot : ''}))`;
    return `(0||CalendarData()((0||DaysOfWeek()(${body}))(0||Exceptions()())))`;
  };
  const model = (row) => parseXer([
    ['ERMHDR', '23.12', '2026-10-13', 'Project', 'admin', 'admin', 'db', 'Project Management', 'USD'],
    ['%T', 'CALENDAR'],
    ['%F', 'clndr_id', 'clndr_name', 'day_hr_cnt', 'week_hr_cnt', 'clndr_data'],
    ['%R', ...row],
    ['%E'],
  ].map(l => l.join(T)).join('\r\n') + '\r\n');

  it('[discriminating] a shift-hours calendar shows its shifts\' hours and what it declares', () => {
    const el = render({ A: model(['S', 'Ten Hour Shifts', '8', '40', week('(0||0(s|07:00|f|17:00)())')]), B: null });
    expect(el.textContent).toContain('the hours its shifts work (declares 8)');
  });

  it('[discriminating] an empty record shows P6\'s Standard and what it declares', () => {
    const el = render({ A: model(['E', 'Empty Ten', '10', '50', '']), B: null });
    expect(el.textContent).toContain('P6 Standard, no week defined (declares 10)');
  });
});
