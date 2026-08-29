import { h, on } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { taskKey, resolveComparisonAmbiguity } from './_shared/identity.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);
const CAP = 200;

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str.slice(0, 10));
  return isNaN(+d) ? null : d;
}

// Cross-schedule match key — the shared rule lives in _shared/identity.js.
// This section already matched correctly on task_code; it now delegates so
// there is exactly one implementation to keep right.
const matchKey = taskKey;

export function buildActivities(A, B, criticalOnly, showBaseline) {
  const tasks = getTable(A, 'TASK');

  // Build B lookup if present, keyed on the stable task_code (see matchKey).
  //
  // An Activity ID repeated across projects in either file is AMBIGUOUS: two
  // different activities answer to one key, so any overlay drawn from it is a
  // guess about which one. This used to take the first row read and say
  // nothing, which is exactly the guess the rest of the Compare group was
  // rewritten to refuse. Ambiguous keys are skipped and counted instead, so a
  // bar either carries the right baseline or carries none.
  const ambiguity = (B && showBaseline)
    ? resolveComparisonAmbiguity(A, B)
    : { keys: new Set() };
  const ambiguousKeys = ambiguity.keys || new Set();

  const bMap = new Map();
  let baselineAmbiguous = 0;
  if (B && showBaseline) {
    for (const t of getTable(B, 'TASK')) {
      if (t.target_start_date && t.target_end_date) {
        const k = matchKey(t);
        if (k == null) continue;
        if (ambiguousKeys.has(k)) { baselineAmbiguous += 1; continue; }
        if (!bMap.has(k)) bMap.set(k, t);
      }
    }
  }

  const filtered = tasks.filter(t =>
    t.target_start_date &&
    t.target_end_date &&
    !LOE_WBS.has(t.task_type)
  );

  const activities = filtered.map(t => {
    const critical = parseFloat(t.total_float_hr_cnt) <= 0;
    const act = {
      task_id:   t.task_id,
      task_name: t.task_name,
      start:     parseDate(t.target_start_date),
      end:       parseDate(t.target_end_date),
      critical
    };
    const k = matchKey(t);
    if (k != null && ambiguousKeys.has(k)) act.baseline_ambiguous = true;
    const bRow = (k != null && !act.baseline_ambiguous) ? bMap.get(k) : undefined;
    if (bRow) {
      act.baseline_start = parseDate(bRow.target_start_date);
      act.baseline_end   = parseDate(bRow.target_end_date);
    }
    return act;
  });

  const sorted = activities.slice().sort((a, b) => +a.start - +b.start);
  // Counts travel with the list so render() can disclose them without
  // recomputing the match and risking a second, divergent answer.
  sorted.ambiguousOverlay = activities.filter(a => a.baseline_ambiguous).length;
  sorted.baselineAmbiguousRows = baselineAmbiguous;

  if (criticalOnly) {
    const crit = sorted.filter(a => a.critical);
    crit.ambiguousOverlay = sorted.ambiguousOverlay;
    crit.baselineAmbiguousRows = sorted.baselineAmbiguousRows;
    return crit;
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Timescale
//
// All date math is UTC. parseDate() above builds dates from a YYYY-MM-DD
// slice, which the Date constructor reads as UTC midnight, so every boundary
// computed here must use the getUTC*/Date.UTC family or a viewer in a
// non-UTC timezone gets ticks one day off the bars.
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Unit selection by calendar span:
//   up to ~3 months  -> weekly ticks (Mondays)
//   up to 3 years    -> month ticks
//   longer           -> quarter ticks
const WEEK_MAX_DAYS  = 90;
const MONTH_MAX_DAYS = 1095;

/**
 * Time domain for the chart: min start to max finish over current AND
 * baseline dates, the data date included, padded 3% (at least one day) each
 * side so the first and last bars do not touch the edges.
 *
 * @returns {{min: Date, max: Date}|null} null when nothing carries a date.
 */
export function computeTimeDomain(activities, dataDate) {
  const times = [];
  for (const a of activities || []) {
    for (const d of [a.start, a.end, a.baseline_start, a.baseline_end]) {
      if (d instanceof Date && !isNaN(+d)) times.push(+d);
    }
  }
  if (dataDate instanceof Date && !isNaN(+dataDate)) times.push(+dataDate);
  if (times.length === 0) return null;
  let min = Math.min(...times);
  let max = Math.max(...times);
  if (max === min) max = min + DAY_MS;
  const pad = Math.max((max - min) * 0.03, DAY_MS);
  return { min: new Date(min - pad), max: new Date(max + pad) };
}

/**
 * Tick positions and labels for a [minD, maxD] domain.
 *
 * Week ticks land on Mondays; month ticks on the first of each month
 * (correctly rolling Dec -> Jan across a year end); quarter ticks on
 * 1 Jan / 1 Apr / 1 Jul / 1 Oct. Every tick lies inside the domain.
 *
 * @returns {{unit: 'week'|'month'|'quarter', ticks: {date: Date, label: string}[]}}
 */
export function computeTicks(minD, maxD) {
  const spanDays = (+maxD - +minD) / DAY_MS;
  const unit = spanDays <= WEEK_MAX_DAYS ? 'week'
             : spanDays <= MONTH_MAX_DAYS ? 'month'
             : 'quarter';
  const ticks = [];

  if (unit === 'week') {
    // First Monday at or after minD. Stepping by exactly 7 days is safe
    // because the arithmetic is in UTC, which has no DST.
    let t = Date.UTC(minD.getUTCFullYear(), minD.getUTCMonth(), minD.getUTCDate());
    t += ((8 - new Date(t).getUTCDay()) % 7) * DAY_MS;
    if (t < +minD) t += 7 * DAY_MS;
    for (; t <= +maxD; t += 7 * DAY_MS) {
      const dt = new Date(t);
      ticks.push({ date: dt, label: `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}` });
    }
  } else {
    const step = unit === 'month' ? 1 : 3;
    // First boundary at or after minD. Date.UTC normalises month overflow,
    // so advancing past December lands on January of the next year.
    let y = minD.getUTCFullYear();
    let m = unit === 'quarter'
      ? Math.ceil(minD.getUTCMonth() / 3) * 3
      : minD.getUTCMonth();
    let t = Date.UTC(y, m, 1);
    while (t < +minD) { m += step; t = Date.UTC(y, m, 1); }
    while (t <= +maxD) {
      const dt = new Date(t);
      const yy = String(dt.getUTCFullYear()).slice(2);
      const label = unit === 'quarter'
        ? `Q${dt.getUTCMonth() / 3 + 1} ${yy}`
        : `${MONTHS[dt.getUTCMonth()]} ${yy}`;
      ticks.push({ date: dt, label });
      t = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + step, 1);
    }
  }

  return { unit, ticks };
}

// ---------------------------------------------------------------------------
// SVG rendering — same approach and tokens as the other _shared/svg-* charts.
// ---------------------------------------------------------------------------

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, children = []) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children) el.appendChild(c);
  return el;
}

