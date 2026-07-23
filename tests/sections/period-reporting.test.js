// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/period-reporting.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Period Reporting', () => {
  it('shows empty-state when only A is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/two XERs|load|baseline/i);
  });

  it('renders KPI cards when both loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(4);
  });

  it('detects slipped activity when A end_date is later than B', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    // Push A's first task end-date 5 days later than B's
    if (A.tables.TASK?.records?.[0]) {
      A.tables.TASK.records[0].target_end_date = '2026-02-05 17:00';
    }
    if (B.tables.TASK?.records?.[0]) {
      B.tables.TASK.records[0].target_end_date = '2026-01-31 17:00';
    }
    const el = render({ A, B });
    expect(el.textContent).toMatch(/slipped/i);
  });

  it('places an activity with unchanged status and unchanged target_end_date but changed phys_complete_pct into a visible bucket table', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    // Same status_code (TK_Active in both) and same target_end_date (untouched) on
    // both sides, but phys_complete_pct differs. This activity still contributes to
    // the earned-value KPI (earnedWeightedSum/earnedWeightTotal) via target_drtn_hr_cnt,
    // so it must land in exactly one bucket table, not zero.
    if (A.tables.TASK?.records?.[0]) {
      A.tables.TASK.records[0].status_code = 'TK_Active';
      A.tables.TASK.records[0].phys_complete_pct = '50';
    }
    if (B.tables.TASK?.records?.[0]) {
      B.tables.TASK.records[0].status_code = 'TK_Active';
      B.tables.TASK.records[0].phys_complete_pct = '10';
    }
    const el = render({ A, B });
    const a1Row = [...el.querySelectorAll('.lens-table-wrap tbody tr')]
      .find(tr => tr.firstElementChild?.textContent === 'A1');
    expect(a1Row).toBeTruthy();
  });
});
