// @vitest-environment happy-dom
//
// A register the screen truncates must still be obtainable in full.
//
// XER Comparison caps its field-change table at 500 rows and its other tables
// at 200; Period Reporting caps each bucket at 200. The cap is disclosed
// ("Showing 500 of 1525 rows" on the public demonstration pair, on screen and
// in print), but there was no way to get the other 1,025 rows: the Raw Tables
// export holds the input tables, not the calculated comparison. A printed
// exhibit could not substantiate its own totals.
//
// THE FIXTURE (synthetic): 300 activities in both files. Every one of them
// moved its planned finish AND changed its remaining duration, so:
//   field changes          300 activities x 2 fields = 600 rows (screen shows 500)
//   period register        300 matched activities, all slipped (screen shows 200)
// plus one activity only in the current file, one only in the baseline, and one
// whose name starts with "=" to prove the spreadsheet-formula guard applies.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render as renderComparison } from '../../src/sections/xer-comparison.js';
import { render as renderPeriod } from '../../src/sections/period-reporting.js';
import * as dl from '../../src/lib/download.js';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

const N = 300;
const pad = (i) => String(i).padStart(4, '0');

function task(task_id, task_code, extra = {}) {
  return {
    task_id: String(task_id),
    task_code,
    task_name: `Activity ${task_code}`,
    proj_id: '1',
    status_code: 'TK_NotStart',
    task_type: 'TT_Task',
    complete_pct_type: 'CP_Drtn',
    phys_complete_pct: '0',
    target_drtn_hr_cnt: '40',
    remain_drtn_hr_cnt: '40',
    target_start_date: '2026-03-02 08:00',
    target_end_date: '2026-03-06 17:00',
    ...extra
  };
}

