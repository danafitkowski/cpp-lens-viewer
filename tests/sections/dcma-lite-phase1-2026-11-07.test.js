// @vitest-environment happy-dom
//
// DCMA Lite, phase 1 corrections (2026-11-07). Five defects found by the
// three-reviewer audit of CPP's DCMA engines and verified on real P6 exports:
//
//   1. A blank total float read as "not high" and "not negative" and stayed in
//      the denominator, so an export that was never rescheduled read PASS on
//      High Float and Negative Float with no float in the file at all.
//   2. Every TASK, relationship and assignment in a multi-project file was
//      graded as one blended schedule against the FIRST PROJECT row's data
//      date, so reordering two PROJECT rows changed the result.
//   3. An activity with a blank calendar was converted at P6's 8-hour default,
//      not on the project calendar P6 schedules it on.
//   4. Hard Constraints left out Start On or Before and Finish On or Before
//      (DCMA-EA PAM 200.1 s4.5 lists four hard types) and the secondary
//      constraint.
//   5. Missed Tasks left a due baseline activity with no match in the current
//      file out of the rate, so deleting due work improved the score, and a
//      renumbered baseline could read "0 due".
//
// Every XER here is built inline as text and parsed with the real parser.
import { describe, it, expect } from 'vitest';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { computeMetrics, render, selectScoredProject, NOT_SCORED } from '../../src/sections/dcma-lite.js';
import { workingDayContext, HOUR_FIELDS } from '../../src/sections/_shared/working-days.js';

const TAB = '\t';
const EIGHT = '(0||0(s|08:00|f|16:00)())';
const TEN = '(0||0(s|07:00|f|17:00)())';
function monFri(slot) {
  let body = '';
  for (let d = 1; d <= 7; d++) body += `(0||${d}()(${d >= 2 && d <= 6 ? slot : ''}))`;
  return `(0||CalendarData()((0||DaysOfWeek()(${body}))(0||Exceptions()())))`;
}

const PROJECT_FIELDS = ['proj_id', 'proj_short_name', 'last_recalc_date', 'clndr_id'];
const CAL_FIELDS = ['clndr_id', 'clndr_name', 'day_hr_cnt', 'week_hr_cnt', 'default_flag', 'clndr_data'];
const TASK_FIELDS = ['task_id', 'proj_id', 'task_code', 'task_name', 'clndr_id', 'status_code', 'task_type',
  'target_drtn_hr_cnt', 'remain_drtn_hr_cnt', 'total_float_hr_cnt', 'cstr_type', 'cstr_type2',
  'target_start_date', 'target_end_date', 'act_start_date', 'act_end_date', 'early_start_date', 'early_end_date'];
const REL_FIELDS = ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'];
// 2026-11-07 DCMA phase 2: an assignment makes an activity resourced only when
// it carries hours or cost (DCMA definition #10), so the rows carry target_qty.
const RSRC_FIELDS = ['taskrsrc_id', 'task_id', 'rsrc_id', 'target_qty'];

function proj(proj_id, proj_short_name, last_recalc_date, clndr_id = 'C8') {
  return { proj_id, proj_short_name, last_recalc_date, clndr_id };
}

function cal(clndr_id, slot = EIGHT, extra = {}) {
  return { clndr_id, clndr_name: clndr_id, day_hr_cnt: slot === TEN ? '10' : '8', week_hr_cnt: '40',
    default_flag: 'N', clndr_data: monFri(slot), ...extra };
}

function task(task_id, task_code, extra = {}) {
  return {
    task_id: String(task_id), proj_id: '1', task_code, task_name: `Activity ${task_code}`, clndr_id: 'C8',
    status_code: 'TK_NotStart', task_type: 'TT_Task',
    target_drtn_hr_cnt: '40', remain_drtn_hr_cnt: '40', total_float_hr_cnt: '40', cstr_type: '', cstr_type2: '',
    target_start_date: '2026-04-06 08:00', target_end_date: '2026-04-10 16:00',
    act_start_date: '', act_end_date: '',
    early_start_date: '2026-04-06 08:00', early_end_date: '2026-04-10 16:00',
    ...extra
  };
}

