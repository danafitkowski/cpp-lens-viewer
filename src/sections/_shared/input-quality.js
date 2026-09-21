import { getTable } from '@criticalpathpartners/lens-parser';

/**
 * ONE place that asks whether the input file is statused past its own data date.
 *
 * A data date says "progress is recorded up to here". An actual start or
 * actual finish AFTER it is a statement about the future, and every figure
 * that counts finished work then counts work the file's own data date says has
 * not happened yet. Nothing in the viewer looked: on the public demonstration
 * file (data date 2025-07-01) 105 activities carry an actual date after the
 * data date, the latest on 2025-09-16, and the DCMA Lite view showed Invalid
 * Dates 0 PASS, EVM counted 113 "actual finishes to date" where 31 are on or
 * before the data date, and the dashboard said "Schedule status: healthy".
 *
 * Those were three symptoms of this one missing check, so it lives here and
 * every section that needs it asks here.
 *
 * DATES ARE COMPARED BY DAY, NOT BY THE MINUTE. XER dates carry a time of day
 * (08:00, 17:00) that depends on the calendar. An actual finish at 17:00 on
 * the data date, against a data date stamped 08:00 that same day, is ordinary
 * statusing and must not be reported as a future date. The full CPP Schedule
 * Health Report compares by day for the same reason, and the two must agree.
 */

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);

/** 'YYYY-MM-DD' from a raw XER date cell, or '' when the cell holds no date. */
export function dayOf(raw) {
  const s = raw == null ? '' : String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** The data date (first PROJECT row's last_recalc_date) as 'YYYY-MM-DD', or ''. */
export function dataDateOf(model) {
  return dayOf((getTable(model, 'PROJECT')[0] || {}).last_recalc_date);
}

/**
 * Which of one TASK row's actual dates fall after the data date.
 *
 * @param {object} task
 * @param {string} dataDate  'YYYY-MM-DD' from dataDateOf(); '' means unknown
 * @returns {{ start: boolean, finish: boolean, any: boolean }}
 */
export function actualsAfter(task, dataDate) {
  if (!task || !dataDate) return { start: false, finish: false, any: false };
  const s = dayOf(task.act_start_date);
  const f = dayOf(task.act_end_date);
  const start  = s !== '' && s > dataDate;
  const finish = f !== '' && f > dataDate;
  return { start, finish, any: start || finish };
}

/**
 * The file-level finding: how many activities carry an actual date after the
 * data date. Level of effort and WBS summary activities are left out, because
 * P6 derives their dates from other activities; milestones are counted.
 *
 * @param {object|null} model
 * @returns {{
 *   dataDate: string, population: number, activities: number,
 *   starts: number, finishes: number, latestActual: string
 * }}
 *   `activities` counts ACTIVITIES, not fields: one with both a future start
 *   and a future finish is one. `latestActual` is the latest actual date in
 *   the file, 'YYYY-MM-DD', or '' when there is none.
 */
export function actualsAfterDataDate(model) {
  const dataDate = dataDateOf(model);
  const out = { dataDate, population: 0, activities: 0, starts: 0, finishes: 0, latestActual: '' };
  for (const t of getTable(model, 'TASK')) {
    if (LOE_WBS.has(t.task_type || '')) continue;
    out.population++;
    for (const d of [dayOf(t.act_start_date), dayOf(t.act_end_date)]) {
      if (d > out.latestActual) out.latestActual = d;
    }
    const a = actualsAfter(t, dataDate);
    if (a.start) out.starts++;
    if (a.finish) out.finishes++;
    if (a.any) out.activities++;
  }
  return out;
}