function wrap(tasks, filename) {
  return {
    ermhdr: { raw: ['ERMHDR', '24.12', '2026-03-02', 'Project', 'u', 'User', 'db', 'Project Management', 'USD'] },
    filename,
    tables: {
      PROJECT: { fields: ['proj_id', 'proj_short_name', 'last_recalc_date'],
                 records: [{ proj_id: '1', proj_short_name: 'SYN', last_recalc_date: '2026-03-02 08:00' }] },
      TASK: { fields: Object.keys(task(1, 'X')), records: tasks },
      TASKPRED: { fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'], records: [] }
    }
  };
}

function baseline() {
  const tasks = [];
  for (let i = 1; i <= N; i++) tasks.push(task(1000 + i, `R${pad(i)}`));
  tasks[0].task_name = '=HYPERLINK("http://example.invalid","x")';
  tasks.push(task(9001, 'ONLY-BASE'));
  return wrap(tasks, 'synthetic-baseline.xer');
}

function current() {
  const A = reexport(baseline(), 500000);
  A.filename = 'synthetic-current.xer';
  A.tables.TASK.records = A.tables.TASK.records.filter(t => t.task_code !== 'ONLY-BASE');
  for (const t of A.tables.TASK.records) {
    t.target_end_date = '2026-03-13 17:00 this-tail-is-longer-than-sixteen-characters';
    t.remain_drtn_hr_cnt = '80';
  }
  A.tables.TASK.records.push(task(709001, 'ONLY-CURRENT'));
  return A;
}

/** Click the button whose text matches, and return what it handed to download(). */
function clickAndCapture(el, buttonRe) {
  const calls = [];
  const spy = vi.spyOn(dl, 'download').mockImplementation((text, filename, mime) => { calls.push({ text, filename, mime }); });
  try {
    const btn = [...el.querySelectorAll('button')].find(b => buttonRe.test(b.textContent));
    expect(btn, `no button matching ${buttonRe}`).toBeTruthy();
    btn.click();
  } finally { spy.mockRestore(); }
  expect(calls.length).toBe(1);
  return calls[0];
}

const lines = (csv) => csv.split('\r\n');

afterEach(() => { vi.restoreAllMocks(); });

describe('register CSV fixture', () => {
  it('is two separate exports of one schedule', () => {
    const overlap = assertDivergentSurrogates(current(), baseline(), { minSharedCodes: N });
    expect(overlap.sharedTaskIds).toBe(0);
    expect(overlap.sharedCodes).toBe(N);
  });
});

describe('XER Comparison: full register as CSV', () => {
  it('the screen still truncates at 500 and says so', () => {
    const el = renderComparison({ A: current(), B: baseline() });
    expect(el.textContent).toContain('Showing 500 of 600 rows.');
  });

  it('the field-change CSV holds all 600 rows, not the 500 on screen', () => {
    const el = renderComparison({ A: current(), B: baseline() });
    const got = clickAndCapture(el, /Download the full register: 600 field changes \(CSV\)/);
    expect(got.filename).toBe('xer-comparison-field-changes.csv');
    expect(got.mime).toBe('text/csv');
    const rows = lines(got.text);
    expect(rows[0]).toBe('Current file,Baseline file,Activity ID,Matched on,Name,Field,Before,After,Change (calendar days)');
    expect(rows.length).toBe(1 + 600);
  });

  it('the CSV carries the full value, where the screen cuts it to 16 characters', () => {
    const el = renderComparison({ A: current(), B: baseline() });
    const got = clickAndCapture(el, /field changes \(CSV\)/);
    expect(got.text).toContain('2026-03-13 17:00 this-tail-is-longer-than-sixteen-characters');
    // planned finish moved 03-06 -> 03-13 = +7 calendar days
    const finishRow = lines(got.text).find(l => l.includes(',R0002,') && l.includes(',target_end_date,'));
    expect(finishRow.endsWith(',7')).toBe(true);
    // and every row names the two files it compares
    expect(finishRow.startsWith('synthetic-current.xer,synthetic-baseline.xer,R0002,')).toBe(true);
  });

  it('neutralizes a spreadsheet formula in an activity name', () => {
    const el = renderComparison({ A: current(), B: baseline() });
    const got = clickAndCapture(el, /field changes \(CSV\)/);
    expect(got.text).toContain("'=HYPERLINK");
    expect(lines(got.text).some(l => /,=HYPERLINK/.test(l))).toBe(false);
  });

  it('added and deleted activities each get their own full CSV', () => {
    const el = renderComparison({ A: current(), B: baseline() });
    const added = clickAndCapture(el, /Download the full register: 1 added activity \(CSV\)/);
    expect(added.filename).toBe('xer-comparison-added-activities.csv');
    expect(lines(added.text)).toEqual([
      'Current file,Baseline file,Activity ID,Internal ID,Name',
      'synthetic-current.xer,synthetic-baseline.xer,ONLY-CURRENT,709001,Activity ONLY-CURRENT'
    ]);
    const deleted = clickAndCapture(el, /Download the full register: 1 deleted activity \(CSV\)/);
    expect(deleted.filename).toBe('xer-comparison-deleted-activities.csv');
    expect(lines(deleted.text)[1]).toBe('synthetic-current.xer,synthetic-baseline.xer,ONLY-BASE,9001,Activity ONLY-BASE');
  });

  it('offers no download for a register with no rows', () => {
    const el = renderComparison({ A: current(), B: baseline() });
    const labels = [...el.querySelectorAll('button')].map(b => b.textContent);
    expect(labels.some(t => /relationship changes \(CSV\)/.test(t))).toBe(false);
  });
});

describe('Period Reporting: full register as CSV', () => {
  it('the screen still truncates each bucket at 200 and says so', () => {
    const el = renderPeriod({ A: current(), B: baseline() });
    expect(el.textContent).toContain('Showing 200 of 300 rows.');
  });

  it('one CSV holds every matched activity with its bucket', () => {
    const el = renderPeriod({ A: current(), B: baseline() });
    const got = clickAndCapture(el, /Download the full period register: 300 activities \(CSV\)/);
    expect(got.filename).toBe('period-reporting-register.csv');
    expect(got.mime).toBe('text/csv');
    const rows = lines(got.text);
    expect(rows[0]).toBe('Current file,Baseline file,Bucket,Activity ID,Matched on,Name,Change in percent complete (points),Change in planned finish (calendar days)');
    expect(rows.length).toBe(1 + 300);
    // every activity slipped 7 calendar days with no change in percent complete
    const r2 = rows.find(l => l.includes(',R0002,'));
    expect(r2).toBe('synthetic-current.xer,synthetic-baseline.xer,Slipped,R0002,Activity ID,Activity R0002,0.0,7');
    expect(rows.slice(1).every(l => l.includes(',Slipped,'))).toBe(true);
  });
});