const DONE = { status_code: 'TK_Complete', remain_drtn_hr_cnt: '0', total_float_hr_cnt: '0', early_start_date: '', early_end_date: '' };

function rel(id, pred, succ, extra = {}) {
  return { task_pred_id: String(id), task_id: String(succ), pred_task_id: String(pred), pred_type: 'PR_FS', lag_hr_cnt: '0', ...extra };
}

function table(name, fields, rows) {
  return [['%T', name], ['%F', ...fields], ...rows.map(r => ['%R', ...fields.map(f => r[f] == null ? '' : String(r[f]))])];
}

function xer({ projects = [proj('1', 'SYN', '2026-04-01 08:00')], calendars = [cal('C8')], tasks = [], rels = [], rsrc = [] }) {
  const lines = [
    ['ERMHDR', '23.12', '2026-11-07', 'Project', 'admin', 'admin', 'db', 'Project Management', 'USD'],
    ...table('PROJECT', PROJECT_FIELDS, projects),
    ...table('CALENDAR', CAL_FIELDS, calendars),
    ...table('TASK', TASK_FIELDS, tasks),
    ...table('TASKPRED', REL_FIELDS, rels),
    ...(rsrc.length ? table('TASKRSRC', RSRC_FIELDS, rsrc) : []),
    ['%E']
  ];
  return parseXer(lines.map(l => l.join(TAB)).join('\r\n') + '\r\n');
}

function metric(m, nameRe) {
  return m.metrics.find(x => nameRe.test(x.name));
}

