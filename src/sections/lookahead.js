import { h } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';
import { workingDayContext, disclosureCards, HOUR_FIELDS } from './_shared/working-days.js';

// ─────────────────────────────────────────────────────────────────────
// SPEC CONSTANTS — verbatim from canonical Python skill
// ─────────────────────────────────────────────────────────────────────

const EXCLUDED_TYPES  = new Set(['TT_LOE', 'TT_WBS']);
const MILESTONE_TYPES = new Set(['TT_Mile', 'TT_FinMile']);
const COMPLETE_STATUS = 'TK_Complete';
const IN_PROGRESS_STATUS = 'TK_Active';

const ROW_LIMIT_PER_WEEK = 100;

// ─────────────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────────────

const _MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const _DAY_ABBR   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseP6Date(raw) {
  // Whitespace-only must not be treated as real — strip first
  const s = (raw || '').trim();
  if (!s) return null;
  // Accept 'YYYY-MM-DD [HH:MM]'
  const d = new Date(s.slice(0, 10));
  return isNaN(d.getTime()) ? null : d;
}

function fmtShort(d) {
  if (!d) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** "Mon Jan 15" format for week heading */
function fmtWeekHeading(d) {
  if (!d) return '';
  return `${_DAY_ABBR[d.getUTCDay()]} ${_MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** Does [aStart, aFinish] overlap [winStart, winEnd] (inclusive)? */
function overlaps(aStart, aFinish, winStart, winEnd) {
  if (!aStart || !aFinish) return false;
  return aStart <= winEnd && aFinish >= winStart;
}

// ─────────────────────────────────────────────────────────────────────
// DERIVE ONE ROW
// ─────────────────────────────────────────────────────────────────────

function deriveRow(task, cal) {
  // Exclusions — verbatim from spec
  const taskType = task.task_type || '';
  if (EXCLUDED_TYPES.has(taskType)) return null;

  const statusCode = task.status_code || '';
  if (statusCode === COMPLETE_STATUS) return null;

  let pct;
  try { pct = parseFloat(task.phys_complete_pct || 0); }
  catch (_) { pct = 0; }
  if (pct >= 100) return null;

  // Date selection per spec:
  //   START: act_start_date if non-empty (stripped), else early_start_date
  //   FINISH: act_end_date if non-empty, else early_end_date
  const _d = (field) => (task[field] || '').trim();

  const startRaw  = _d('act_start_date')  || _d('early_start_date');
  const finishRaw = _d('act_end_date')    || _d('early_end_date');
  const startDate  = parseP6Date(startRaw);
  const finishDate = parseP6Date(finishRaw);

  // Hours become working days in exactly one module — see _shared/working-days.js.
  // ?? 0 keeps the spec's behaviour for an absent duration (0 days, not blank).
  const odDays = cal.workingDays(task, HOUR_FIELDS.ORIGINAL_DURATION)  ?? 0;
  const rdDays = cal.workingDays(task, HOUR_FIELDS.REMAINING_DURATION) ?? 0;

  let tfHrs;
  try { tfHrs = parseFloat(task.total_float_hr_cnt || 0); }
  catch (_) { tfHrs = 0; }
  const tfDays = cal.hoursToDays(tfHrs, task.clndr_id) ?? 0;

  // Milestone: task_type in MILESTONE_TYPES OR duration is 0/empty/null
  const rawDrtn = task.target_drtn_hr_cnt;
  const durationIsZero = (rawDrtn == null || rawDrtn === '' || rawDrtn === '0' || rawDrtn === '0.0');
  const isMilestone = MILESTONE_TYPES.has(taskType) || durationIsZero;

  const isCritical   = tfHrs <= 0;
  // Status from P6 status_code — locked from 2026-04-24 bug fix
  const isInProgress = (statusCode === IN_PROGRESS_STATUS);

  // Notes — all flags that apply, joined with ' • '
  const noteParts = [];
  if (isCritical)   noteParts.push('CRITICAL PATH');
  if (isMilestone)  noteParts.push('MILESTONE');
  if (isInProgress) noteParts.push(`${Math.round(pct)}% complete`);
  const notes = noteParts.join(' • ');

  const statusLabel = isInProgress ? 'IN PROGRESS' : 'NOT STARTED';

  return {
    task_id:   task.task_id   || '',
    task_code: task.task_code || '',
    task_name: task.task_name || '',
    start:      fmtShort(startDate),
    finish:     fmtShort(finishDate),
    startDate,
    finishDate,
    od:  String(odDays),
    rd:  String(rdDays),
    pct: `${Math.round(pct)}%`,
    tf:  String(tfDays),
    status: statusLabel,
    notes
  };
}

// ─────────────────────────────────────────────────────────────────────
// COMPUTE LOOKAHEAD ROWS
// ─────────────────────────────────────────────────────────────────────

/**
 * Build the three week buckets plus two SEPARATE totals.
 *
 * `activitiesInWindow` is the DISTINCT UNION of the three buckets — an activity
 * spanning weeks 1 and 2 sits in two buckets and must be counted once, so this
 * is neither the sum of the bucket lengths nor the whole incomplete population.
 * `totalIncomplete` is every eligible incomplete activity in the schedule,
 * most of which fall outside the 21-day horizon. The old KPI showed
 * totalIncomplete under the label "activities across all 3 weeks" (291 against
 * weeks of 14/19/28). Keep the two labelled apart.
 *
 * Exported for regression testing.
 *
 * @param {object} A - Parsed current model
 * @returns {{ dataDate: Date, windows: object[], weekRows: object[][],
 *             activitiesInWindow: number, totalIncomplete: number }}
 */
export function computeLookahead(A) {
  // Data date from first PROJECT row's last_recalc_date
  const projects = getTable(A, 'PROJECT');
  let dataDate = null;
  if (projects && projects.length > 0) {
    dataDate = parseP6Date(projects[0].last_recalc_date);
  }
  if (!dataDate) {
    // Fallback: today in UTC
    const now = new Date();
    dataDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  // Three week windows: [dataDate, +7d), [+7d, +14d), [+14d, +21d)
  // spec: window i starts at dataDate + 7*i days and ends before dataDate + 7*(i+1) days
  // overlap is inclusive: start <= winEnd AND finish >= winStart
  const windows = [0, 1, 2].map(i => ({
    start: addDays(dataDate, 7 * i),
    end:   addDays(dataDate, 7 * (i + 1) - 1)   // inclusive end = day before next window
  }));

  const cal = workingDayContext(A);
  const allTasks = getTable(A, 'TASK');

  // Derive and filter. `converted` is the set of activities whose OD / RD / TF
  // columns are printed as days, and therefore the exact scope the divisor
  // disclosure covers.
  const rows = [];
  const converted = [];
  for (const task of allTasks) {
    const row = deriveRow(task, cal);
    if (row) { rows.push(row); converted.push(task); }
  }

  // Bucket by window (activity can appear in multiple windows)
  const weekRows = windows.map(win =>
    rows.filter(r => overlaps(r.startDate, r.finishDate, win.start, win.end))
  );

  // Distinct union of the buckets. Each task derives exactly one row object, so
  // reference identity IS activity identity here — a row appearing in two
  // buckets is the same object and lands in the Set once.
  const inWindow = new Set();
  for (const bucket of weekRows) {
    for (const r of bucket) inWindow.add(r);
  }

  return {
    dataDate,
    windows,
    weekRows,
    activitiesInWindow: inWindow.size,
    totalIncomplete: rows.length,
    disclosure: cal.disclose(converted, [
      HOUR_FIELDS.ORIGINAL_DURATION,
      HOUR_FIELDS.REMAINING_DURATION,
      HOUR_FIELDS.TOTAL_FLOAT
    ])
  };
}

// ─────────────────────────────────────────────────────────────────────
// COLUMNS
// ─────────────────────────────────────────────────────────────────────

const WEEK_COLS = [
  { key: 'task_code', label: 'Code' },
  { key: 'task_name', label: 'Name' },
  { key: 'start',     label: 'Start' },
  { key: 'finish',    label: 'Finish' },
  { key: 'od',        label: 'OD' },
  { key: 'rd',        label: 'RD' },
  { key: 'pct',       label: '%Done' },
  { key: 'tf',        label: 'TF' },
  { key: 'status',    label: 'Status' },
  { key: 'notes',     label: 'Notes' }
];

// ─────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, '3-Week Lookahead'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const { dataDate, windows, weekRows, activitiesInWindow, totalIncomplete, disclosure } = computeLookahead(A);

  // KPI row
  const kpiRow = h('div', { class: 'kpi-grid' }, [
    kpiCard({ title: 'Data Date',          big: fmtShort(dataDate),                    sub: 'from PROJECT.last_recalc_date' }),
    kpiCard({ title: 'In 3-Week Window',   big: activitiesInWindow,                    sub: 'distinct activities in weeks 1-3 (spanning counted once)' }),
    kpiCard({ title: 'All Incomplete',     big: totalIncomplete,                       sub: 'eligible incomplete activities in the whole schedule' }),
    kpiCard({ title: 'Week 1',             big: weekRows[0].length,                    sub: `${fmtShort(windows[0].start)} → ${fmtShort(windows[0].end)}` }),
    kpiCard({ title: 'Week 2',             big: weekRows[1].length,                    sub: `${fmtShort(windows[1].start)} → ${fmtShort(windows[1].end)}` }),
    kpiCard({ title: 'Week 3',             big: weekRows[2].length,                    sub: `${fmtShort(windows[2].start)} → ${fmtShort(windows[2].end)}` })
  ]);

  // Three week cards side by side. The lens-week-card class carries the
  // sideways-scroll treatment in shell.css: each card is roughly a third of the
  // pane while the 10-column table needs far more, so without it the table's
  // right-most columns (Status / Notes) sat clipped behind an invisible
  // overflow edge. The CSS gives the table a legible minimum width, makes the
  // wrap scroll horizontally, and paints edge shadows as a visible cue that
  // there is more table to the side.
  const weekCards = windows.map((win, i) => {
    const rows = weekRows[i];
    const heading = `Week ${i + 1}: ${fmtWeekHeading(win.start)}`;
    const content = rows.length === 0
      ? h('p', { class: 'lens-section-stub' }, 'No activities in this window.')
      : dataTable({ columns: WEEK_COLS, rows, limit: ROW_LIMIT_PER_WEEK });

    return h('div', { class: 'lens-card lens-week-card', style: { flex: '1', minWidth: '320px' } }, [
      h('h3', {}, heading),
      content
    ]);
  });

  const weekRow = h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap' } }, weekCards);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, '3-Week Lookahead'),
    kpiRow,
    weekRow,
    // OD / RD / TF are printed as days. Name the divisor they were produced at.
    ...disclosureCards(disclosure)
  ]);
}
