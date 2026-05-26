import { h } from '../lib/dom.js';
import { getTable, getTableAliased, buildPredecessorMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);

function computeMetrics(A) {
  const tasks = getTable(A, 'TASK');
  const rels  = getTableAliased(A, 'REL');
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

  // 4. Long duration — target_drtn_hr_cnt > 20 * 8 = 160
  const longDuration = tasks.filter(t => {
    const d = parseFloat(t.target_drtn_hr_cnt);
    return !isNaN(d) && d > 160;
  }).length;

  // 5. Large float — total_float_hr_cnt > 320 (40 days)
  const largeFloat = tasks.filter(t => {
    const f = parseFloat(t.total_float_hr_cnt);
    return !isNaN(f) && f > 320;
  }).length;

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

  return { orphans, openStarts, openEnds, longDuration, largeFloat, negativeLag, startedNoActStart, completeNoActEnd };
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
    kpiCard({ title: 'Long Duration',         big: m.longDuration,       sub: '> 20 working days',        tone: m.longDuration       > 0 ? 'amber' : 'green' }),
    kpiCard({ title: 'Large Float',           big: m.largeFloat,         sub: '> 40 days float',          tone: m.largeFloat         > 0 ? 'red'   : 'green' }),
    kpiCard({ title: 'Negative Lag',          big: m.negativeLag,        sub: 'relationships with leads', tone: m.negativeLag        > 0 ? 'red'   : 'green' }),
    kpiCard({ title: 'Started / No Actual',   big: m.startedNoActStart,  sub: 'active, no act_start',     tone: m.startedNoActStart  > 0 ? 'red'   : 'green' }),
    kpiCard({ title: 'Complete / No Actual',  big: m.completeNoActEnd,   sub: 'complete, no act_end',     tone: m.completeNoActEnd   > 0 ? 'red'   : 'green' })
  ];

  const tasks = getTable(A, 'TASK');
  const rels  = getTableAliased(A, 'REL');

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Schedule Quality'),
    h('div', { class: 'lens-card' }, [
      h('p', {}, `${tasks.length.toLocaleString()} activities · ${rels.length.toLocaleString()} relationships`)
    ]),
    h('div', { class: 'lens-kpi-grid' }, cards)
  ]);
}
