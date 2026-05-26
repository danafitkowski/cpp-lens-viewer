import { h } from '../lib/dom.js';
import { getTable, getTableAliased, buildPredecessorMap } from '@criticalpathpartners/lens-parser';
import { dataTable } from './_shared/data-table.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);
const HARD_CONSTRAINTS = new Set(['CS_MSO', 'CS_MEO', 'CS_MANDSTART', 'CS_MANDFIN']);

const BADGE_COLORS = {
  PASS:   { bg: '#15803D', text: '#ffffff' },
  REVIEW: { bg: '#B45309', text: '#ffffff' },
  FAIL:   { bg: '#C8392F', text: '#ffffff' }
};

function pct(num, den) {
  if (den === 0) return 0;
  return (num / den) * 100;
}

function fmtPct(val) {
  return `${val.toFixed(1)}%`;
}

function computeMetrics(A) {
  const allTasks = getTable(A, 'TASK');
  const rels     = getTableAliased(A, 'REL');
  const rsrc     = getTable(A, 'TASKRSRC');
  const projects = getTable(A, 'PROJECT');
  const proj     = projects[0] || {};

  // Exclude TT_LOE / TT_WBS from activity-percentage denominators
  const tasks = allTasks.filter(t => !LOE_WBS.has(t.task_type));
  const n = tasks.length;
  const relsTotal = rels.length;

  const { predecessors, successors } = buildPredecessorMap(A);

  // 1. Logic — % with both pred AND succ
  const withBoth = tasks.filter(t =>
    (predecessors[t.task_id] && predecessors[t.task_id].length > 0) &&
    (successors[t.task_id]   && successors[t.task_id].length   > 0)
  ).length;
  const logicPct = pct(withBoth, n);
  const metric1 = {
    name:   'Logic (% with pred + succ)',
    result: fmtPct(logicPct),
    target: '≥ 95%',
    status: logicPct >= 95 ? 'PASS' : logicPct >= 90 ? 'REVIEW' : 'FAIL'
  };

  // 2. Leads — TASKPRED with lag < 0 (target = 0)
  const leadsCount = rels.filter(r => parseFloat(r.lag_hr_cnt) < 0).length;
  const metric2 = {
    name:   'Leads (negative lag)',
    result: String(leadsCount),
    target: '0',
    status: leadsCount === 0 ? 'PASS' : 'FAIL'
  };

  // 3. Lags — % of TASKPRED with lag > 0 (target ≤ 5%)
  const lagPositiveCount = rels.filter(r => parseFloat(r.lag_hr_cnt) > 0).length;
  const lagsPct = pct(lagPositiveCount, relsTotal);
  const metric3 = {
    name:   'Lags (% with lag > 0)',
    result: fmtPct(lagsPct),
    target: '≤ 5%',
    status: lagsPct <= 5 ? 'PASS' : lagsPct <= 10 ? 'REVIEW' : 'FAIL'
  };

  // 4. FS Relationships — % with pred_type = PR_FS (target ≥ 90%)
  const fsCount = rels.filter(r => r.pred_type === 'PR_FS').length;
  const fsPct   = pct(fsCount, relsTotal);
  const metric4 = {
    name:   'FS Relationships (% PR_FS)',
    result: fmtPct(fsPct),
    target: '≥ 90%',
    status: fsPct >= 90 ? 'PASS' : fsPct >= 80 ? 'REVIEW' : 'FAIL'
  };

  // 5. Hard Constraints — % with hard cstr_type (target ≤ 5%)
  const hardCount = tasks.filter(t => HARD_CONSTRAINTS.has(t.cstr_type)).length;
  const hardPct   = pct(hardCount, n);
  const metric5 = {
    name:   'Hard Constraints (% of tasks)',
    result: fmtPct(hardPct),
    target: '≤ 5%',
    status: hardPct <= 5 ? 'PASS' : hardPct <= 10 ? 'REVIEW' : 'FAIL'
  };

  // 6. High Float — % with total_float_hr_cnt > 44 * 8 = 352 (target ≤ 5%)
  const highFloatCount = tasks.filter(t => parseFloat(t.total_float_hr_cnt) > 352).length;
  const highFloatPct   = pct(highFloatCount, n);
  const metric6 = {
    name:   'High Float (> 44 wd)',
    result: fmtPct(highFloatPct),
    target: '≤ 5%',
    status: highFloatPct <= 5 ? 'PASS' : highFloatPct <= 10 ? 'REVIEW' : 'FAIL'
  };

  // 7. Negative Float — % with total_float_hr_cnt < 0 (target = 0)
  const negFloatCount = tasks.filter(t => parseFloat(t.total_float_hr_cnt) < 0).length;
  const negFloatPct   = pct(negFloatCount, n);
  const metric7 = {
    name:   'Negative Float',
    result: fmtPct(negFloatPct),
    target: '0%',
    status: negFloatCount === 0 ? 'PASS' : negFloatPct <= 5 ? 'REVIEW' : 'FAIL'
  };

  // 8. High Duration — % with target_drtn_hr_cnt > 44 * 8 = 352 (target ≤ 5%)
  const highDurCount = tasks.filter(t => parseFloat(t.target_drtn_hr_cnt) > 352).length;
  const highDurPct   = pct(highDurCount, n);
  const metric8 = {
    name:   'High Duration (> 44 wd)',
    result: fmtPct(highDurPct),
    target: '≤ 5%',
    status: highDurPct <= 5 ? 'PASS' : highDurPct <= 10 ? 'REVIEW' : 'FAIL'
  };

  // 9. Invalid Dates — complete with no act_end OR active with no act_start (target = 0)
  const invalidDatesCount = allTasks.filter(t =>
    (t.status_code === 'TK_Complete' && !t.act_end_date) ||
    (t.status_code === 'TK_Active'   && !t.act_start_date)
  ).length;
  const metric9 = {
    name:   'Invalid Dates',
    result: String(invalidDatesCount),
    target: '0',
    status: invalidDatesCount === 0 ? 'PASS' : 'FAIL'
  };

  // 10. Resources — % of tasks with at least one TASKRSRC assignment (target ≥ 80%)
  const taskIdsWithRsrc = new Set(rsrc.map(r => r.task_id));
  const rsrcCount = tasks.filter(t => taskIdsWithRsrc.has(t.task_id)).length;
  const rsrcPct   = pct(rsrcCount, n);
  const metric10 = {
    name:   'Resources (% assigned)',
    result: fmtPct(rsrcPct),
    target: '≥ 80%',
    status: rsrcPct >= 80 ? 'PASS' : rsrcPct >= 50 ? 'REVIEW' : 'FAIL'
  };

  // 11. Missed Tasks — past data date but TK_NotStart (target = 0)
  const dataDate = proj.last_recalc_date ? proj.last_recalc_date.slice(0, 10) : null;
  const missedCount = dataDate
    ? tasks.filter(t => {
        if (t.status_code !== 'TK_NotStart') return false;
        const end = (t.target_end_date || '').slice(0, 10);
        return end && end < dataDate;
      }).length
    : 0;
  const metric11 = {
    name:   'Missed Tasks (past data date)',
    result: String(missedCount),
    target: '0',
    status: missedCount === 0 ? 'PASS' : 'FAIL'
  };

  // 12. Critical Path Test — count with total_float_hr_cnt ≤ 0
  const criticalCount = tasks.filter(t => parseFloat(t.total_float_hr_cnt) <= 0).length;
  const metric12 = {
    name:   'Critical Path Test (CP activities)',
    result: String(criticalCount),
    target: '> 0',
    status: criticalCount > 0 ? 'PASS' : 'FAIL'
  };

  // 13 & 14 — placeholders
  const metric13 = { name: 'CPLI',  result: '—', target: '—', status: 'REVIEW' };
  const metric14 = { name: 'BEI',   result: '—', target: '—', status: 'REVIEW' };

  return [metric1, metric2, metric3, metric4, metric5, metric6, metric7,
          metric8, metric9, metric10, metric11, metric12, metric13, metric14];
}

