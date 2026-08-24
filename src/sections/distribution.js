import { h } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { svgBarChart } from './_shared/svg-bar-chart.js';
import { workingDayContext, disclosureCards, HOUR_FIELDS } from './_shared/working-days.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);

function parseDate(str) {
  if (!str) return null;
  return new Date(str.slice(0, 10));
}

function toYYYYMM(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

// ---------------------------------------------------------------------------
// Histogram 1: Activity duration
// Buckets: 0-1d, 1-5d, 5-10d, 10-20d, 20-40d, 40+d
// ---------------------------------------------------------------------------
const DUR_BUCKETS = [
  { label: '0-1d',   min: 0,    max: 1 },
  { label: '1-5d',   min: 1,    max: 5 },
  { label: '5-10d',  min: 5,    max: 10 },
  { label: '10-20d', min: 10,   max: 20 },
  { label: '20-40d', min: 20,   max: 40 },
  { label: '40+d',   min: 40,   max: Infinity }
];

function durationBucket(days) {
  for (const b of DUR_BUCKETS) {
    if (days >= b.min && days < b.max) return b.label;
  }
  return '40+d';
}

function buildDurationHistogram(tasks, cal) {
  const counts = {};
  for (const b of DUR_BUCKETS) counts[b.label] = 0;

  for (const t of tasks) {
    if (LOE_WBS.has(t.task_type)) continue;
    // null (absent / unparsable duration) buckets as 0 days, as it always has.
    const days  = cal.workingDays(t, HOUR_FIELDS.ORIGINAL_DURATION) ?? 0;
    const label = durationBucket(days);
    counts[label]++;
  }

  return DUR_BUCKETS.map(b => ({ label: b.label, value: counts[b.label] }));
}

// ---------------------------------------------------------------------------
// Histogram 2: Total float
// Buckets: negative, zero, 1-5, 6-10, 11-20, 21-40, 41+, null
// ---------------------------------------------------------------------------
const FLOAT_BUCKETS = [
  { label: 'Neg',   test: (d) => d !== null && d < 0 },
  { label: '0',     test: (d) => d !== null && d === 0 },
  { label: '1-5',   test: (d) => d !== null && d > 0  && d <= 5 },
  { label: '6-10',  test: (d) => d !== null && d > 5  && d <= 10 },
  { label: '11-20', test: (d) => d !== null && d > 10 && d <= 20 },
  { label: '21-40', test: (d) => d !== null && d > 20 && d <= 40 },
  { label: '41+',   test: (d) => d !== null && d > 40 },
  { label: 'Null',  test: (d) => d === null }
];

function floatBucketLabel(days) {
  for (const b of FLOAT_BUCKETS) {
    if (b.test(days)) return b.label;
  }
  return 'Null';
}

function buildFloatHistogram(tasks, cal) {
  const counts = {};
  for (const b of FLOAT_BUCKETS) counts[b.label] = 0;

  for (const t of tasks) {
    if (LOE_WBS.has(t.task_type)) continue;
    const days  = cal.workingDays(t, HOUR_FIELDS.TOTAL_FLOAT);
    const label = floatBucketLabel(days);
    counts[label]++;
  }

  return FLOAT_BUCKETS.map(b => ({ label: b.label, value: counts[b.label] }));
}

// ---------------------------------------------------------------------------
// Histogram 3: Activities finishing per month
// Next 12 calendar months from data date forward, skip months with zero.
// ---------------------------------------------------------------------------
function buildMonthHistogram(tasks, dataDate) {
  // Count completions per YYYY-MM
  const monthCounts = {};
  for (const t of tasks) {
    if (LOE_WBS.has(t.task_type)) continue;
    const d = parseDate(t.target_end_date);
    if (!d) continue;
    const key = toYYYYMM(d);
    monthCounts[key] = (monthCounts[key] || 0) + 1;
  }

  // Generate next 12 months from data date
  const start = dataDate ? new Date(dataDate.slice(0, 10) + 'T00:00:00Z') : new Date();
  const result = [];
  for (let i = 0; i < 12; i++) {
    const d   = addMonths(start, i);
    const key = toYYYYMM(d);
    const cnt = monthCounts[key] || 0;
    // FX-026: push EVERY month (incl. zero-completion) so the equal-width bars
    // form a contiguous time axis. Skipping empty months made non-adjacent
    // months render side-by-side and misrepresent the intervals.
    result.push({ label: key, value: cnt });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Distribution'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const tasks  = getTable(A, 'TASK');
  // Hours become working days in exactly one module — see _shared/working-days.js.
  const cal    = workingDayContext(A);

  // Data date from PROJECT
  const projRows = getTable(A, 'PROJECT');
  const dataDate = (projRows[0] && projRows[0].last_recalc_date) || null;

  const durData   = buildDurationHistogram(tasks, cal);
  const floatData = buildFloatHistogram(tasks, cal);
  const monthData = buildMonthHistogram(tasks, dataDate);
  const disclosure = cal.disclose(tasks.filter(t => !LOE_WBS.has(t.task_type)));

  // KPI summary counts
  const totalFiltered = tasks.filter(t => !LOE_WBS.has(t.task_type)).length;
  const loeCount      = tasks.filter(t => LOE_WBS.has(t.task_type)).length;

  const kpiRow = h('div', { class: 'kpi-grid' }, [
    kpiCard({ title: 'Activities (excl. LOE/WBS)', big: totalFiltered, sub: 'included in histograms' }),
    kpiCard({ title: 'LOE / WBS excluded',         big: loeCount,      sub: 'TT_LOE + TT_WBS' }),
    kpiCard({ title: 'Data Date',                  big: dataDate ? dataDate.slice(0, 10) : '—', sub: 'from PROJECT' })
  ]);

  const card1 = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Activity duration (working days)'),
    svgBarChart({ data: durData })
  ]);

  const card2 = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Total float (working days)'),
    svgBarChart({ data: floatData, tone: '#C8392F' })
  ]);

  const card3 = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Activities finishing per month (next 12 months)'),
    monthData.every(m => m.value === 0)
      ? h('div', { class: 'lens-empty' }, 'No activities finish in the next 12 months from data date.')
      : svgBarChart({ data: monthData, tone: '#1a6b3c', width: 700 })
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Distribution'),
    kpiRow,
    card1,
    card2,
    card3,
    ...disclosureCards(disclosure)
  ]);
}
