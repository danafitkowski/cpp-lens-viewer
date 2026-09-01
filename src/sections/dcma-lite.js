import { h } from '../lib/dom.js';
import { getTable, getTableAliased, buildPredecessorMap } from '@criticalpathpartners/lens-parser';
import { dataTable } from './_shared/data-table.js';
import { workingDayContext, disclosureCards, HOUR_FIELDS } from './_shared/working-days.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);
const HARD_CONSTRAINTS = new Set(['CS_MSO', 'CS_MEO', 'CS_MANDSTART', 'CS_MANDFIN']);

/** DCMA-14 High Float / High Duration threshold, in WORKING DAYS. */
const HIGH_FLOAT_WD    = 44;
const HIGH_DURATION_WD = 44;

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
  // Hours become working days in exactly one module — see _shared/working-days.js.
  const cal      = workingDayContext(A);

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

  // 6. High Float — > 44 WORKING DAYS on the activity's own calendar (target ≤ 5%).
  // Not "> 352 hr": 352 is 44 days only where a day is 8 hours. On the 10 hr/day
  // calendars this viewer is handed all the time it is 35.2 days, and the card
  // still said "44 wd".
  const highFloatCount = tasks.filter(t => {
    const wd = cal.workingDays(t, HOUR_FIELDS.TOTAL_FLOAT);
    return wd != null && wd > HIGH_FLOAT_WD;
  }).length;
  const highFloatPct   = pct(highFloatCount, n);
  const metric6 = {
    name:   `High Float (> ${HIGH_FLOAT_WD} wd)`,
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

  // 8. High Duration — > 44 WORKING DAYS on the activity's own calendar (target ≤ 5%).
  const highDurCount = tasks.filter(t => {
    const wd = cal.workingDays(t, HOUR_FIELDS.ORIGINAL_DURATION);
    return wd != null && wd > HIGH_DURATION_WD;
  }).length;
  const highDurPct   = pct(highDurCount, n);
  const metric8 = {
    name:   `High Duration (> ${HIGH_DURATION_WD} wd)`,
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

  // 10. Resources — % of tasks with at least one TASKRSRC assignment.
  // DCMA-EA PAM 200.1 §4.10 verifies that ALL tasks with duration above zero
  // carry dollars or hours: the target is 100%, not a band. This surface
  // published "≥ 80%" until 2026-08-28 — a threshold the standard never
  // contained, and one the earlier 90%→100% correction could not find because
  // it searched for the 90% variant. A schedule with a fifth of its
  // activities unresourced was stamped PASS here. When the export carries no
  // TASKRSRC table at all the criterion is N/A, matching the dashboard's
  // "Not scored" behaviour, rather than a fake FAIL.
  const taskIdsWithRsrc = new Set(rsrc.map(r => r.task_id));
  const rsrcCount = tasks.filter(t => taskIdsWithRsrc.has(t.task_id)).length;
  const rsrcPct   = pct(rsrcCount, n);
  const metric10 = rsrc.length === 0 ? {
    name:   'Resources (% assigned)',
    result: 'N/A',
    target: '100%',
    status: 'N/A'
  } : {
    name:   'Resources (% assigned)',
    result: fmtPct(rsrcPct),
    target: '100%',
    status: rsrcPct >= 100 ? 'PASS' : 'FAIL'
  };

  // 11. Missed Tasks. DCMA-EA PAM 200.1 §4.11 is a FINISH test with a 5%
  // ceiling: a task counts when its planned finish is on or before the data
  // date and it has not actually finished by then — including tasks that
  // STARTED and stalled, and completed tasks that finished late are outside
  // this screening (no baseline fields in a single XER). Until 2026-08-28
  // this was gated on TK_NotStart with a zero target, so an in-progress
  // activity sitting past its planned finish was invisible, and a single
  // missed task stamped the schedule FAIL against a target the standard
  // does not set.
  const dataDate = proj.last_recalc_date ? proj.last_recalc_date.slice(0, 10) : null;
  const missedCount = dataDate
    ? tasks.filter(t => {
        if (t.status_code === 'TK_Complete') return false;
        const end = (t.target_end_date || '').slice(0, 10);
        return end && end < dataDate;
      }).length
    : 0;
  const missedPct = pct(missedCount, n);
  const metric11 = {
    name:   'Missed Tasks (past planned finish)',
    result: dataDate ? `${fmtPct(missedPct)} (${missedCount})` : 'N/A',
    target: '≤ 5%',
    status: !dataDate ? 'N/A' : missedPct <= 5 ? 'PASS' : 'FAIL'
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

  // Metrics 6 and 8 are working-day thresholds, so the divisor they were applied
  // at — and any activity whose divisor was a fallback rather than a number read
  // off the file — travels with them to the page.
  const disclosure = cal.disclose(tasks);

  return {
    metrics: [metric1, metric2, metric3, metric4, metric5, metric6, metric7,
              metric8, metric9, metric10, metric11, metric12, metric13, metric14],
    disclosure
  };
}

/**
 * "Lite" means lite — this view intentionally does not synthesize a CPP Quality
 * Overlay A-F grade. That grade is a real, published feature of the standalone
 * Schedule Health Report tool (also free, also no-login), which uses its own
 * scoring engine plus an AI executive summary and baseline-vs-current diffing
 * this view doesn't have. Computing a second, differently-derived grade here
 * would risk two different "CPP Quality Overlay" scores for the same schedule
 * on two different pages — a real problem for a brand built on reproducibility.
 * Point to the real thing instead of faking a lite version of it.
 */
function qualityOverlayCard() {
  return h('div', { class: 'lens-card quality-overlay' }, [
    h('h3', {}, 'CPP Quality Overlay'),
    h('p', { class: 'quality-overlay-sub' }, 'This Lite view shows the 14 raw metrics only, with no synthesized grade.'),
    h('a', {
      href: 'https://criticalpathpartners.ca/schedule-health-report.html',
      class: 'quality-cta-btn'
    }, 'Run the free Schedule Health Report for the full A–F grade →')
  ]);
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

  const { metrics, disclosure } = computeMetrics(A);
  const passCount   = metrics.filter(m => m.status === 'PASS').length;
  const reviewCount = metrics.filter(m => m.status === 'REVIEW').length;
  const failCount   = metrics.filter(m => m.status === 'FAIL').length;

  const table = dataTable({ columns: COLUMNS, rows: metrics });

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'DCMA Lite'),
    h('div', { class: 'lens-card' }, [
      h('p', {}, `DCMA screening, ${metrics.length} of the 14 points (CPLI and BEI need a baseline) · ${passCount} PASS · ${reviewCount} REVIEW · ${failCount} FAIL`)
    ]),
    qualityOverlayCard(),
    h('div', { class: 'lens-card' }, [table]),
    ...disclosureCards(disclosure)
  ]);
}
