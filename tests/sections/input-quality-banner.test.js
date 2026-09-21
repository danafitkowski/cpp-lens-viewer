// @vitest-environment happy-dom
//
// One input-file finding, shown wherever it matters.
//
// Three defects on the public demonstration file had one root cause: nothing
// told the visitor that the file carries actual dates after its own data date.
// DCMA Lite read Invalid Dates 0 PASS, EVM counted 113 "actual finishes to
// date" where 31 is right, and the dashboard said the schedule was healthy.
// That file has a data date of 2025-07-01 and 105 activities with an actual
// date after it, the latest on 2025-09-16.
//
// THE FIXTURE (synthetic; data date 2026-03-02 08:00)
//
//   Q1  task, actual 02-02 to 02-06                      clean
//   Q2  task, actual START 03-03 and FINISH 03-05        after: ONE activity, two fields
//   Q3  task in progress, actual start 03-04             after
//   Q4  start milestone, actual 03-09                    after: milestones count
//   Q5  task, actual finish 03-02 17:00                  ON the data date: not after
//   L1  level of effort, actual start 03-20              left out (P6 derives its dates)
//   W1  WBS summary, actual finish 03-25                 left out
//
//   Activities checked 5. After the data date: Q2 Q3 Q4 = 3 activities
//   (3 actual starts, 2 actual finishes). Latest actual date 2026-03-09, which
//   is NOT 03-25, because the WBS summary row is outside the check.
import { describe, it, expect } from 'vitest';
import { actualsAfterDataDate, inputQualityCards } from '../../src/sections/_shared/input-quality.js';
import { render as renderDashboard } from '../../src/sections/dashboard.js';
import { render as renderSummary } from '../../src/sections/summary.js';
import { render as renderDcma } from '../../src/sections/dcma-lite.js';
import { render as renderEvm } from '../../src/sections/evm.js';
import { render as renderPeriod } from '../../src/sections/period-reporting.js';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

function task(task_id, task_code, extra = {}) {
  return {
    task_id: String(task_id),
    task_code,
    task_name: `Activity ${task_code}`,
    proj_id: '1',
    wbs_id: 'W1',
    clndr_id: 'C1',
    status_code: 'TK_Complete',
    task_type: 'TT_Task',
    complete_pct_type: 'CP_Drtn',
    phys_complete_pct: '0',
    target_drtn_hr_cnt: '40',
    remain_drtn_hr_cnt: '0',
    total_float_hr_cnt: '40',
    target_start_date: '2026-02-02 08:00',
    target_end_date: '2026-02-06 17:00',
    act_start_date: '',
    act_end_date: '',
    early_start_date: '',
    early_end_date: '',
    ...extra
  };
}

