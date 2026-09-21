// @vitest-environment happy-dom
//
// DCMA Lite must not contradict the full assessment on the same file.
//
// Measured on the public demonstration pair before this suite existed:
//   Invalid Dates   "0 PASS"      while 105 activities (103 of them ordinary
//                                 activities) carry an actual date after the
//                                 data date. The check only looked for a
//                                 MISSING actual date and never compared a
//                                 date with the data date.
//   Missed Tasks    "0.0% PASS"   where the full assessment finds 38 of 43.
//                                 The check read the current file's own
//                                 planned finish, which P6 reschedules on
//                                 unstarted work, and it skipped completed
//                                 activities, so a late finish was invisible.
//   High Float      37.6% = 152 of 404 (every activity) where the published
//                                 population gives 152 of 287 = 53.0%.
//   Heading         "14 of the 14 points" with CPLI and BEI hard-coded to a
//                                 dash and the Critical Path Test passing on
//                                 a bare count of critical activities.
//
// THE FIXTURE (synthetic; data date 2026-03-02)
//
//   code  type     status    actual start / finish     early finish  TF h   OD h
//   D100  task     complete  02-02 / 02-06                              0     40
//   D105  START MILESTONE, complete, actual 03-03 (after the data date)  0      0
//   D110  task     complete  02-09 / 02-20                              0     80
//   D120  task     complete  03-03 / 03-05  (BOTH after the data date)  0     40
//   D130  task     active    03-04 / -      (start after the data date) -16   80
//   D140  task     active    02-23 / -      early finish 02-27 (before) 40    40
//   D150  task     not started                                        400    400
//   D160  task     not started, hard constraint CS_MSO, no successor    80    40
//   D170  task     ACTIVE WITH NO ACTUAL START (a missing actual)       80    40
//   M100  finish milestone, not started                                  0      0
//   L100  level of effort
//
//   Ordinary activities (milestones, level of effort, WBS summary excluded): 8
//   Incomplete ordinary activities: D130 D140 D150 D160 D170               = 5
//   All activities except level of effort / WBS summary                   = 10
//
//   Logic            D160 has no successor                 4 of 5 = 80.0%  FAIL
//   Hard Constraints D160                                  1 of 5 = 20.0%  FAIL
//   High Float       D150 400 h / 8 = 50 wd > 44           1 of 5 = 20.0%  FAIL
//   Negative Float   D130                                  1 of 5 = 20.0%  FAIL
//   High Duration    D150 400 h / 8 = 50 wd > 44           1 of 5 = 20.0%  FAIL
//   (the old all-activity population gives 7 of 10, and 1 of 10 = 10.0% each)
//   Leads 0 of 9 PASS, Lags 1 of 9 = 11.1% FAIL, FS 8 of 9 = 88.9% REVIEW
//   Invalid Dates    D120 and D130 (actual after the data date) and D140
//                    (forecast finish before it) = 3 ACTIVITIES of 8. D120
//                    has two offending fields and still counts once. D105 is a
//                    milestone, outside this check's population.
//   Missing actuals  D170, reported under its own label, not as check 9.
//   Missed Tasks     baseline finish on or before 03-02, by the BASELINE's
//                    ordinary activities: D100 02-06, D105 02-10 (a task in
//                    the baseline), D110 02-13, D120 02-27, D130 02-27 = 5 due.
//                    D100 finished 02-06, on time. D105 03-03, D110 02-20 and
//                    D120 03-05 finished late; D130 is still open.
//                                                          4 of 5 = 80.0%  FAIL
//   Scored with a baseline: checks 1 to 9 and 11 = 10 of the 14.
//   Scored without one: 9 of the 14.
import { describe, it, expect } from 'vitest';
import { render, computeMetrics } from '../../src/sections/dcma-lite.js';
import { render as renderDashboard } from '../../src/sections/dashboard.js';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

function task(task_id, task_code, extra = {}) {
  return {
    task_id: String(task_id),
    task_code,
    task_name: `Activity ${task_code}`,
    proj_id: '1',
    wbs_id: 'W1',
    clndr_id: 'C1',
    status_code: 'TK_NotStart',
    task_type: 'TT_Task',
    complete_pct_type: 'CP_Drtn',
    phys_complete_pct: '0',
    target_drtn_hr_cnt: '40',
    remain_drtn_hr_cnt: '40',
    total_float_hr_cnt: '80',
    cstr_type: '',
    target_start_date: '2026-03-09 08:00',
    target_end_date: '2026-03-13 17:00',
    act_start_date: '',
    act_end_date: '',
    early_start_date: '2026-03-09 08:00',
    early_end_date: '2026-03-13 17:00',
    ...extra
  };
}

