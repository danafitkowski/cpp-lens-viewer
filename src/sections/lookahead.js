import { h } from '../lib/dom.js';
import { getTable, getCalendarMap, durationHoursToDays } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Mon Jan 15" format for week heading */
function fmtWeekHeading(d) {
  if (!d) return '';
  return `${_DAY_ABBR[d.getDay()]} ${_MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
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

function deriveRow(task, calMap) {
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

  const cal = calMap[task.clndr_id] || null;

  const odDays = durationHoursToDays(task.target_drtn_hr_cnt, cal);
  const rdDays = durationHoursToDays(task.remain_drtn_hr_cnt, cal);

  let tfHrs;
  try { tfHrs = parseFloat(task.total_float_hr_cnt || 0); }
  catch (_) { tfHrs = 0; }
  const tfDays = durationHoursToDays(tfHrs, cal);

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

function computeLookahead(A) {
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

  const calMap = getCalendarMap(A);
  const allTasks = getTable(A, 'TASK');

  // Derive and filter
  const rows = [];
  for (const task of allTasks) {
    const row = deriveRow(task, calMap);
    if (row) rows.push(row);
  }

  // Bucket by window (activity can appear in multiple windows)
  const weekRows = windows.map(win =>
    rows.filter(r => overlaps(r.startDate, r.finishDate, win.start, win.end))
  );

  return { dataDate, windows, weekRows, totalInLookahead: rows.length };
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

  const { dataDate, windows, weekRows, totalInLookahead } = computeLookahead(A);

  // KPI row
  const kpiRow = h('div', { class: 'kpi-grid' }, [
    kpiCard({ title: 'Data Date',          big: fmtShort(dataDate),                    sub: 'from PROJECT.last_recalc_date' }),
    kpiCard({ title: 'Total in Lookahead', big: totalInLookahead,                      sub: 'activities across all 3 weeks' }),
    kpiCard({ title: 'Week 1',             big: weekRows[0].length,                    sub: `${fmtShort(windows[0].start)} → ${fmtShort(windows[0].end)}` }),
    kpiCard({ title: 'Week 2',             big: weekRows[1].length,                    sub: `${fmtShort(windows[1].start)} → ${fmtShort(windows[1].end)}` }),
    kpiCard({ title: 'Week 3',             big: weekRows[2].length,                    sub: `${fmtShort(windows[2].start)} → ${fmtShort(windows[2].end)}` })
  ]);

  // Three week cards side by side
  const weekCards = windows.map((win, i) => {
    const rows = weekRows[i];
    const heading = `Week ${i + 1} — ${fmtWeekHeading(win.start)}`;
    const content = rows.length === 0
      ? h('p', { class: 'lens-section-stub' }, 'No activities in this window.')
      : dataTable({ columns: WEEK_COLS, rows, limit: ROW_LIMIT_PER_WEEK });

    return h('div', { class: 'lens-card', style: { flex: '1', minWidth: '320px' } }, [
      h('h3', {}, heading),
      content
    ]);
  });

  const weekRow = h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap' } }, weekCards);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, '3-Week Lookahead'),
    kpiRow,
    weekRow
  ]);
}
