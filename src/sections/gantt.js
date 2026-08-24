import { h, on } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { svgGantt } from './_shared/svg-gantt.js';
import { kpiCard } from './_shared/kpi-card.js';
import { taskKey, resolveComparisonAmbiguity } from './_shared/identity.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);
const CAP = 200;

function parseDate(str) {
  if (!str) return null;
  return new Date(str.slice(0, 10));
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
