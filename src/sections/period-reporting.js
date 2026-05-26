import { h } from '../lib/dom.js';
import { getTable, getFirstField } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

/**
 * Compute A − B in calendar days for two date strings.
 * Returns 0 when either value cannot be parsed.
 * + = slipped (A is later), − = accelerated (A is earlier).
 *
 * @param {string} after  - Date string from model A
 * @param {string} before - Date string from model B
 * @returns {number}
 */
function calDayDelta(after, before) {
  if (!after || !before) return 0;
  const da = new Date(String(after).slice(0, 10));
  const db = new Date(String(before).slice(0, 10));
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Build a Map from task_id → task row.
 *
 * @param {object|null} model
 * @returns {Map<string, object>}
 */
function indexTasks(model) {
  const idx = new Map();
  for (const t of getTable(model, 'TASK')) {
    const id = getFirstField(t, ['task_id', 'task_code']);
    if (id) idx.set(String(id), t);
  }
  return idx;
}

/**
 * Get the first PROJECT record's last_recalc_date string, or ''.
 *
 * @param {object|null} model
 * @returns {string}
 */
function getDataDate(model) {
  const recs = getTable(model, 'PROJECT');
  return recs[0]?.last_recalc_date || '';
}

/**
 * Period Reporting — progress-over-period analysis.
 *
 * Compares B (period start / baseline) to A (current) for each activity
 * present in both schedules, buckets activities by status-code change and
 * date-slip direction, and renders KPI cards + per-bucket tables.
 *
 * @param {{ A: object|null, B: object|null }} props
 * @returns {HTMLElement}
 */
export function render({ A, B }) {
  if (!A || !B) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Period Reporting'),
      h('div', { class: 'lens-card' }, [
        h('p', {}, 'Load two XERs — Period Reporting compares progress between baseline and current.')
      ])
    ]);
  }

  const aTasks = indexTasks(A);
  const bTasks = indexTasks(B);

  const completedThisPeriod = [];
  const startedThisPeriod   = [];
  const slipped              = [];
  const accelerated          = [];
  const unchanged            = [];

  let earnedWeightedSum  = 0;
  let earnedWeightTotal  = 0;
  let totalSlipDays      = 0;

  for (const [id, aTask] of aTasks) {
    const bTask = bTasks.get(id);
    if (!bTask) continue;

    const aStatus = aTask.status_code || '';
    const bStatus = bTask.status_code || '';

    const aPct = parseFloat(aTask.phys_complete_pct);
    const bPct = parseFloat(bTask.phys_complete_pct);
    const pctDelta = (isNaN(aPct) ? 0 : aPct) - (isNaN(bPct) ? 0 : bPct);

    const dateDelta = calDayDelta(aTask.target_end_date, bTask.target_end_date);

    // Weighted earned-value accumulation
    const weight = parseFloat(aTask.target_drtn_hr_cnt);
    if (!isNaN(weight) && weight > 0) {
      earnedWeightedSum += pctDelta * weight;
      earnedWeightTotal += weight;
    }

    if (dateDelta > 0) totalSlipDays += dateDelta;

    const row = {
      task_id:   id,
      task_name: aTask.task_name || '',
      pctDelta,
      dateDelta
    };

    // Bucket assignment (in priority order)
    if (bStatus !== 'TK_Complete' && aStatus === 'TK_Complete') {
      completedThisPeriod.push(row);
    } else if (bStatus === 'TK_NotStart' && aStatus === 'TK_Active') {
      startedThisPeriod.push(row);
    } else if (dateDelta > 0) {
      slipped.push(row);
    } else if (dateDelta < 0) {
      accelerated.push(row);
    } else if (pctDelta === 0 && dateDelta === 0 && aStatus === bStatus) {
      unchanged.push(row);
    }
  }

  const earnedPct = earnedWeightTotal > 0
    ? (earnedWeightedSum / earnedWeightTotal)
    : 0;

  const aDataDate = getDataDate(A);
  const bDataDate = getDataDate(B);

  let dataDateSpan = 0;
  if (aDataDate && bDataDate) {
    const da = new Date(String(aDataDate).slice(0, 10));
    const db = new Date(String(bDataDate).slice(0, 10));
    if (!isNaN(da.getTime()) && !isNaN(db.getTime())) {
      dataDateSpan = Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  /** @param {number} v */
  function fmtPct(v) {
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }

  /** @param {number} v */
  function fmtDays(v) {
    return (v > 0 ? '+' : '') + v;
  }

  const TABLE_COLS = [
    { key: 'task_id',   label: 'ID' },
    { key: 'task_name', label: 'Name' },
    {
      key: 'pctDelta',
      label: 'Δ % Complete',
      render: v => fmtPct(Number(v))
    },
    {
      key: 'dateDelta',
      label: 'Δ Finish (cal days)',
      render: v => fmtDays(Number(v))
    }
  ];

  const elements = [
    h('h2', {}, 'Period Reporting'),

    // KPI row
    h('div', { class: 'kpi-grid' }, [
      kpiCard({
        title: 'Period span',
        big:   dataDateSpan + ' days',
        sub:   bDataDate ? bDataDate.slice(0, 10) + ' → ' + (aDataDate ? aDataDate.slice(0, 10) : '?') : 'No data dates'
      }),
      kpiCard({
        title: 'Earned this period',
        big:   (earnedPct >= 0 ? '+' : '') + earnedPct.toFixed(1) + '%',
        tone:  earnedPct > 0 ? 'green' : earnedPct < 0 ? 'red' : 'ink'
      }),
      kpiCard({
        title: 'Slipped activities',
        big:   slipped.length.toLocaleString(),
        tone:  slipped.length > 0 ? 'red' : 'ink'
      }),
      kpiCard({
        title: 'Accelerated activities',
        big:   accelerated.length.toLocaleString(),
        tone:  accelerated.length > 0 ? 'green' : 'ink'
      }),
      kpiCard({
        title: 'Completed this period',
        big:   completedThisPeriod.length.toLocaleString(),
        tone:  completedThisPeriod.length > 0 ? 'green' : 'ink'
      })
    ]),

    // Status-bucket summary card
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Activity status buckets'),
      h('ul', {}, [
        h('li', {}, 'Completed this period: ' + completedThisPeriod.length),
        h('li', {}, 'Started this period: '   + startedThisPeriod.length),
        h('li', {}, 'Slipped: '               + slipped.length),
        h('li', {}, 'Accelerated: '           + accelerated.length),
        h('li', {}, 'Unchanged: '             + unchanged.length)
      ])
    ]),

    // Per-bucket tables
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Completed this period'),
      dataTable({ columns: TABLE_COLS, rows: completedThisPeriod, limit: 200, emptyMsg: 'No activities completed this period.' })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Started this period'),
      dataTable({ columns: TABLE_COLS, rows: startedThisPeriod, limit: 200, emptyMsg: 'No activities started this period.' })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Slipped activities'),
      dataTable({ columns: TABLE_COLS, rows: slipped, limit: 200, emptyMsg: 'No slipped activities.' })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Accelerated activities'),
      dataTable({ columns: TABLE_COLS, rows: accelerated, limit: 200, emptyMsg: 'No accelerated activities.' })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Unchanged activities'),
      dataTable({ columns: TABLE_COLS, rows: unchanged, limit: 200, emptyMsg: 'No unchanged activities.' })
    ])
  ];

  return h('div', { class: 'lens-section-content' }, elements);
}
