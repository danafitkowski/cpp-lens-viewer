import { h } from '../lib/dom.js';
import { getTable, getTableAliased, buildPredecessorMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { workingDayContext, disclosureCards, HOUR_FIELDS } from './_shared/working-days.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);

/** Long-duration threshold, in WORKING DAYS. */
const LONG_DURATION_WD = 20;
/** Large-float threshold, in WORKING DAYS. */
const LARGE_FLOAT_WD = 40;

function computeMetrics(A) {
  const tasks = getTable(A, 'TASK');
  const rels  = getTableAliased(A, 'REL');
  // Hours become working days in exactly one module — see _shared/working-days.js.
  const cal = workingDayContext(A);
  const { predecessors, successors } = buildPredecessorMap(A);

  // Sort tasks by target_start_date to find first/last by date
  const dated = tasks
    .filter(t => t.target_start_date)
    .slice()
    .sort((a, b) => (a.target_start_date < b.target_start_date ? -1 : a.target_start_date > b.target_start_date ? 1 : 0));

  const firstTaskId = dated.length > 0 ? dated[0].task_id : null;
  const lastTaskId  = dated.length > 0 ? dated[dated.length - 1].task_id : null;

  // 1. Orphans — no predecessors AND no successors
  const orphans = tasks.filter(t => {
    return !(predecessors[t.task_id] && predecessors[t.task_id].length > 0) &&
           !(successors[t.task_id]   && successors[t.task_id].length > 0);
  }).length;

  // 2. Open starts — no predecessors, exclude TT_LOE/TT_WBS, exclude first activity by date
  const openStarts = tasks.filter(t => {
    if (LOE_WBS.has(t.task_type)) return false;
    if (t.task_id === firstTaskId) return false;
    return !(predecessors[t.task_id] && predecessors[t.task_id].length > 0);
  }).length;

  // 3. Open ends — no successors, exclude TT_LOE/TT_WBS, exclude last activity by date
  const openEnds = tasks.filter(t => {
    if (LOE_WBS.has(t.task_type)) return false;
    if (t.task_id === lastTaskId) return false;
    return !(successors[t.task_id] && successors[t.task_id].length > 0);
  }).length;

  // 4. Long duration — > 20 WORKING DAYS on the activity's own calendar.
  const longDuration = tasks.filter(t => {
    const wd = cal.workingDays(t, HOUR_FIELDS.ORIGINAL_DURATION);
    return wd != null && wd > LONG_DURATION_WD;
  }).length;

  // 5. Large float — > 40 WORKING DAYS on the activity's own calendar.
  const largeFloat = tasks.filter(t => {
    const wd = cal.workingDays(t, HOUR_FIELDS.TOTAL_FLOAT);
    return wd != null && wd > LARGE_FLOAT_WD;
  }).length;

  // Degeneracy disclosure. Both the missing-CALENDAR case AND the
  // CALENDAR-row-present-but-states-no-usable-day_hr_cnt case fall back to P6's
  // 8 hr/day default, and a guess that decides whether an activity clears a
  // "working days" threshold has to be visible on the face of the section.
  // Testing only whether the row is PRESENT reported clean on the worse of the
  // two; the shared module makes the call off the raw day_hr_cnt instead.
  const disclosure = cal.disclose(tasks);

  // 6. Negative lag — TASKPRED rows with lag_hr_cnt < 0
  const negativeLag = rels.filter(r => {
    const lag = parseFloat(r.lag_hr_cnt);
    return !isNaN(lag) && lag < 0;
  }).length;

  // 7. Started, no act_start — status TK_Active but act_start_date empty
  const startedNoActStart = tasks.filter(t => {
    return t.status_code === 'TK_Active' && !t.act_start_date;
  }).length;

  // 8. Complete, no act_end — status TK_Complete but act_end_date empty
  const completeNoActEnd = tasks.filter(t => {
    return t.status_code === 'TK_Complete' && !t.act_end_date;
  }).length;

  return {
    orphans, openStarts, openEnds, longDuration, largeFloat, negativeLag,
    startedNoActStart, completeNoActEnd, disclosure
  };
}

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Schedule Quality'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const m = computeMetrics(A);

  const cards = [
    kpiCard({ title: 'Orphan Activities',     big: m.orphans,            sub: 'no pred or succ',          tone: m.orphans            > 0 ? 'red'   : 'green' }),
    kpiCard({ title: 'Open Starts',           big: m.openStarts,         sub: 'no predecessors',          tone: m.openStarts         > 0 ? 'red'   : 'green' }),
    kpiCard({ title: 'Open Ends',             big: m.openEnds,           sub: 'no successors',            tone: m.openEnds           > 0 ? 'red'   : 'green' }),
    kpiCard({ title: 'Long Duration',         big: m.longDuration,       sub: `> ${LONG_DURATION_WD} working days (per activity calendar)`, tone: m.longDuration > 0 ? 'amber' : 'green' }),
    kpiCard({ title: 'Large Float',           big: m.largeFloat,         sub: `> ${LARGE_FLOAT_WD} working days float (per activity calendar)`, tone: m.largeFloat > 0 ? 'red' : 'green' }),
    kpiCard({ title: 'Negative Lag',          big: m.negativeLag,        sub: 'relationships with leads', tone: m.negativeLag        > 0 ? 'red'   : 'green' }),
    kpiCard({ title: 'Started / No Actual',   big: m.startedNoActStart,  sub: 'active, no act_start',     tone: m.startedNoActStart  > 0 ? 'red'   : 'green' }),
    kpiCard({ title: 'Complete / No Actual',  big: m.completeNoActEnd,   sub: 'complete, no act_end',     tone: m.completeNoActEnd   > 0 ? 'red'   : 'green' })
  ];

  const tasks = getTable(A, 'TASK');
  const rels  = getTableAliased(A, 'REL');

  // The divisor the two working-day thresholds were actually applied at, plus
  // the amber warning whenever any of it was a fallback rather than a number
  // read off the file. Both come from the shared module so every section says
  // the same thing the same way.
  const out = [
    h('h2', {}, 'Schedule Quality'),
    h('div', { class: 'lens-card' }, [
      h('p', {}, `${tasks.length.toLocaleString()} activities · ${rels.length.toLocaleString()} relationships`)
    ]),
    h('div', { class: 'kpi-grid' }, cards),
    ...disclosureCards(m.disclosure)
  ];

  return h('div', { class: 'lens-section-content' }, out);
}