function statusBadge(status) {
  const c = BADGE_COLORS[status] || BADGE_COLORS.REVIEW;
  return h('span', {
    class: 'lens-badge',
    style: {
      background:   c.bg,
      color:        c.text,
      padding:      '2px 8px',
      borderRadius: '99px',
      fontSize:     '11px',
      fontWeight:   '800',
      whiteSpace:   'nowrap'
    }
  }, status);
}

const COLUMNS = [
  { key: 'name',   label: 'Metric' },
  { key: 'result', label: 'Result' },
  { key: 'target', label: 'Target' },
  { key: 'status', label: 'Status', render: (v) => statusBadge(v) }
];

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'DCMA Lite'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const metrics = computeMetrics(A);
  const passCount   = metrics.filter(m => m.status === 'PASS').length;
  const reviewCount = metrics.filter(m => m.status === 'REVIEW').length;
  const failCount   = metrics.filter(m => m.status === 'FAIL').length;

  const table = dataTable({ columns: COLUMNS, rows: metrics });

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'DCMA Lite'),
    h('div', { class: 'lens-card' }, [
      h('p', {}, `14-point screening · ${passCount} PASS · ${reviewCount} REVIEW · ${failCount} FAIL`)
    ]),
    h('div', { class: 'lens-card' }, [table])
  ]);
}
