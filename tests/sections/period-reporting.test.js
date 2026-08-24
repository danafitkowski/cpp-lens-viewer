// @vitest-environment happy-dom
//
// FIXTURE CONDITION — A and B are two SEPARATE exports of the same schedule.
// This suite used to parse minimal-3-task.xer twice, giving both sides the same
// task_id values. Period Reporting matched on the surrogate and every bucket
// filled correctly here while, on a real pair, no activity matched its prior at
// all. B now runs through the shared re-export builder, so every assertion
// below is a statement about matching on the Activity ID.
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/period-reporting.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

const XER = () => readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
const parseA = () => parseXer(XER());
const parseB = () => reexport(parseXer(XER()));

/** Address a TASK row by its stable Activity ID — B's row order is reversed. */
const byCode = (model, code) => model.tables.TASK.records.find(t => t.task_code === code);

describe('Period Reporting', () => {
  it('fixture sanity: A and B share every Activity ID and no task_id', () => {
    const overlap = assertDivergentSurrogates(parseA(), parseB(), { minSharedCodes: 2 });
    expect(overlap.sharedTaskIds).toBe(0);
    expect(overlap.sharedCodes).toBe(2);
  });

  it('shows empty-state when only A is loaded', () => {
    const el = render({ A: parseA(), B: null });
    expect(el.textContent).toMatch(/two XERs|load|baseline/i);
  });

  it('renders KPI cards when both loaded', () => {
    const el = render({ A: parseA(), B: parseB() });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(4);
  });

  it('detects slipped activity when A end_date is later than B', () => {
    const A = parseA();
    const B = parseB();
    // Push A's A1 five days later than B's A1 — addressed by Activity ID, since
    // the re-export reversed B's row order.
    byCode(A, 'A1').target_end_date = '2026-02-05 17:00';
    byCode(B, 'A1').target_end_date = '2026-01-31 17:00';
    const el = render({ A, B });
    expect(el.textContent).toMatch(/slipped/i);
    // and the slipped row is the one that actually moved
    const rows = [...el.querySelectorAll('.lens-table-wrap tbody tr')]
      .map(tr => tr.firstElementChild?.textContent);
    expect(rows).toContain('A1');
  });

  it('places an activity with unchanged status and unchanged target_end_date but changed phys_complete_pct into a visible bucket table', () => {
    const A = parseA();
    const B = parseB();
    // Same status_code (TK_Active in both) and same target_end_date (untouched) on
    // both sides, but phys_complete_pct differs. This activity still contributes to
    // the earned-value KPI (earnedWeightedSum/earnedWeightTotal) via target_drtn_hr_cnt,
    // so it must land in exactly one bucket table, not zero.
    Object.assign(byCode(A, 'A1'), { status_code: 'TK_Active', phys_complete_pct: '50' });
    Object.assign(byCode(B, 'A1'), { status_code: 'TK_Active', phys_complete_pct: '10' });
    const el = render({ A, B });
    const a1Row = [...el.querySelectorAll('.lens-table-wrap tbody tr')]
      .find(tr => tr.firstElementChild?.textContent === 'A1');
    expect(a1Row).toBeTruthy();
  });

  it('an unchanged schedule re-exported buckets every activity as unchanged', () => {
    // The everyday case: same activities, new surrogates, nothing moved. Both
    // activities must be matched to a prior and land in the unchanged bucket.
    // Matched on task_id, neither would be found and every bucket would read 0.
    const el = render({ A: parseA(), B: parseB() });
    expect(el.textContent).toContain('Unchanged: 2');
    expect(el.textContent).toContain('Slipped: 0');
    expect(el.textContent).toContain('Accelerated: 0');
  });
});