function rel(id, pred, succ, extra = {}) {
  return { task_pred_id: String(id), task_id: String(succ), pred_task_id: String(pred), pred_type: 'PR_FS', lag_hr_cnt: '0', ...extra };
}

function wrap(tasks, rels, dataDate = '2026-03-02 08:00') {
  return {
    ermhdr: { raw: ['ERMHDR', '24.12', '2026-03-02', 'Project', 'u', 'User', 'db', 'Project Management', 'USD'] },
    filename: 'synthetic-dcma.xer',
    tables: {
      PROJECT: {
        fields: ['proj_id', 'proj_short_name', 'last_recalc_date', 'scd_end_date'],
        records: [{ proj_id: '1', proj_short_name: 'SYN', last_recalc_date: dataDate, scd_end_date: '2026-06-30 17:00' }]
      },
      PROJWBS: {
        fields: ['wbs_id', 'parent_wbs_id', 'wbs_name', 'proj_id'],
        records: [{ wbs_id: 'W1', parent_wbs_id: '', wbs_name: 'Synthetic', proj_id: '1' }]
      },
      CALENDAR: {
        fields: ['clndr_id', 'clndr_name', 'day_hr_cnt', 'week_hr_cnt'],
        records: [{ clndr_id: 'C1', clndr_name: '5-Day', day_hr_cnt: '8', week_hr_cnt: '40' }]
      },
      TASK: { fields: Object.keys(task(1, 'X')), records: tasks },
      TASKPRED: { fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'], records: rels }
    }
  };
}

const DONE = { status_code: 'TK_Complete', remain_drtn_hr_cnt: '0', total_float_hr_cnt: '0', early_start_date: '', early_end_date: '' };

function current() {
  return wrap([
    task(100, 'D100', { ...DONE, target_end_date: '2026-02-06 17:00', act_start_date: '2026-02-02 08:00', act_end_date: '2026-02-06 17:00' }),
    task(105, 'D105', { ...DONE, task_type: 'TT_Mile', target_drtn_hr_cnt: '0', target_end_date: '2026-02-10 17:00',
                        act_start_date: '2026-03-03 08:00', act_end_date: '2026-03-03 08:00' }),
    task(110, 'D110', { ...DONE, target_drtn_hr_cnt: '80', target_end_date: '2026-02-13 17:00',
                        act_start_date: '2026-02-09 08:00', act_end_date: '2026-02-20 17:00' }),
    task(120, 'D120', { ...DONE, target_end_date: '2026-02-27 17:00', act_start_date: '2026-03-03 08:00', act_end_date: '2026-03-05 17:00' }),
    task(130, 'D130', { status_code: 'TK_Active', target_drtn_hr_cnt: '80', remain_drtn_hr_cnt: '80', total_float_hr_cnt: '-16',
                        target_end_date: '2026-02-27 17:00', act_start_date: '2026-03-04 08:00',
                        early_start_date: '2026-03-04 08:00', early_end_date: '2026-03-20 17:00' }),
    task(140, 'D140', { status_code: 'TK_Active', total_float_hr_cnt: '40', target_end_date: '2026-03-06 17:00',
                        act_start_date: '2026-02-23 08:00', early_start_date: '2026-03-02 08:00', early_end_date: '2026-02-27 17:00' }),
    task(150, 'D150', { target_drtn_hr_cnt: '400', remain_drtn_hr_cnt: '400', total_float_hr_cnt: '400',
                        target_end_date: '2026-06-30 17:00', early_end_date: '2026-06-30 17:00' }),
    task(160, 'D160', { cstr_type: 'CS_MSO' }),
    task(170, 'D170', { status_code: 'TK_Active', target_start_date: '2026-03-16 08:00', target_end_date: '2026-03-20 17:00',
                        early_start_date: '2026-03-16 08:00', early_end_date: '2026-03-20 17:00' }),
    task(900, 'M100', { task_type: 'TT_FinMile', target_drtn_hr_cnt: '0', remain_drtn_hr_cnt: '0', total_float_hr_cnt: '0',
                        target_end_date: '2026-06-30 17:00', early_start_date: '2026-06-30 17:00', early_end_date: '2026-06-30 17:00' }),
    task(950, 'L100', { task_type: 'TT_LOE', status_code: 'TK_Active', total_float_hr_cnt: '0', act_start_date: '2026-02-02 08:00' })
  ], [
    rel(1, 105, 100), rel(2, 100, 110), rel(3, 110, 120), rel(4, 120, 130), rel(5, 130, 140),
    rel(6, 140, 150, { lag_hr_cnt: '16' }), rel(7, 150, 160), rel(8, 150, 170, { pred_type: 'PR_SS' }), rel(9, 170, 900)
  ]);
}

/** A separate, earlier export of the same schedule: nothing started, D105 still a task. */
function baseline() {
  const B = reexport(current());
  for (const t of B.tables.TASK.records) {
    Object.assign(t, { status_code: 'TK_NotStart', act_start_date: '', act_end_date: '', remain_drtn_hr_cnt: t.target_drtn_hr_cnt });
    if (t.task_code === 'D105') Object.assign(t, { task_type: 'TT_Task', target_drtn_hr_cnt: '16', remain_drtn_hr_cnt: '16' });
  }
  B.tables.PROJECT.records[0].last_recalc_date = '2026-02-02 08:00';
  return B;
}

/** One row of the metric table by metric name: [metric, result, count, target, status]. */
function row(el, nameRe) {
  const tr = [...el.querySelectorAll('tbody tr')].find(r => nameRe.test(r.children[0]?.textContent || ''));
  return tr ? [...tr.children].map(td => td.textContent) : null;
}

describe('DCMA Lite fixture', () => {
  it('is two separate exports of one schedule', () => {
    const overlap = assertDivergentSurrogates(current(), baseline(), { minSharedCodes: 11 });
    expect(overlap.sharedTaskIds).toBe(0);
    expect(overlap.sharedCodes).toBe(11);
  });
});

describe('DCMA Lite check 9, Invalid Dates, compares dates with the data date', () => {
  it('counts activities with an actual date after the data date or a forecast date before it', () => {
    const r = row(render({ A: current(), B: null }), /^Invalid Dates/);
    expect(r[1]).toBe('3');
    expect(r[2]).toContain('3 of 8 activities');
    expect(r[2]).toContain('2 with an actual date after the data date');
    expect(r[2]).toContain('1 with a forecast date before it');
    expect(r[4]).toBe('FAIL');
  });

  it('counts an activity once however many of its dates offend', () => {
    // D120 has an actual start AND an actual finish after the data date: four
    // offending fields in the file, three offending activities.
    const m = computeMetrics(current(), null).metrics.find(x => /^Invalid Dates/.test(x.name));
    expect(m.result).toBe('3');
  });

  it('reports a missing actual date under its own label, not as check 9', () => {
    const el = render({ A: current(), B: null });
    const note = el.querySelector('.lens-dcma-missing-actuals');
    expect(note).toBeTruthy();
    expect(note.textContent).toMatch(/Missing actual dates: 1\b/);
    expect(note.textContent).toMatch(/not DCMA check 9/i);
  });

  it('passes a file whose dates are on the right side of the data date', () => {
    const A = current();
    for (const t of A.tables.TASK.records) {
      if (t.task_code === 'D105') Object.assign(t, { act_start_date: '2026-02-10 08:00', act_end_date: '2026-02-10 08:00' });
      if (t.task_code === 'D120') Object.assign(t, { act_start_date: '2026-02-23 08:00', act_end_date: '2026-02-27 17:00' });
      if (t.task_code === 'D130') t.act_start_date = '2026-02-27 08:00';
      if (t.task_code === 'D140') t.early_end_date = '2026-03-06 17:00';
    }
    const r = row(render({ A, B: null }), /^Invalid Dates/);
    expect(r[1]).toBe('0');
    expect(r[4]).toBe('PASS');
  });

  it('an actual date ON the data date is not after it, whatever the hour', () => {
    const A = current();
    for (const t of A.tables.TASK.records) {
      if (t.task_code === 'D105') Object.assign(t, { act_start_date: '2026-03-02 17:00', act_end_date: '2026-03-02 17:00' });
      if (t.task_code === 'D120') Object.assign(t, { act_start_date: '2026-03-02 08:00', act_end_date: '2026-03-02 17:00' });
      if (t.task_code === 'D130') t.act_start_date = '2026-03-02 13:00';
      if (t.task_code === 'D140') t.early_end_date = '2026-03-02 17:00';
    }
    expect(row(render({ A, B: null }), /^Invalid Dates/)[1]).toBe('0');
  });
});

describe('DCMA Lite check 11, Missed Tasks, is measured against the baseline', () => {
  it('says "needs a baseline" and is never PASS when no baseline is loaded', () => {
    const r = row(render({ A: current(), B: null }), /^Missed Tasks/);
    expect(r[1]).toContain('needs a baseline');
    expect(r[4]).toBe('NOT SCORED');
    expect(r[4]).not.toBe('PASS');
  });

  it('counts late finishes and still-open work over the activities due by the data date', () => {
    const r = row(render({ A: current(), B: baseline() }), /^Missed Tasks/);
    expect(r[1]).toBe('80.0%');
    expect(r[2]).toContain('4 of 5');
    expect(r[4]).toBe('FAIL');
  });

  it('passes when everything due finished on or before its baseline finish', () => {
    const A = current();
    const B = baseline();
    // Give every due activity a baseline finish no earlier than it actually finished.
    const finish = { D100: '2026-02-06 17:00', D105: '2026-03-03 17:00', D110: '2026-02-20 17:00', D120: '2026-03-05 17:00' };
    for (const t of B.tables.TASK.records) {
      if (finish[t.task_code]) t.target_end_date = finish[t.task_code];
      if (t.task_code === 'D130') t.target_end_date = '2026-03-27 17:00';   // not due yet
    }
    // Only D100, D110 are due on or before 03-02 now, and both finished on time.
    const r = row(render({ A, B }), /^Missed Tasks/);
    expect(r[1]).toBe('0.0%');
    expect(r[2]).toContain('0 of 2');
    expect(r[4]).toBe('PASS');
  });
});

describe('DCMA Lite percentage checks use incomplete activities and print the denominator', () => {
  it('High Float is 1 of 5 incomplete activities, not 1 of 10 activities', () => {
    const r = row(render({ A: current(), B: null }), /^High Float/);
    expect(r[1]).toBe('20.0%');
    expect(r[2]).toBe('1 of 5 incomplete activities');
    expect(r[4]).toBe('FAIL');
  });

  it('High Duration is 1 of 5 incomplete activities', () => {
    const r = row(render({ A: current(), B: null }), /^High Duration/);
    expect(r[1]).toBe('20.0%');
    expect(r[2]).toBe('1 of 5 incomplete activities');
  });

  it('Logic, Hard Constraints and Negative Float use the same population', () => {
    const el = render({ A: current(), B: null });
    expect(row(el, /^Logic/).slice(1, 3)).toEqual(['80.0%', '4 of 5 incomplete activities']);
    expect(row(el, /^Hard Constraints/).slice(1, 3)).toEqual(['20.0%', '1 of 5 incomplete activities']);
    expect(row(el, /^Negative Float/).slice(1, 3)).toEqual(['20.0%', '1 of 5 incomplete activities']);
  });

  it('relationship checks print the relationship count', () => {
    const el = render({ A: current(), B: null });
    expect(row(el, /^Leads/).slice(1, 3)).toEqual(['0', '0 of 9 relationships']);
    expect(row(el, /^Lags/).slice(1, 3)).toEqual(['11.1%', '1 of 9 relationships']);
    expect(row(el, /^FS Relationships/).slice(1, 3)).toEqual(['88.9%', '8 of 9 relationships']);
  });

  it('says on the page which activities the population leaves out', () => {
    const el = render({ A: current(), B: null });
    const note = el.querySelector('.lens-dcma-population');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('5 incomplete activities');
    expect(note.textContent).toMatch(/milestones/i);
    expect(note.textContent).toMatch(/level of effort/i);
  });
});

describe('DCMA Lite says how many of the 14 points it scores', () => {
  it('unscored rows say "not scored here" with the reason, and are never PASS', () => {
    const el = render({ A: current(), B: baseline() });
    for (const nameRe of [/^Resources/, /^Critical Path Test/, /^CPLI/, /^BEI/]) {
      const r = row(el, nameRe);
      expect(r, String(nameRe)).toBeTruthy();
      expect(r[1], String(nameRe)).toMatch(/^Not scored here: \S/);
      expect(r[4], String(nameRe)).toBe('NOT SCORED');
    }
  });

  it('the Critical Path Test no longer passes on a count of critical activities', () => {
    const r = row(render({ A: current(), B: null }), /^Critical Path Test/);
    expect(r[4]).not.toBe('PASS');
    expect(r[1]).toMatch(/does not recalculate/);
  });

  it('the heading counts the scored checks: 10 with a baseline, 9 without', () => {
    const withB = render({ A: current(), B: baseline() }).querySelector('.lens-dcma-heading').textContent;
    expect(withB).toContain('10 of the 14 points are scored here');
    expect(withB).toContain('1 PASS');
    expect(withB).toContain('1 REVIEW');
    expect(withB).toContain('8 FAIL');
    expect(withB).toContain('4 not scored here');
    expect(withB).not.toContain('14 of the 14');

    const withoutB = render({ A: current(), B: null }).querySelector('.lens-dcma-heading').textContent;
    expect(withoutB).toContain('9 of the 14 points are scored here');
    expect(withoutB).toContain('5 not scored here');
  });

  it('still renders fourteen rows', () => {
    expect(render({ A: current(), B: baseline() }).querySelectorAll('tbody tr').length).toBe(14);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The Executive Dashboard banner. A clean network for the "healthy" case:
// start milestone -> eight tasks -> finish milestone, all finish-to-start, no
// lag, no constraint, 40 h of float on everything but the finish milestone, so
// 1 of 10 activities sits at zero float (10%, under the 15% amber line) and
// every scored DCMA Lite check passes.
// ─────────────────────────────────────────────────────────────────────────────
function cleanSchedule() {
  const tasks = [task(1, 'MS', { task_type: 'TT_Mile', target_drtn_hr_cnt: '0', remain_drtn_hr_cnt: '0', total_float_hr_cnt: '40' })];
  for (let i = 1; i <= 8; i++) tasks.push(task(10 + i, `T${i}`, { total_float_hr_cnt: '40' }));
  tasks.push(task(99, 'MF', { task_type: 'TT_FinMile', target_drtn_hr_cnt: '0', remain_drtn_hr_cnt: '0', total_float_hr_cnt: '0' }));
  const rels = [];
  for (let i = 0; i < tasks.length - 1; i++) rels.push(rel(i + 1, tasks[i].task_id, tasks[i + 1].task_id));
  return wrap(tasks, rels);
}

function banner(A) {
  return renderDashboard({ A, B: null }).querySelector('.lens-status-banner');
}

describe('Executive Dashboard "Schedule status" banner', () => {
  it('still says healthy for a schedule with no failing check and no bad dates', () => {
    const b = banner(cleanSchedule());
    expect(b.textContent).toBe('Schedule status: healthy');
    expect(b.getAttribute('data-tone')).toBe('green');
  });

  it('does not say healthy when a scored DCMA Lite check fails, and names the check', () => {
    const A = cleanSchedule();
    A.tables.TASK.records.find(t => t.task_code === 'T3').cstr_type = 'CS_MSO';   // 1 of 8 = 12.5% > 5%
    const b = banner(A);
    expect(b.textContent).not.toContain('healthy');
    expect(b.textContent).toContain('Hard Constraints');
    expect(b.getAttribute('data-tone')).not.toBe('green');
  });

  it('does not say healthy when the file carries an actual date after its data date', () => {
    // Only the start MILESTONE is statused past the data date, so DCMA check 9
    // (ordinary activities only) still passes. The banner must not.
    const A = cleanSchedule();
    Object.assign(A.tables.TASK.records.find(t => t.task_code === 'MS'), {
      status_code: 'TK_Complete', act_start_date: '2026-03-03 08:00', act_end_date: '2026-03-03 08:00',
      early_start_date: '', early_end_date: ''
    });
    const b = banner(A);
    expect(b.textContent).not.toContain('healthy');
    expect(b.textContent).toMatch(/actual date after the data date/);
    expect(b.getAttribute('data-tone')).not.toBe('green');
  });
});
