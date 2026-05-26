import { h } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { svgLineChart } from './_shared/svg-line-chart.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str.slice(0, 10) + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Build a sorted cumulative curve from a list of dates.
 * Returns [ { x: ms, y: cumCount }, ... ]
 */
function buildCumulativeCurve(dates) {
  if (dates.length === 0) return [];

  // Count by day (ms bucket)
  const counts = new Map();
  for (const d of dates) {
    const ms = d.getTime();
    counts.set(ms, (counts.get(ms) || 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  const points = [];
  let cumulative = 0;
  for (const [ms, cnt] of sorted) {
    cumulative += cnt;
    points.push({ x: ms, y: cumulative });
  }
  return points;
}

/**
 * Find cumulative count at or before a given date (ms).
 * curve is sorted ascending by x.
 */
function countAtDate(curve, targetMs) {
  let last = 0;
  for (const pt of curve) {
    if (pt.x <= targetMs) last = pt.y;
    else break;
  }
  return last;
}

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'EVM / S-Curves Lite'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const tasks    = getTable(A, 'TASK').filter(t => !LOE_WBS.has(t.task_type || ''));
  const projRows = getTable(A, 'PROJECT');
  const project  = projRows[0] || {};

  const dataDate    = project.last_recalc_date || null;
  const planEndDate = project.plan_end_date || null;

  const totalActivities = tasks.length;

  // --- Planned curve: cumulative count of activities by target_end_date ---
  const plannedDates = tasks
    .map(t => parseDate(t.target_end_date))
    .filter(Boolean);
  const plannedCurve = buildCumulativeCurve(plannedDates);

  // --- Actual curve: cumulative count by act_end_date (populated only) ---
  const actualDates = tasks
    .map(t => parseDate(t.act_end_date))
    .filter(Boolean);
  const actualCurve = buildCumulativeCurve(actualDates);

  // --- Forecast curve: from actual last point to (planEndDate, totalActivities) ---
  let forecastCurve = [];
  const planEndMs   = planEndDate ? parseDate(planEndDate) : null;
  if (planEndMs && actualCurve.length > 0) {
    const lastActual = actualCurve[actualCurve.length - 1];
    forecastCurve = [
      { x: lastActual.x, y: lastActual.y },
      { x: planEndMs.getTime(), y: totalActivities }
    ];
  } else if (planEndMs && plannedCurve.length > 0) {
    // If no actuals yet, forecast starts from origin
    const firstPlanned = plannedCurve[0];
    forecastCurve = [
      { x: firstPlanned.x, y: 0 },
      { x: planEndMs.getTime(), y: totalActivities }
    ];
  }

  // --- SPI proxy: actual / planned at data date ---
  let spiText = '—';
  if (dataDate) {
    const ddMs   = parseDate(dataDate);
    if (ddMs) {
      const plannedAtDD = countAtDate(plannedCurve, ddMs.getTime());
      const actualAtDD  = countAtDate(actualCurve,  ddMs.getTime());
      if (plannedAtDD > 0) {
        const spi = actualAtDD / plannedAtDD;
        spiText = spi.toFixed(2);
      }
    }
  }

  const spiTone = spiText === '—' ? 'ink' : (parseFloat(spiText) >= 1 ? 'green' : 'amber');

  // --- Actual finishes to date count ---
  const actualFinishCount = actualCurve.length > 0
    ? actualCurve[actualCurve.length - 1].y
    : 0;

  // --- Build series (omit empty) ---
  const series = [];
  if (plannedCurve.length > 0) {
    series.push({ label: 'Planned', color: '#0F5F99', points: plannedCurve });
  }
  if (actualCurve.length > 0) {
    series.push({ label: 'Actual', color: '#15803D', points: actualCurve });
  }
  if (forecastCurve.length > 0) {
    series.push({ label: 'Forecast', color: '#B45309', points: forecastCurve });
  }

  const kpiRow = h('div', { class: 'lens-kpi-grid' }, [
    kpiCard({ title: 'Total Activities',       big: totalActivities,          sub: 'excl. LOE / WBS' }),
    kpiCard({ title: 'Planned Finish',         big: planEndDate ? planEndDate.slice(0, 10) : '—', sub: 'plan_end_date' }),
    kpiCard({ title: 'Actual Finishes to Date', big: actualFinishCount,       sub: 'activities with act_end_date' }),
    kpiCard({ title: 'Data Date',              big: dataDate ? dataDate.slice(0, 10) : '—', sub: 'last_recalc_date' }),
    kpiCard({ title: 'SPI Proxy',              big: spiText,                  sub: 'actual / planned at data date', tone: spiTone })
  ]);

  const chartArea = series.length > 0
    ? svgLineChart({ series, width: 740, height: 300 })
    : h('div', { class: 'lens-empty' }, 'No data to chart — activities have no finish dates.');

  const chartCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'S-Curves: Planned / Actual / Forecast (cumulative activity completions)'),
    chartArea
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'EVM / S-Curves Lite'),
    kpiRow,
    chartCard
  ]);
}
