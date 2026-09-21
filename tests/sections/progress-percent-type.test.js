// @vitest-environment happy-dom
//
// Progress figures must follow each activity's P6 percent complete type.
//
// WBS Roll-up, Period Reporting and the 3-Week Lookahead all read
// phys_complete_pct and nothing else. Duration is P6's default percent
// complete type, and a Duration-type activity normally carries a stored
// physical percent of 0 for its whole life, so finished work read 0%. Measured
// on the public demonstration pair: a WBS node with 12 of 12 activities
// complete showed 0.0%, the WBS root showed 1.7% where the type-aware figure
// is 16.7%, and 57 of 81 "Completed this period" rows showed +0.0%.
//
// The fixture is synthetic and small enough to work by hand:
//
//   Phase 1 (both complete, Duration type, stored physical percent 0)
//     P1A  OD 40 h            -> 100
//     P1B  OD 80 h            -> 100
//   Phase 2
//     P2A  Duration  OD 80 RD 60         -> (80-60)/80 = 25
//     P2B  Duration  OD 40 RD 60         -> (40-60)/40 = -50, floored to 0
//     P2C  Physical  stored 30, OD 40    -> 30 (the duration ratio would be 75)
//     P2D  Units     30 actual, 90 left  -> 30/120 = 25, OD 40
//     P2E  Units, no units, OD 40 RD 30  -> duration rule, (40-30)/40 = 25
//     P2F  Duration, not started, OD 40  -> 0
//
//   Roll-ups are weighted by original duration:
//     Phase 1 = (100*40 + 100*80) / 120                         = 100.0
//     Phase 2 = (25*80 + 0*40 + 30*40 + 25*40 + 25*40 + 0*40) / 280
//             = 5200 / 280                                       = 18.571 -> 18.6
//     Root    = (12000 + 5200) / 400                             = 43.0
//   Reading phys_complete_pct alone gives 0.0, 4.3 and 3.0.
import { describe, it, expect } from 'vitest';
import { render as renderWbsRollup } from '../../src/sections/wbs-rollup.js';
import { render as renderPeriod } from '../../src/sections/period-reporting.js';
import { render as renderLookahead } from '../../src/sections/lookahead.js';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

function task(task_id, task_code, wbs_id, extra = {}) {
  return {
    task_id: String(task_id),
    task_code,
    task_name: `Activity ${task_code}`,
    proj_id: '1',
    wbs_id,
    clndr_id: 'C1',
    status_code: 'TK_Active',
    task_type: 'TT_Task',
    complete_pct_type: 'CP_Drtn',
    phys_complete_pct: '0',
    target_drtn_hr_cnt: '40',
    remain_drtn_hr_cnt: '40',
    act_work_qty: '0',
    remain_work_qty: '0',
    act_equip_qty: '0',
    remain_equip_qty: '0',
    total_float_hr_cnt: '40',
    target_start_date: '2026-02-23 08:00',
    target_end_date: '2026-03-06 17:00',
    act_start_date: '2026-02-23 08:00',
    act_end_date: '',
    early_start_date: '2026-03-02 08:00',
    early_end_date: '2026-03-06 17:00',
    ...extra
  };
}

const DONE = { status_code: 'TK_Complete', remain_drtn_hr_cnt: '0', early_start_date: '', early_end_date: '' };

