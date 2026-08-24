// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/summary.js';
import { parseXer } from '@criticalpathpartners/lens-parser';

// ─────────────────────────────────────────────────────────────────────────────
// The Executive Summary narrates completeCount / activityCount. That is a
// COUNT of activities flagged TK_Complete — it ignores duration weighting and
// ignores phys_complete_pct entirely. It shipped narrated as
// "N% physical complete", which is a different quantity with a P6 field of its
// own. This fixture drives the two apart: one of four activities is complete
// while every phys_complete_pct is 0, so count-based reads 25% and anything
// genuinely weighted on phys_complete_pct would read 0%.
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS = ['task_id', 'task_code', 'task_name', 'proj_id', 'task_type',
                'status_code', 'phys_complete_pct', 'target_drtn_hr_cnt',
                'total_float_hr_cnt', 'target_end_date'];

const XER = [
  ['ERMHDR', '24.12', '2026-03-02', 'Project', 'admin', 'Test User', 'dbxDB', 'Project Management', 'USD'],
  ['%T', 'PROJECT'],
  ['%F', 'proj_id', 'proj_short_name', 'last_recalc_date', 'scd_end_date'],
  ['%R', '1', 'PCT-TEST', '2026-03-02 08:00', '2026-09-01 00:00'],
  ['%T', 'TASK'],
  ['%F', ...FIELDS],
  ['%R', '1', 'A1', 'Done by status only', '1', 'TT_Task', 'TK_Complete', '0', '40', '0', '2026-03-01 17:00'],
  ['%R', '2', 'A2', 'Not started two',     '1', 'TT_Task', 'TK_NotStart', '0', '40', '8', '2026-04-01 17:00'],
  ['%R', '3', 'A3', 'Not started three',   '1', 'TT_Task', 'TK_NotStart', '0', '40', '8', '2026-05-01 17:00'],
  ['%R', '4', 'A4', 'Not started four',    '1', 'TT_Task', 'TK_NotStart', '0', '40', '8', '2026-06-01 17:00'],
  ['%E']
].map(cols => cols.join('\t')).join('\n') + '\n';

describe('Executive Summary percentage is labelled for what it counts', () => {
  it('reports 25% as an activity-count figure, not as physical % complete', () => {
    const el = render({ A: parseXer(XER), B: null });
    const text = el.querySelector('.lens-narrative p').textContent;

    expect(text).toContain('25%');                       // 1 of 4 activities complete
    expect(text).toMatch(/by count/i);
    expect(text).not.toMatch(/25% physical complete/i);  // the shipped mislabel
  });

  it('says so even at 0%', () => {
    const none = XER.replace('TK_Complete', 'TK_NotStart');
    const el = render({ A: parseXer(none), B: null });
    const text = el.querySelector('.lens-narrative p').textContent;
    expect(text).toContain('0%');
    expect(text).toMatch(/by count/i);
    expect(text).not.toMatch(/0% physical complete/i);
  });
});