function dirty(dataDate = '2026-03-02 08:00') {
  const tasks = [
    task(1, 'Q1', { act_start_date: '2026-02-02 08:00', act_end_date: '2026-02-06 17:00' }),
    task(2, 'Q2', { act_start_date: '2026-03-03 08:00', act_end_date: '2026-03-05 17:00' }),
    task(3, 'Q3', { status_code: 'TK_Active', remain_drtn_hr_cnt: '24', act_start_date: '2026-03-04 08:00',
                    early_start_date: '2026-03-04 08:00', early_end_date: '2026-03-10 17:00' }),
    task(4, 'Q4', { task_type: 'TT_Mile', target_drtn_hr_cnt: '0', act_start_date: '2026-03-09 08:00', act_end_date: '2026-03-09 08:00' }),
    task(5, 'Q5', { act_start_date: '2026-02-23 08:00', act_end_date: '2026-03-02 17:00' }),
    task(6, 'L1', { task_type: 'TT_LOE', status_code: 'TK_Active', act_start_date: '2026-03-20 08:00' }),
    task(7, 'W1', { task_type: 'TT_WBS', act_start_date: '2026-02-02 08:00', act_end_date: '2026-03-25 17:00' })
  ];
  return {
    ermhdr: { raw: ['ERMHDR', '24.12', '2026-03-02', 'Project', 'u', 'User', 'db', 'Project Management', 'USD'] },
    filename: 'synthetic-update.xer',
    tables: {
      PROJECT: {
        fields: ['proj_id', 'proj_short_name', 'last_recalc_date', 'scd_end_date'],
        records: [{ proj_id: '1', proj_short_name: 'SYN', last_recalc_date: dataDate, scd_end_date: '2026-04-30 17:00' }]
      },
      PROJWBS: {
        fields: ['wbs_id', 'parent_wbs_id', 'wbs_name', 'proj_id'],
        records: [{ wbs_id: 'W1', parent_wbs_id: '', wbs_name: 'Synthetic', proj_id: '1' }]
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

/** The same file with a data date late enough that every actual date is on or before it. */
const clean = () => dirty('2026-03-31 08:00');

function banners(el) {
  return [...el.querySelectorAll('.lens-input-quality')];
}

describe('actualsAfterDataDate', () => {
  it('counts activities, not fields, and leaves level of effort and WBS summary out', () => {
    expect(actualsAfterDataDate(dirty())).toEqual({
      dataDate: '2026-03-02', population: 5, activities: 3, starts: 3, finishes: 2, latestActual: '2026-03-09'
    });
  });

  it('finds nothing on a file statused up to its data date', () => {
    const f = actualsAfterDataDate(clean());
    expect(f.activities).toBe(0);
    expect(f.latestActual).toBe('2026-03-09');
  });

  it('finds nothing, rather than everything, when the file states no data date', () => {
    expect(actualsAfterDataDate(dirty('')).activities).toBe(0);
  });
});

describe('inputQualityCards', () => {
  it('is empty for a clean file', () => {
    expect(inputQualityCards(clean())).toEqual([]);
  });

  it('states the count of activities, the latest actual date and the data date, as a finding about the file', () => {
    const cards = inputQualityCards(dirty());
    expect(cards.length).toBe(1);
    const text = cards[0].textContent;
    expect(text).toMatch(/^Input file finding/);
    expect(text).toContain('synthetic-update.xer');
    expect(text).toContain('3 of 5 activities');
    expect(text).toContain('data date, 2026-03-02');
    expect(text).toContain('3 actual starts and 2 actual finishes');
    expect(text).toContain('latest actual date in the file is 2026-03-09');
    expect(text).not.toContain('—');
  });

  it('uses the singular for one activity', () => {
    const A = dirty();
    A.tables.TASK.records = A.tables.TASK.records.filter(t => ['Q1', 'Q3'].includes(t.task_code));
    const text = inputQualityCards(A)[0].textContent;
    expect(text).toContain('1 of 2 activities');
    expect(text).toContain('1 actual start and 0 actual finishes');
  });
});

describe('the finding is shown at the top of the sections it affects', () => {
  const SECTIONS = [
    ['Executive Dashboard', renderDashboard],
    ['Executive Summary', renderSummary],
    ['DCMA Lite', renderDcma],
    ['EVM / S-Curves Lite', renderEvm]
  ];

  for (const [name, render] of SECTIONS) {
    it(`${name}: one banner, directly under the heading, on a file statused past its data date`, () => {
      const el = render({ A: dirty(), B: null });
      const found = banners(el);
      expect(found.length).toBe(1);
      expect(found[0].textContent).toContain('3 of 5 activities');
      // directly under the section heading, above every figure
      expect(el.querySelector('h2').nextElementSibling).toBe(found[0]);
    });

    it(`${name}: no banner on a clean file`, () => {
      expect(banners(render({ A: clean(), B: null })).length).toBe(0);
    });
  }

  it('every section shows the same words for the same file', () => {
    const texts = SECTIONS.map(([, render]) => banners(render({ A: dirty(), B: null }))[0].textContent);
    expect(new Set(texts).size).toBe(1);
  });
});

describe('Period Reporting checks both files', () => {
  /** An earlier export of the same schedule, data date 2026-02-02, nothing statused. */
  function cleanBaseline() {
    const B = reexport(dirty('2026-02-02 08:00'));
    B.filename = 'synthetic-baseline.xer';
    for (const t of B.tables.TASK.records) {
      Object.assign(t, { status_code: 'TK_NotStart', act_start_date: '', act_end_date: '', remain_drtn_hr_cnt: t.target_drtn_hr_cnt });
    }
    return B;
  }

  it('fixture sanity: the pair is two separate exports of one schedule', () => {
    const overlap = assertDivergentSurrogates(dirty(), cleanBaseline(), { minSharedCodes: 7 });
    expect(overlap.sharedTaskIds).toBe(0);
  });

  it('names the current file when only it is statused past its data date', () => {
    const found = banners(renderPeriod({ A: dirty(), B: cleanBaseline() }));
    expect(found.length).toBe(1);
    expect(found[0].textContent).toContain('the current file (synthetic-update.xer)');
    expect(found[0].textContent).toContain('3 of 5 activities');
  });

  it('shows one banner per file when both are statused past their data dates', () => {
    // The baseline keeps the current file's actual dates against a data date of
    // 2026-02-02: Q1 finishes 02-06, and Q2 to Q5 are all later, so 5 of 5.
    const B = reexport(dirty('2026-02-02 08:00'));
    B.filename = 'synthetic-baseline.xer';
    const found = banners(renderPeriod({ A: dirty(), B }));
    expect(found.length).toBe(2);
    expect(found[1].textContent).toContain('the baseline file (synthetic-baseline.xer)');
    expect(found[1].textContent).toContain('5 of 5 activities');
    expect(found[1].textContent).toContain('data date, 2026-02-02');
  });

  it('shows none when both files are clean', () => {
    expect(banners(renderPeriod({ A: clean(), B: cleanBaseline() })).length).toBe(0);
  });
});
