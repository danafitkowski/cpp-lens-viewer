// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/xer-comparison.js';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { assertDivergentSurrogates } from '../fixtures/reexport.js';

// ─────────────────────────────────────────────────────────────────────────────
// Two REAL-SHAPED exports of the same three activities. The surrogate task_id
// is renumbered between them (P6 does this on every export) while task_code —
// the Activity ID — is stable. Fixtures that keep task_id consistent let a
// task_id-keyed matcher pass while the shipped product matched nothing.
//
// A1000 moved start, moved finish and lost float: ONE activity, THREE fields.
// The KPI labelled "Activities changed" must read 1, not 3.
// ─────────────────────────────────────────────────────────────────────────────

const TASK_FIELDS = [
  'task_id', 'task_code', 'task_name', 'proj_id', 'task_type', 'status_code',
  'target_start_date', 'target_end_date', 'total_float_hr_cnt'
];

function xer(rows) {
  const lines = [
    ['ERMHDR', '24.12', '2026-03-02', 'Project', 'admin', 'Test User', 'dbxDB', 'Project Management', 'USD'],
    ['%T', 'PROJECT'],
    ['%F', 'proj_id', 'proj_short_name', 'last_recalc_date'],
    ['%R', '1', 'CMP-TEST', '2026-03-02 08:00'],
    ['%T', 'TASK'],
    ['%F', ...TASK_FIELDS],
    ...rows.map(r => ['%R', ...r]),
    ['%E']
  ];
  return lines.map(cols => cols.join('\t')).join('\n') + '\n';
}

const CURRENT = xer([
  ['9001', 'A1000', 'Excavate pier 3', '1', 'TT_Task', 'TK_NotStart', '2026-03-16 08:00', '2026-03-27 17:00', '0'],
  ['9002', 'A1010', 'Form pier 3',     '1', 'TT_Task', 'TK_NotStart', '2026-03-30 08:00', '2026-04-03 17:00', '40'],
  ['9003', 'A1020', 'Pour pier 3',     '1', 'TT_Task', 'TK_NotStart', '2026-04-06 08:00', '2026-04-08 17:00', '40']
]);

const BASELINE = xer([
  ['101', 'A1000', 'Excavate pier 3', '1', 'TT_Task', 'TK_NotStart', '2026-03-11 08:00', '2026-03-20 17:00', '24'],
  ['102', 'A1010', 'Form pier 3',     '1', 'TT_Task', 'TK_NotStart', '2026-03-30 08:00', '2026-04-03 17:00', '40'],
  ['103', 'A1020', 'Pour pier 3',     '1', 'TT_Task', 'TK_NotStart', '2026-04-06 08:00', '2026-04-08 17:00', '40']
]);

function kpiByTitle(el, title) {
  return Array.from(el.querySelectorAll('.kpi'))
    .find(card => card.querySelector('.kpi-title')?.textContent === title);
}

describe('XER Comparison: changed-count labels say what they count', () => {
  it('fixture sanity: the two exports share task_code and no task_id', () => {
    const overlap = assertDivergentSurrogates(parseXer(CURRENT), parseXer(BASELINE), { minSharedCodes: 3 });
    expect(overlap).toEqual({ sharedCodes: 3, sharedTaskIds: 0 });
  });

  it('"Activities changed" shows 1 and "Field changes" shows 3', () => {
    const el = render({ A: parseXer(CURRENT), B: parseXer(BASELINE) });

    const activities = kpiByTitle(el, 'Activities changed');
    expect(activities).toBeTruthy();
    expect(activities.querySelector('.kpi-big').textContent).toBe('1');

    const fields = kpiByTitle(el, 'Field changes');
    expect(fields).toBeTruthy();
    expect(fields.querySelector('.kpi-big').textContent).toBe('3');
  });

  it('matches across renumbered surrogates: 0 added, 0 deleted', () => {
    const el = render({ A: parseXer(CURRENT), B: parseXer(BASELINE) });
    expect(kpiByTitle(el, 'Activities added').querySelector('.kpi-big').textContent).toBe('0');
    expect(kpiByTitle(el, 'Activities deleted').querySelector('.kpi-big').textContent).toBe('0');
  });

  it('the field-change rows identify the activity by Activity ID, not surrogate', () => {
    const el = render({ A: parseXer(CURRENT), B: parseXer(BASELINE) });
    const headers = Array.from(el.querySelectorAll('.lens-table thead th'))
      .map(th => th.textContent);
    expect(headers).toContain('Activity ID');
    expect(headers).not.toContain('ID');   // bare "ID" over a code column is the mislabel
    expect(el.textContent).toContain('A1000');
  });
});