// A simple chain over the given tasks so Logic does not get in the way.
function chain(tasks) {
  const rels = [];
  for (let i = 0; i < tasks.length - 1; i++) rels.push(rel(i + 1, tasks[i].task_id, tasks[i + 1].task_id));
  return rels;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Blank total float
// ─────────────────────────────────────────────────────────────────────────────
describe('1. a blank total float is left out of High Float and Negative Float, and counted', () => {
  it('every incomplete activity blank: High Float and Negative Float are NOT SCORED, not PASS', () => {
    const tasks = [1, 2, 3].map(i => task(i, `A${i}`, { total_float_hr_cnt: '' }));
    const m = computeMetrics(xer({ tasks, rels: chain(tasks) }));
    for (const re of [/^High Float/, /^Negative Float/]) {
      const r = metric(m, re);
      expect(r.status, String(re)).toBe(NOT_SCORED);
      expect(r.result, String(re)).toContain('the file carries no computed total float; recalculate in P6 and re-export');
    }
  });

  it('some blank or non-numeric: they leave the denominator and the Count says how many', () => {
    // 5 incomplete: two carry no usable float, one high (400 h = 50 wd), one negative, one ordinary.
    const tasks = [
      task(1, 'A1', { total_float_hr_cnt: '' }),
      task(2, 'A2', { total_float_hr_cnt: 'n/a' }),
      task(3, 'A3', { total_float_hr_cnt: '400' }),
      task(4, 'A4', { total_float_hr_cnt: '-8' }),
      task(5, 'A5', { total_float_hr_cnt: '40' })
    ];
    const m = computeMetrics(xer({ tasks, rels: chain(tasks) }));
    const hf = metric(m, /^High Float/);
    expect(hf.result).toBe('33.3%');
    expect(hf.count).toContain('1 of 3 incomplete activities');
    expect(hf.count).toMatch(/2 .*no total float.*left out/);
    expect(hf.status).toBe('FAIL');
    const nf = metric(m, /^Negative Float/);
    expect(nf.result).toBe('33.3%');
    expect(nf.count).toContain('1 of 3 incomplete activities');
    expect(nf.count).toMatch(/2 .*no total float.*left out/);
    // The information count on the Critical Path Test row skips blanks too.
    const cp = metric(m, /^Critical Path Test/);
    expect(cp.result).toContain('1 of 3 incomplete activities');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. One project per file
// ─────────────────────────────────────────────────────────────────────────────
//   ALPHA (proj 1), data date 2026-03-02: A1..A3 incomplete, 400 h float each.
//   BRAVO (proj 2), data date 2026-04-01 (the latest, so it is scored):
//     B0 complete, actual finish 2026-03-15 (after ALPHA's data date, before
//        BRAVO's), B1 and B2 incomplete, 40 h float. B1 resourced, B2 not.
//   Relationships: A1->A2, A2->A3, B0->B1, B1->B2, and A3->B1 across projects.
function twoProjects(order = ['1', '2']) {
  const projects = { 1: proj('1', 'ALPHA', '2026-03-02 08:00'), 2: proj('2', 'BRAVO', '2026-04-01 08:00') };
  const tasks = [
    task(11, 'A1', { total_float_hr_cnt: '400', early_start_date: '2026-03-02 08:00' }),
    task(12, 'A2', { total_float_hr_cnt: '400' }),
    task(13, 'A3', { total_float_hr_cnt: '400' }),
    task(20, 'B0', { ...DONE, proj_id: '2', target_end_date: '2026-03-13 16:00',
                     act_start_date: '2026-03-09 08:00', act_end_date: '2026-03-15 16:00' }),
    task(21, 'B1', { proj_id: '2', target_end_date: '2026-03-27 16:00' }),
    task(22, 'B2', { proj_id: '2', target_end_date: '2026-05-01 16:00' })
  ];
  const rels = [rel(1, 11, 12), rel(2, 12, 13), rel(3, 20, 21), rel(4, 21, 22), rel(5, 13, 21)];
  const rsrc = [
    { taskrsrc_id: '1', task_id: '11', rsrc_id: 'R1', target_qty: '40' }, { taskrsrc_id: '2', task_id: '12', rsrc_id: 'R1', target_qty: '40' },
    { taskrsrc_id: '3', task_id: '13', rsrc_id: 'R1', target_qty: '40' }, { taskrsrc_id: '4', task_id: '21', rsrc_id: 'R1', target_qty: '40' }
  ];
  return xer({ projects: order.map(k => projects[k]), tasks, rels, rsrc });
}

describe('2. a multi-project file is scored on one project', () => {
  it('scores the project with the latest data date, on its own data date', () => {
    const m = computeMetrics(twoProjects());
    expect(m.incompleteCount).toBe(2);
    // B0 finished on 03-15: after ALPHA's data date, not after BRAVO's.
    expect(metric(m, /^Invalid Dates/).status).toBe('PASS');
    // ALPHA's 400 h float activities are not BRAVO's.
    expect(metric(m, /^High Float/).count).toBe('0 of 2 incomplete activities');
    // Only BRAVO's own relationships: the cross-project link is not one of them.
    // 2026-11-07 DCMA phase 2: the count names the relationships into
    // unfinished work, the population checks 2 to 4 now grade.
    expect(metric(m, /^Leads/).count).toBe('0 of 2 relationships into unfinished work');
    // Assignments in the scored project only: B1 yes, B2 no.
    // 2026-11-07 DCMA phase 2: worded for the one-working-day population.
    expect(metric(m, /^Resources/).count).toBe('1 of 2 incomplete activities of one working day or more carry hours or cost');
  });

  it('swapping the order of the PROJECT rows changes nothing', () => {
    const a = computeMetrics(twoProjects(['1', '2']));
    const b = computeMetrics(twoProjects(['2', '1']));
    expect(JSON.stringify(b.metrics)).toBe(JSON.stringify(a.metrics));
    expect(selectScoredProject(twoProjects(['2', '1'])).project.proj_short_name).toBe('BRAVO');
  });

  it('the heading names the scored project when the file holds more than one', () => {
    const heading = render({ A: twoProjects(), B: null }).querySelector('.lens-dcma-heading').textContent;
    expect(heading).toContain('Scored project: BRAVO (1 of 2 projects in this file)');
    const single = render({ A: xer({ tasks: [task(1, 'A1')] }), B: null }).querySelector('.lens-dcma-heading').textContent;
    expect(single).not.toContain('Scored project');
  });

  it('a tie on data date goes to the project with more TASK rows, then to file order', () => {
    const tasks = [task(1, 'A1'), task(2, 'A2', { proj_id: '2' }), task(3, 'A3', { proj_id: '2' })];
    const p1 = proj('1', 'ONE', '2026-04-01 08:00');
    const p2 = proj('2', 'TWO', '2026-04-01 08:00');
    expect(selectScoredProject(xer({ projects: [p1, p2], tasks })).project.proj_id).toBe('2');
    expect(selectScoredProject(xer({ projects: [p2, p1], tasks })).project.proj_id).toBe('2');
    const even = [task(1, 'A1'), task(2, 'A2', { proj_id: '2' })];
    expect(selectScoredProject(xer({ projects: [p2, p1], tasks: even })).project.proj_id).toBe('2');
    expect(selectScoredProject(xer({ projects: [p1, p2], tasks: even })).project.proj_id).toBe('1');
  });

  it('the baseline side picks the baseline project with the same short name, and says which', () => {
    // ZULU has the later data date; BRAVO shares the scored project's name.
    const B = xer({
      projects: [proj('7', 'BRAVO', '2026-02-02 08:00'), proj('8', 'ZULU', '2026-02-20 08:00')],
      tasks: [
        task(70, 'B0', { proj_id: '7', target_end_date: '2026-03-13 16:00' }),
        task(71, 'B1', { proj_id: '7', target_end_date: '2026-03-27 16:00' }),
        task(72, 'B2', { proj_id: '7', target_end_date: '2026-05-01 16:00' }),
        task(80, 'Z1', { proj_id: '8', target_end_date: '2026-03-13 16:00' }),
        task(81, 'Z2', { proj_id: '8', target_end_date: '2026-03-13 16:00' }),
        task(82, 'Z3', { proj_id: '8', target_end_date: '2026-03-13 16:00' })
      ]
    });
    const r = metric(computeMetrics(twoProjects(), B), /^Missed Tasks/);
    // B0 finished 03-15 against 03-13 (late); B1 is still open.
    expect(r.result).toBe('100.0%');
    expect(r.count).toContain('2 of 2');
    expect(r.count).toContain('BRAVO');
    expect(r.status).toBe('FAIL');
  });

  it('with no name match the baseline side picks the project sharing the most Activity IDs', () => {
    const B = xer({
      projects: [proj('7', 'OLD-B', '2026-02-02 08:00'), proj('8', 'OLD-Z', '2026-02-20 08:00')],
      tasks: [
        task(70, 'B0', { proj_id: '7', target_end_date: '2026-03-13 16:00' }),
        task(71, 'B1', { proj_id: '7', target_end_date: '2026-03-27 16:00' }),
        task(80, 'Z1', { proj_id: '8', target_end_date: '2026-03-13 16:00' })
      ]
    });
    const r = metric(computeMetrics(twoProjects(), B), /^Missed Tasks/);
    expect(r.count).toContain('OLD-B');
    expect(r.count).toContain('2 of 2');
  });

  // 2026-11-07 DCMA phase 2 (definition D9): the same proj_id comes first, and
  // with no project ID, short name or Activity ID in common the baseline is not
  // used at all. The last resort used to be "the latest data date", which
  // compared the scored project with a baseline of some other project.
  it('a baseline project with the same project ID is preferred over a name match', () => {
    const B = xer({
      projects: [proj('8', 'BRAVO', '2026-02-20 08:00'), proj('2', 'RENAMED', '2026-02-02 08:00')],
      tasks: [
        task(80, 'B0', { proj_id: '8', target_end_date: '2026-03-20 16:00' }),
        task(70, 'B0', { proj_id: '2', target_end_date: '2026-03-13 16:00' }),
        task(71, 'B1', { proj_id: '2', target_end_date: '2026-03-27 16:00' })
      ]
    });
    const r = metric(computeMetrics(twoProjects(), B), /^Missed Tasks/);
    expect(r.count).toContain('baseline project: RENAMED');
    expect(r.count).toContain('chosen on the same project ID');
    expect(r.count).toContain('2 of 2');
  });

  it('with nothing in common the baseline is not used: Missed Tasks not scored, durations read from the current file', () => {
    const B = xer({
      projects: [proj('7', 'OLD-Q', '2026-02-02 08:00'), proj('8', 'OLD-Z', '2026-02-20 08:00')],
      tasks: [
        task(70, 'Q1', { proj_id: '7', target_end_date: '2026-03-13 16:00', target_drtn_hr_cnt: '480' }),
        task(80, 'Z1', { proj_id: '8', target_end_date: '2026-03-13 16:00' })
      ]
    });
    const m = computeMetrics(twoProjects(), B);
    const r = metric(m, /^Missed Tasks/);
    expect(r.status).toBe(NOT_SCORED);
    expect(r.result).toContain('the baseline file holds 2 projects and none matches the scored project');
    const d = metric(m, /^High Duration/);
    expect(d.count).toContain('durations read from the current file');
    expect(d.den).toBe(2);
  });

  it('Resources is not scored when the scored project carries no assignments, whatever the other project carries', () => {
    const A = twoProjects();
    A.tables.TASKRSRC.records = A.tables.TASKRSRC.records.filter(r => r.task_id !== '21');
    const r = metric(computeMetrics(A), /^Resources/);
    expect(r.status).toBe(NOT_SCORED);
    expect(r.result).toContain('the scored project carries no resource assignments');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Calendar inheritance
// ─────────────────────────────────────────────────────────────────────────────
describe('3. an activity with a blank calendar is converted on the project calendar, else the default', () => {
  it('blank clndr_id on a 10 h/day project calendar: 400 h is 40 working days, not 50', () => {
    const A = xer({
      projects: [proj('1', 'SYN', '2026-04-01 08:00', 'C10')],
      calendars: [cal('C8', EIGHT, { default_flag: 'Y' }), cal('C10', TEN)],
      tasks: [task(1, 'A1', { clndr_id: '', target_drtn_hr_cnt: '400', remain_drtn_hr_cnt: '400' })]
    });
    const ctx = workingDayContext(A);
    const t = A.tables.TASK.records[0];
    expect(ctx.workingDays(t, HOUR_FIELDS.ORIGINAL_DURATION)).toBe(40);
    const d = ctx.disclose([t]);
    expect(d.inheritedProject).toBe(1);
    expect(d.inheritedDefault).toBe(0);
    expect(d.missing).toBe(0);
    expect(d.hoursPerDay).toEqual([10]);
    expect(d.note).toMatch(/1 activity names no calendar of its own/);
    // On the DCMA page: 40 wd is not over the 44 wd line.
    expect(metric(computeMetrics(A), /^High Duration/).count).toBe('0 of 1 incomplete activities');
  });

  it('no project calendar: the default calendar (default_flag Y) is used and recorded', () => {
    const A = xer({
      projects: [proj('1', 'SYN', '2026-04-01 08:00', '')],
      calendars: [cal('C8'), cal('C10', TEN, { default_flag: 'Y' })],
      tasks: [task(1, 'A1', { clndr_id: '', target_drtn_hr_cnt: '400' })]
    });
    const ctx = workingDayContext(A);
    const t = A.tables.TASK.records[0];
    expect(ctx.workingDays(t, HOUR_FIELDS.ORIGINAL_DURATION)).toBe(40);
    const d = ctx.disclose([t]);
    expect(d.inheritedDefault).toBe(1);
    expect(d.inheritedProject).toBe(0);
    expect(d.missing).toBe(0);
  });

  it('an activity naming a calendar that is not in the file is still missing, not inherited', () => {
    const A = xer({
      projects: [proj('1', 'SYN', '2026-04-01 08:00', 'C10')],
      calendars: [cal('C10', TEN)],
      tasks: [task(1, 'A1', { clndr_id: 'GONE', target_drtn_hr_cnt: '400' })]
    });
    const d = workingDayContext(A).disclose(A.tables.TASK.records);
    expect(d.missing).toBe(1);
    expect(d.inheritedProject).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Hard Constraints
// ─────────────────────────────────────────────────────────────────────────────
describe('4. Hard Constraints counts Start / Finish On or Before, primary or secondary', () => {
  function tenWith(extra) {
    const tasks = [];
    for (let i = 1; i <= 10; i++) tasks.push(task(i, `A${i}`, i === 5 ? extra : {}));
    return xer({ tasks, rels: chain(tasks) });
  }

  it('one CS_MEOB (Finish On or Before) of 10 incomplete reads 10.0%', () => {
    const r = metric(computeMetrics(tenWith({ cstr_type: 'CS_MEOB' })), /^Hard Constraints/);
    expect(r.result).toBe('10.0%');
    expect(r.count).toContain('1 of 10 incomplete activities');
    // 2026-11-07 DCMA phase 2: there is no middle band any more. 10.0% is over
    // the 5% line, so it FAILS (it used to read as an amber band). Never PASS.
    expect(r.status).toBe('FAIL');
    expect(r.name).toMatch(/On or Before/);
  });

  it('a Start On or Before held as the SECONDARY constraint is counted', () => {
    const r = metric(computeMetrics(tenWith({ cstr_type: 'CS_MSOA', cstr_type2: 'CS_MSOB' })), /^Hard Constraints/);
    expect(r.count).toContain('1 of 10 incomplete activities');
  });

  it('soft constraints alone are not counted', () => {
    const r = metric(computeMetrics(tenWith({ cstr_type: 'CS_MSOA', cstr_type2: 'CS_MEOA' })), /^Hard Constraints/);
    expect(r.count).toContain('0 of 10 incomplete activities');
    expect(r.status).toBe('PASS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Missed Tasks: unmatched and renumbered baselines
// ─────────────────────────────────────────────────────────────────────────────
describe('5. Missed Tasks counts deleted due work as missed, and refuses a renumbered baseline', () => {
  // Baseline: ten activities due by 03-13 (data date 04-01 on the current side).
  function baselineDue(codes) {
    return xer({
      projects: [proj('1', 'SYN', '2026-02-02 08:00')],
      tasks: codes.map((c, i) => task(100 + i, c, { target_end_date: '2026-03-13 16:00' }))
    });
  }
  function currentDone(codes) {
    return xer({
      tasks: codes.map((c, i) => task(200 + i, c, { ...DONE, act_start_date: '2026-03-09 08:00', act_end_date: '2026-03-13 16:00' }))
    });
  }
  const TEN_CODES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'];

  it('10 due, 1 deleted from the current file, 9 on time: 1 of 10 missed = 10.0% FAIL', () => {
    const r = metric(computeMetrics(currentDone(TEN_CODES.slice(0, 9)), baselineDue(TEN_CODES)), /^Missed Tasks/);
    expect(r.result).toBe('10.0%');
    expect(r.count).toContain('1 of 10');
    expect(r.count).toMatch(/1 .*not in the current file/);
    expect(r.status).toBe('FAIL');
  });

  it('5 due and none matches the current file: NOT SCORED, the baseline looks renumbered', () => {
    const r = metric(computeMetrics(currentDone(['N1', 'N2', 'N3', 'N4', 'N5']), baselineDue(['T1', 'T2', 'T3', 'T4', 'T5'])), /^Missed Tasks/);
    expect(r.status).toBe(NOT_SCORED);
    expect(r.result).toContain("the baseline's Activity IDs do not match the current file; it looks renumbered");
    expect(r.result).toContain('0 of 5');
  });

  it('an open activity whose baseline finish is later on the data date itself is not yet due', () => {
    // Current data date 2026-04-01 08:00 (the xer() default). T11's baseline finish is
    // 2026-04-01 16:00: by the day it is "on the data date", but it is not due until
    // 16:00, so it is neither due nor missed (2026-11-07, due decided to the minute).
    const B = baselineDue(TEN_CODES);
    B.tables.TASK.records.push({ ...B.tables.TASK.records[0], task_id: '199', task_code: 'T11', target_end_date: '2026-04-01 16:00' });
    const A = currentDone(TEN_CODES);
    A.tables.TASK.records.push({ ...A.tables.TASK.records[0], task_id: '299', task_code: 'T11', status_code: 'TK_NotStart', act_start_date: '', act_end_date: '' });
    const r = metric(computeMetrics(A, B), /^Missed Tasks/);
    expect(r.count).toContain('0 of 10');
    expect(r.status).toBe('PASS');
  });

  it('keeps the complete-with-no-actual-finish handling', () => {
    const A = currentDone(TEN_CODES);
    A.tables.TASK.records[0].act_end_date = '';
    const r = metric(computeMetrics(A, baselineDue(TEN_CODES)), /^Missed Tasks/);
    expect(r.count).toContain('0 of 9');
    expect(r.count).toMatch(/1 finished with no actual finish date/);
    expect(r.status).toBe('PASS');
  });
});