function current() {
  const tasks = [
    task(101, 'P1A', 'W2', { ...DONE, act_start_date: '2026-02-02 08:00', act_end_date: '2026-02-06 17:00' }),
    task(102, 'P1B', 'W2', { ...DONE, target_drtn_hr_cnt: '80', act_start_date: '2026-02-09 08:00', act_end_date: '2026-02-20 17:00' }),
    task(103, 'P2A', 'W3', { target_drtn_hr_cnt: '80', remain_drtn_hr_cnt: '60' }),
    task(104, 'P2B', 'W3', { remain_drtn_hr_cnt: '60' }),
    task(105, 'P2C', 'W3', { complete_pct_type: 'CP_Phys', phys_complete_pct: '30', remain_drtn_hr_cnt: '10' }),
    task(106, 'P2D', 'W3', { complete_pct_type: 'CP_Units', act_work_qty: '30', remain_work_qty: '90' }),
    task(107, 'P2E', 'W3', { complete_pct_type: 'CP_Units', remain_drtn_hr_cnt: '30' }),
    task(108, 'P2F', 'W3', { status_code: 'TK_NotStart', act_start_date: '' })
  ];
  return {
    ermhdr: { raw: ['ERMHDR', '24.12', '2026-03-02', 'Project', 'u', 'User', 'db', 'Project Management', 'USD'] },
    filename: 'synthetic-progress.xer',
    tables: {
      PROJECT: {
        fields: ['proj_id', 'proj_short_name', 'last_recalc_date', 'scd_end_date'],
        records: [{ proj_id: '1', proj_short_name: 'SYN', last_recalc_date: '2026-03-02 08:00', scd_end_date: '2026-04-30 17:00' }]
      },
      PROJWBS: {
        fields: ['wbs_id', 'parent_wbs_id', 'wbs_name', 'wbs_short_name', 'proj_id'],
        records: [
          { wbs_id: 'W1', parent_wbs_id: '',   wbs_name: 'Synthetic Project', wbs_short_name: 'SYN', proj_id: '1' },
          { wbs_id: 'W2', parent_wbs_id: 'W1', wbs_name: 'Phase 1',           wbs_short_name: 'P1',  proj_id: '1' },
          { wbs_id: 'W3', parent_wbs_id: 'W1', wbs_name: 'Phase 2',           wbs_short_name: 'P2',  proj_id: '1' }
        ]
      },
      CALENDAR: {
        fields: ['clndr_id', 'clndr_name', 'day_hr_cnt', 'week_hr_cnt'],
        records: [{ clndr_id: 'C1', clndr_name: '5-Day', day_hr_cnt: '8', week_hr_cnt: '40' }]
      },
      TASK: { fields: Object.keys(tasks[0]), records: tasks },
      TASKPRED: { fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'], records: [] }
    }
  };
}

/** The same schedule one period earlier: a separate export, nothing started. */
function baseline() {
  const B = reexport(current());
  for (const t of B.tables.TASK.records) {
    Object.assign(t, {
      status_code: 'TK_NotStart', remain_drtn_hr_cnt: t.target_drtn_hr_cnt, phys_complete_pct: '0',
      act_work_qty: '0', act_start_date: '', act_end_date: ''
    });
  }
  B.tables.PROJECT.records[0].last_recalc_date = '2026-02-02 08:00';
  return B;
}

/** The table row whose first cell is exactly `first`. */
function rowStartingWith(el, first) {
  return [...el.querySelectorAll('tbody tr')].find(tr => tr.firstElementChild?.textContent === first);
}

function cells(tr) {
  return [...tr.querySelectorAll('td')].map(td => td.textContent);
}

describe('WBS Roll-up follows the percent complete type', () => {
  it('a node whose activities are all complete reads 100.0%, not 0.0%', () => {
    const el = renderWbsRollup({ A: current(), B: null });
    const row = rowStartingWith(el, 'Synthetic Project > Phase 1');
    expect(row).toBeTruthy();
    expect(cells(row).at(-1)).toBe('100.0%');
  });

  it('mixes duration, physical and units activities, weighted by original duration', () => {
    const el = renderWbsRollup({ A: current(), B: null });
    expect(cells(rowStartingWith(el, 'Synthetic Project > Phase 2')).at(-1)).toBe('18.6%');
    expect(cells(rowStartingWith(el, 'Synthetic Project')).at(-1)).toBe('43.0%');
  });

  it('states its progress basis on the page', () => {
    const el = renderWbsRollup({ A: current(), B: null });
    const basis = el.querySelector('.lens-progress-basis');
    expect(basis).toBeTruthy();
    expect(basis.textContent).toContain('5 by duration');
    expect(basis.textContent).toContain('1 by physical');
    expect(basis.textContent).toContain('1 by units');
    expect(basis.textContent).toMatch(/weighted by original duration/i);
  });
});

describe('Period Reporting follows the percent complete type', () => {
  it('fixture sanity: the pair is two separate exports of one schedule', () => {
    const overlap = assertDivergentSurrogates(current(), baseline(), { minSharedCodes: 8 });
    expect(overlap.sharedTaskIds).toBe(0);
    expect(overlap.sharedCodes).toBe(8);
  });

  it('an activity that went from not started to complete shows +100.0%, not +0.0%', () => {
    const el = renderPeriod({ A: current(), B: baseline() });
    const row = rowStartingWith(el, 'P1A');
    expect(row).toBeTruthy();
    expect(cells(row)[2]).toBe('+100.0%');
  });

  it('earned this period is the duration-weighted change: +43.0%', () => {
    // Baseline percent complete is 0 on every activity, so the weighted change
    // equals the current weighted percent worked in the header: 17200 / 400.
    const el = renderPeriod({ A: current(), B: baseline() });
    const card = [...el.querySelectorAll('.kpi')]
      .find(c => c.querySelector('.kpi-title')?.textContent === 'Earned this period');
    expect(card.querySelector('.kpi-big').textContent).toBe('+43.0%');
  });

  it('states its progress basis on the page', () => {
    const el = renderPeriod({ A: current(), B: baseline() });
    const basis = el.querySelector('.lens-progress-basis');
    expect(basis).toBeTruthy();
    expect(basis.textContent).toContain('by duration');
    expect(basis.textContent).toMatch(/current file minus .* baseline file/i);
    expect(basis.textContent).toMatch(/weighted by .*original duration/i);
  });
});

describe('3-Week Lookahead %Done follows the percent complete type', () => {
  it('a Duration-type activity in progress shows its duration percent', () => {
    const el = renderLookahead({ A: current(), B: null });
    const row = rowStartingWith(el, 'P2A');
    expect(row).toBeTruthy();
    // columns: Code, Name, Start, Finish, OD, RD, %Done, TF, Status, Notes
    expect(cells(row)[6]).toBe('25%');
    expect(cells(row)[9]).toContain('25% complete');
  });

  it('a Physical-type activity still shows the stored physical percent', () => {
    const el = renderLookahead({ A: current(), B: null });
    expect(cells(rowStartingWith(el, 'P2C'))[6]).toBe('30%');
  });

  it('states its progress basis on the page', () => {
    const el = renderLookahead({ A: current(), B: null });
    const basis = el.querySelector('.lens-progress-basis');
    expect(basis).toBeTruthy();
    expect(basis.textContent).toContain('%Done');
    expect(basis.textContent).toContain('by duration');
  });
});