function svgText(attrs, str) {
  const t = svg('text', attrs);
  t.appendChild(document.createTextNode(str));
  return t;
}

const ROW_H    = 24;
const NAME_W   = 220;
const HEADER_H = 36;   // timescale header row
const PAD_R    = 10;

const CRITICAL_COLOR = '#C8392F';
const NORMAL_COLOR   = '#0F5F99';
const BASELINE_COLOR = '#94A3B8';
const GRID_COLOR     = '#E2E8F0';
const LABEL_COLOR    = '#5A6675';
const NAVY           = '#0F2540';

const MIN_LABEL_PX = 42;  // narrower tick spacing labels every Nth tick

export function ganttSvg({ activities, dataDate = null, width = 980 }) {
  if (!activities || activities.length === 0) return h('div', { class: 'lens-empty' }, 'No activities to chart.');
  const rows = activities.filter(a => a.start && a.end);
  if (rows.length === 0) return h('div', { class: 'lens-empty' }, 'No activities have dates.');

  const domain = computeTimeDomain(rows, dataDate);
  const span = +domain.max - +domain.min;
  const timelineW = width - NAME_W - 20;
  const xs = (d) => NAME_W + 10 + timelineW * ((+d - +domain.min) / span);

  const totalH = HEADER_H + rows.length * ROW_H + 8;
  const root = svg('svg', { width, height: totalH, viewBox: `0 0 ${width} ${totalH}`, class: 'lens-gantt' });

  // --- Timescale header: gridlines through the rows, tick labels above ---
  const { ticks } = computeTicks(domain.min, domain.max);
  const spacingPx = ticks.length > 1
    ? (xs(ticks[1].date) - xs(ticks[0].date))
    : timelineW;
  const labelEvery = Math.max(1, Math.ceil(MIN_LABEL_PX / Math.max(spacingPx, 1)));

  ticks.forEach((tick, i) => {
    const x = xs(tick.date);
    root.appendChild(svg('line', {
      class: 'gantt-grid', x1: x, x2: x, y1: HEADER_H - 6, y2: totalH,
      stroke: GRID_COLOR, 'stroke-width': 1
    }));
    if (i % labelEvery === 0) {
      root.appendChild(svgText({
        class: 'gantt-tick-label', x: x + 3, y: HEADER_H - 10,
        'font-size': '10', fill: LABEL_COLOR
      }, tick.label));
    }
  });

  // Rule separating the header from the rows.
  root.appendChild(svg('line', {
    class: 'gantt-header-rule',
    x1: NAME_W + 10, x2: width - PAD_R, y1: HEADER_H, y2: HEADER_H,
    stroke: GRID_COLOR, 'stroke-width': 1
  }));

  // --- Rows: name, baseline ghost bar (behind), current bar ---
  rows.forEach((a, i) => {
    const y = HEADER_H + 2 + i * ROW_H;

    root.appendChild(svgText({
      x: 8, y: y + 14, 'font-size': '11', fill: NAVY
    }, String(a.task_name || a.task_id || '').slice(0, 32)));

    if (a.baseline_start && a.baseline_end) {
      const bx = xs(a.baseline_start);
      const bw = Math.max(xs(a.baseline_end) - bx, 2);
      root.appendChild(svg('rect', {
        class: 'gantt-baseline', x: bx, y: y + 16, width: bw, height: 4,
        fill: BASELINE_COLOR, rx: 1
      }));
    }

    const x = xs(a.start);
    const w = Math.max(xs(a.end) - x, 2);
    root.appendChild(svg('rect', {
      class: 'gantt-bar', x, y: y + 4, width: w, height: 12,
      fill: a.critical ? CRITICAL_COLOR : NORMAL_COLOR, rx: 2
    }));
  });

  // --- Data date reference line, drawn last so it sits above the bars ---
  if (dataDate instanceof Date && !isNaN(+dataDate)) {
    const dx = xs(dataDate);
    root.appendChild(svg('line', {
      class: 'gantt-datadate', x1: dx, x2: dx, y1: 4, y2: totalH,
      stroke: NAVY, 'stroke-width': 1.5, 'stroke-dasharray': '4 3'
    }));
    const dd = dataDate;
    const label = `Data date ${dd.getUTCDate()}-${MONTHS[dd.getUTCMonth()]}-${String(dd.getUTCFullYear()).slice(2)}`;
    const nearRightEdge = dx > width - 130;
    root.appendChild(svgText({
      class: 'gantt-datadate-label',
      x: nearRightEdge ? dx - 4 : dx + 4, y: 12,
      'text-anchor': nearRightEdge ? 'end' : 'start',
      'font-size': '9', fill: NAVY
    }, label));
  }

  return root;
}

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Gantt Chart'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  // Data date: first PROJECT row's last_recalc_date, same source as the
  // Dashboard and Distribution sections.
  const proj = getTable(A, 'PROJECT')[0];
  const dataDate = proj ? parseDate(proj.last_recalc_date) : null;

  let criticalOnly = false;
  let showBaseline = false;

  // State
  const ganttSlot = h('div');

  function rerender() {
    const allActs = buildActivities(A, B, false, showBaseline);
    const displayed = criticalOnly ? allActs.filter(a => a.critical) : allActs;
    const capped    = displayed.slice(0, CAP);
    const truncated = displayed.length > CAP;

    while (ganttSlot.firstChild) ganttSlot.removeChild(ganttSlot.firstChild);

    const svgEl = ganttSvg({ activities: capped, dataDate });
    ganttSlot.appendChild(svgEl);

    if (truncated) {
      const note = h('div', { class: 'lens-table-foot' },
        `Showing first ${CAP} of ${displayed.length} activities. Load a larger filter to see all.`
      );
      ganttSlot.appendChild(note);
    }

    // Say it on the chart, not in a console. A bar with no baseline because
    // its Activity ID is repeated looks identical to a bar with no baseline
    // because the activity is new.
    const ambig = allActs.ambiguousOverlay || 0;
    if (showBaseline && ambig > 0) {
      ganttSlot.appendChild(h('div', { class: 'lens-table-foot' },
        `${ambig} activit${ambig === 1 ? 'y carries' : 'ies carry'} an Activity ID `
        + `that is repeated across projects, so no baseline overlay is drawn for `
        + `${ambig === 1 ? 'it' : 'them'}: two different activities answer to that `
        + `ID and picking one would be a guess.`
      ));
    }

    // Update KPIs
    const critCount      = allActs.filter(a => a.critical).length;
    const baselineCount  = allActs.filter(a => a.baseline_start).length;

    while (kpiRow.firstChild) kpiRow.removeChild(kpiRow.firstChild);
    kpiRow.appendChild(kpiCard({ title: 'Activities Charted', big: displayed.length, sub: 'with dates, filtered' }));
    kpiRow.appendChild(kpiCard({ title: 'Critical',           big: critCount,         sub: 'float ≤ 0 hrs',         tone: critCount > 0 ? 'red' : 'green' }));
    if (B) {
      kpiRow.appendChild(kpiCard({ title: 'Baseline Matched', big: baselineCount, sub: 'activities in both XERs' }));
    }
  }

  // Checkboxes
  const chkCritical  = h('input', { type: 'checkbox', id: 'gantt-chk-critical' });
  const chkBaseline  = h('input', { type: 'checkbox', id: 'gantt-chk-baseline' });
  if (!B) chkBaseline.disabled = true;

  on(chkCritical, 'change', (e) => { criticalOnly = e.target.checked; rerender(); });
  on(chkBaseline, 'change', (e) => { showBaseline = e.target.checked; rerender(); });

  const toolbar = h('div', { class: 'lens-toolbar' }, [
    h('label', {}, [chkCritical, document.createTextNode(' Show critical only')]),
    h('label', {}, [chkBaseline, document.createTextNode(' Show baseline overlay' + (!B ? ' (load B to enable)' : ''))])
  ]);

  const kpiRow = h('div', { class: 'kpi-grid' });

  rerender();

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Gantt Chart'),
    toolbar,
    kpiRow,
    ganttSlot
  ]);
}
