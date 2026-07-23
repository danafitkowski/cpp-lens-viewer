import { h, on } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { svgGantt } from './_shared/svg-gantt.js';
import { kpiCard } from './_shared/kpi-card.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);
const CAP = 200;

function parseDate(str) {
  if (!str) return null;
  return new Date(str.slice(0, 10));
}

// Cross-schedule match key. P6 reassigns the internal surrogate task_id on
// every re-export, so two separate exports of the same schedule share the
// user-facing task_code (Activity ID) but NOT task_id. Match A<->B on task_code
// (trimmed, non-empty); fall back to task_id only when a row has no task_code.
// The 'code:'/'id:' prefixes keep a numeric task_code from colliding with a
// numeric task_id.
function matchKey(t) {
  const code = t.task_code == null ? '' : String(t.task_code).trim();
  if (code !== '') return 'code:' + code;
  const id = t.task_id == null ? '' : String(t.task_id).trim();
  return id !== '' ? 'id:' + id : null;
}

export function buildActivities(A, B, criticalOnly, showBaseline) {
  const tasks = getTable(A, 'TASK');

  // Build B lookup if present, keyed on the stable task_code (see matchKey).
  const bMap = new Map();
  if (B && showBaseline) {
    for (const t of getTable(B, 'TASK')) {
      if (t.target_start_date && t.target_end_date) {
        const k = matchKey(t);
        if (k != null && !bMap.has(k)) bMap.set(k, t);
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
    const bRow = bMap.get(matchKey(t));
    if (bRow) {
      act.baseline_start = parseDate(bRow.target_start_date);
      act.baseline_end   = parseDate(bRow.target_end_date);
    }
    return act;
  });

  const sorted = activities.slice().sort((a, b) => +a.start - +b.start);

  if (criticalOnly) return sorted.filter(a => a.critical);
  return sorted;
}

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Gantt Chart'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

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

    const svgEl = svgGantt({ activities: capped });
    ganttSlot.appendChild(svgEl);

    if (truncated) {
      const note = h('div', { class: 'lens-table-foot' },
        `Showing first ${CAP} of ${displayed.length} activities. Load a larger filter to see all.`
      );
      ganttSlot.appendChild(note);
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
