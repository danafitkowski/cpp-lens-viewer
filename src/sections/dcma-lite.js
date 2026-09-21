import { h } from '../lib/dom.js';
import { getTable, getTableAliased, buildPredecessorMap } from '@criticalpathpartners/lens-parser';
import { dataTable } from './_shared/data-table.js';
import { workingDayContext, disclosureCards, HOUR_FIELDS } from './_shared/working-days.js';
import { taskKey, indexTasks, resolveComparisonAmbiguity } from './_shared/identity.js';
import { dayOf, dataDateOf, actualsAfter } from './_shared/input-quality.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);
const MILESTONES = new Set(['TT_Mile', 'TT_FinMile']);
const HARD_CONSTRAINTS = new Set(['CS_MSO', 'CS_MEO', 'CS_MANDSTART', 'CS_MANDFIN']);

/** DCMA-14 High Float / High Duration threshold, in WORKING DAYS. */
const HIGH_FLOAT_WD    = 44;
const HIGH_DURATION_WD = 44;

/** Status of a row this view does not score. Never PASS, never FAIL. */
export const NOT_SCORED = 'NOT SCORED';

const BADGE_COLORS = {
  PASS:   { bg: '#15803D', text: '#ffffff' },
  REVIEW: { bg: '#B45309', text: '#ffffff' },
  FAIL:   { bg: '#C8392F', text: '#ffffff' },
  [NOT_SCORED]: { bg: '#5A6675', text: '#ffffff' }
};

function pct(num, den) {
  if (den === 0) return 0;
  return (num / den) * 100;
}

function fmtPct(val) {
  return `${val.toFixed(1)}%`;
}

/**
 * A row this view does not score. It says so, with the reason, in the result
 * cell. It is never stamped PASS: a check that was not run has not passed.
 */
function notScored(name, reason, target) {
  return { name, result: `Not scored here: ${reason}`, count: '', target, status: NOT_SCORED };
}

/**
 * The fourteen rows. Exported so the Executive Dashboard banner reads the same
 * results this page prints instead of forming a second opinion.
 *
 * @param {object} A       current schedule
 * @param {object|null} B  baseline schedule, or null. Only Missed Tasks reads it.
 */
export function computeMetrics(A, B = null) {
  const allTasks = getTable(A, 'TASK');
  const rels     = getTableAliased(A, 'REL');
  const rsrc     = getTable(A, 'TASKRSRC');
  // Hours become working days in exactly one module — see _shared/working-days.js.
  const cal      = workingDayContext(A);

  // THE POPULATION. The published DCMA percentages are measured over INCOMPLETE
  // ordinary activities: not milestones, not level of effort, not WBS summary,
  // and not finished work. This view used to divide by every activity, so
  // finished work and milestones diluted each result. Measured on the public
  // demonstration file: High Float read 152 of 404 = 37.6% where the full
  // assessment, on this population, reads 152 of 287 = 53.0%.
  const normal = allTasks.filter(t => !LOE_WBS.has(t.task_type) && !MILESTONES.has(t.task_type));
  const tasks  = normal.filter(t => t.status_code !== 'TK_Complete');
  const n = tasks.length;
  const relsTotal = rels.length;
  const ofTasks = (count) => `${count.toLocaleString()} of ${n.toLocaleString()} incomplete activities`;
  const ofRels  = (count) => `${count.toLocaleString()} of ${relsTotal.toLocaleString()} relationships`;
  // A percentage over nothing is not a pass. Say so instead of printing 0.0%.
  const noTasks = n === 0 ? 'the file has no incomplete activities to measure' : null;
  const noRels  = relsTotal === 0 ? 'the file has no relationships to measure' : null;

  const { predecessors, successors } = buildPredecessorMap(A);

  // 1. Logic — % with both pred AND succ
  const withBoth = tasks.filter(t =>
    (predecessors[t.task_id] && predecessors[t.task_id].length > 0) &&
    (successors[t.task_id]   && successors[t.task_id].length   > 0)
  ).length;
  const logicPct = pct(withBoth, n);
  const metric1 = noTasks ? notScored('Logic (% with pred + succ)', noTasks, '≥ 95%') : {
    name:   'Logic (% with pred + succ)',
    result: fmtPct(logicPct),
    count:  ofTasks(withBoth),
    target: '≥ 95%',
    status: logicPct >= 95 ? 'PASS' : logicPct >= 90 ? 'REVIEW' : 'FAIL'
  };

  // 2. Leads — TASKPRED with lag < 0 (target = 0)
  const leadsCount = rels.filter(r => parseFloat(r.lag_hr_cnt) < 0).length;
  const metric2 = noRels ? notScored('Leads (negative lag)', noRels, '0') : {
    name:   'Leads (negative lag)',
    result: String(leadsCount),
    count:  ofRels(leadsCount),
    target: '0',
    status: leadsCount === 0 ? 'PASS' : 'FAIL'
  };

  // 3. Lags — % of TASKPRED with lag > 0 (target ≤ 5%)
  const lagPositiveCount = rels.filter(r => parseFloat(r.lag_hr_cnt) > 0).length;
  const lagsPct = pct(lagPositiveCount, relsTotal);
  const metric3 = noRels ? notScored('Lags (% with lag > 0)', noRels, '≤ 5%') : {
    name:   'Lags (% with lag > 0)',
    result: fmtPct(lagsPct),
    count:  ofRels(lagPositiveCount),
    target: '≤ 5%',
    status: lagsPct <= 5 ? 'PASS' : lagsPct <= 10 ? 'REVIEW' : 'FAIL'
  };

  // 4. FS Relationships — % with pred_type = PR_FS (target ≥ 90%)
  const fsCount = rels.filter(r => r.pred_type === 'PR_FS').length;
  const fsPct   = pct(fsCount, relsTotal);
  const metric4 = noRels ? notScored('FS Relationships (% PR_FS)', noRels, '≥ 90%') : {
    name:   'FS Relationships (% PR_FS)',
    result: fmtPct(fsPct),
    count:  ofRels(fsCount),
    target: '≥ 90%',
    status: fsPct >= 90 ? 'PASS' : fsPct >= 80 ? 'REVIEW' : 'FAIL'
  };

  // 5. Hard Constraints — % with hard cstr_type (target ≤ 5%)
  const hardCount = tasks.filter(t => HARD_CONSTRAINTS.has(t.cstr_type)).length;
  const hardPct   = pct(hardCount, n);
  const metric5 = noTasks ? notScored('Hard Constraints', noTasks, '≤ 5%') : {
    name:   'Hard Constraints',
    result: fmtPct(hardPct),
    count:  ofTasks(hardCount),
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
  const metric6 = noTasks ? notScored(`High Float (> ${HIGH_FLOAT_WD} wd)`, noTasks, '≤ 5%') : {
    name:   `High Float (> ${HIGH_FLOAT_WD} wd)`,
    result: fmtPct(highFloatPct),
    count:  ofTasks(highFloatCount),
    target: '≤ 5%',
    status: highFloatPct <= 5 ? 'PASS' : highFloatPct <= 10 ? 'REVIEW' : 'FAIL'
  };

  // 7. Negative Float — % with total_float_hr_cnt < 0 (target = 0)
  const negFloatCount = tasks.filter(t => parseFloat(t.total_float_hr_cnt) < 0).length;
  const negFloatPct   = pct(negFloatCount, n);
  const metric7 = noTasks ? notScored('Negative Float', noTasks, '0%') : {
    name:   'Negative Float',
    result: fmtPct(negFloatPct),
    count:  ofTasks(negFloatCount),
    target: '0%',
    status: negFloatCount === 0 ? 'PASS' : negFloatPct <= 5 ? 'REVIEW' : 'FAIL'
  };

  // 8. High Duration — > 44 WORKING DAYS on the activity's own calendar (target ≤ 5%).
  const highDurCount = tasks.filter(t => {
    const wd = cal.workingDays(t, HOUR_FIELDS.ORIGINAL_DURATION);
    return wd != null && wd > HIGH_DURATION_WD;
  }).length;
  const highDurPct   = pct(highDurCount, n);
  const metric8 = noTasks ? notScored(`High Duration (> ${HIGH_DURATION_WD} wd)`, noTasks, '≤ 5%') : {
    name:   `High Duration (> ${HIGH_DURATION_WD} wd)`,
    result: fmtPct(highDurPct),
    count:  ofTasks(highDurCount),
    target: '≤ 5%',
    status: highDurPct <= 5 ? 'PASS' : highDurPct <= 10 ? 'REVIEW' : 'FAIL'
  };

  // 9. Invalid Dates. The published check compares dates WITH THE DATA DATE:
  // an actual date must not be after it, and a forecast (early) date of
  // incomplete work must not be before it. Until 2026-09-21 this row only
  // looked for a MISSING actual date and never compared anything with the data
  // date, so the public demonstration file read "0 PASS" with 103 ordinary
  // activities statused past its data date. It counts ACTIVITIES, not fields,
  // over ordinary activities, finished ones included; dates are compared by
  // day (see _shared/input-quality.js). The missing-actual condition is kept,
  // under its own label, in `missingActuals` below.
  const dataDate = dataDateOf(A);
  let actualAfterCount = 0;
  let forecastBeforeCount = 0;
  let invalidDatesCount = 0;
  for (const t of normal) {
    const actualAfter = actualsAfter(t, dataDate).any;
    let forecastBefore = false;
    if (t.status_code !== 'TK_Complete' && !dayOf(t.act_end_date)) {
      const notStarted = !dayOf(t.act_start_date) && t.status_code !== 'TK_Active';
      const earlyStart = dayOf(t.early_start_date);
      const earlyEnd   = dayOf(t.early_end_date);
      forecastBefore = (notStarted && earlyStart !== '' && earlyStart < dataDate) ||
                       (earlyEnd !== '' && earlyEnd < dataDate);
    }
    if (actualAfter) actualAfterCount++;
    if (forecastBefore) forecastBeforeCount++;
    if (actualAfter || forecastBefore) invalidDatesCount++;
  }
  const metric9 = !dataDate ? notScored('Invalid Dates', 'the file states no data date to compare with', '0') : {
    name:   'Invalid Dates',
    result: String(invalidDatesCount),
    count:  `${invalidDatesCount.toLocaleString()} of ${normal.length.toLocaleString()} activities: ` +
            `${actualAfterCount.toLocaleString()} with an actual date after the data date, ` +
            `${forecastBeforeCount.toLocaleString()} with a forecast date before it`,
    target: '0',
    status: invalidDatesCount === 0 ? 'PASS' : 'FAIL'
  };

  // Not one of the fourteen points, and not scored: a finished activity with no
  // actual finish, or an activity in progress with no actual start. This is
  // what row 9 used to count under the name "Invalid Dates".
  const missingActuals = allTasks.filter(t =>
    (t.status_code === 'TK_Complete' && !t.act_end_date) ||
    (t.status_code === 'TK_Active'   && !t.act_start_date)
  ).length;

  // 10. Resources — % of tasks with at least one TASKRSRC assignment.
  // DCMA-EA PAM 200.1 §4.10 verifies that ALL tasks with duration above zero
  // carry dollars or hours: the target is 100%, not a band. This surface
  // published "≥ 80%" until 2026-08-28 — a threshold the standard never
  // contained, and one the earlier 90%→100% correction could not find because
  // it searched for the 90% variant. A schedule with a fifth of its
  // activities unresourced was stamped PASS here. When the export carries no
  // TASKRSRC table at all the criterion is not scored, matching the dashboard's
  // "Not scored" behaviour, rather than a fake FAIL.
  const taskIdsWithRsrc = new Set(rsrc.map(r => r.task_id));
  const rsrcCount = tasks.filter(t => taskIdsWithRsrc.has(t.task_id)).length;
  const rsrcPct   = pct(rsrcCount, n);
  const metric10 = rsrc.length === 0
    ? notScored('Resources (% assigned)', 'the file carries no resource assignments (no TASKRSRC rows)', '100%')
    : noTasks ? notScored('Resources (% assigned)', noTasks, '100%') : {
    name:   'Resources (% assigned)',
    result: fmtPct(rsrcPct),
    count:  ofTasks(rsrcCount),
    target: '100%',
    status: rsrcPct >= 100 ? 'PASS' : 'FAIL'
  };

  // 11. Missed Tasks. DCMA-EA PAM 200.1 §4.11 is a FINISH test against the
  // BASELINE with a 5% ceiling: of the activities whose baseline finish is on
  // or before the data date, the share that did not finish on or before that
  // baseline finish, whether still open or finished late.
  //
  // Until 2026-09-21 this row read the CURRENT file's own planned finish and
  // skipped finished activities. P6 reschedules the planned dates of unstarted
  // work on every update, so almost nothing is ever "past" them, and a late
  // finish was invisible: the public demonstration pair read 0.0% PASS where
  // the full assessment finds 38 of 43. There is no baseline finish inside a
  // single XER, so without a baseline file this row is not scored. It is never
  // a PASS it did not earn.
  //
  // Who was due is decided on the BASELINE side, over its ordinary activities,
  // and matched to the current file on the Activity ID (_shared/identity.js).
  let metric11;
  if (!B) {
    metric11 = notScored('Missed Tasks (late against the baseline finish)',
      'needs a baseline. Load one in the Baseline schedule box', '≤ 5%');
  } else if (!dataDate) {
    metric11 = notScored('Missed Tasks (late against the baseline finish)', 'the file states no data date to compare with', '≤ 5%');
  } else {
    const current = indexTasks(A, resolveComparisonAmbiguity(A, B).keys).index;
    let due = 0, missed = 0, unmatched = 0, noActualFinish = 0;
    for (const bt of getTable(B, 'TASK')) {
      if (LOE_WBS.has(bt.task_type) || MILESTONES.has(bt.task_type)) continue;
      const baselineFinish = dayOf(bt.target_end_date);
      if (baselineFinish === '' || baselineFinish > dataDate) continue;
      const key = taskKey(bt);
      const at = key ? current.get(key) : undefined;
      if (!at) { unmatched++; continue; }
      due++;
      if (at.status_code !== 'TK_Complete') { missed++; continue; }
      const actualFinish = dayOf(at.act_end_date);
      if (actualFinish === '') noActualFinish++;
      else if (actualFinish > baselineFinish) missed++;
    }
    const missedPct = pct(missed, due);
    metric11 = due === 0
      ? notScored('Missed Tasks (late against the baseline finish)', 'no baseline activity was due on or before the data date', '≤ 5%')
      : {
        name:   'Missed Tasks (late against the baseline finish)',
        result: fmtPct(missedPct),
        count:  `${missed.toLocaleString()} of ${due.toLocaleString()} activities with a baseline finish on or before the data date` +
                (noActualFinish > 0 ? `; ${noActualFinish.toLocaleString()} finished with no actual finish date, so lateness is unknown and not counted` : '') +
                (unmatched > 0 ? `; ${unmatched.toLocaleString()} more were due but match no single activity in the current file and are left out` : ''),
        target: '≤ 5%',
        status: missedPct <= 5 ? 'PASS' : 'FAIL'
      };
  }

  // 12. Critical Path Test. The published test adds a large delay to a critical
  // activity and checks that the project finish moves by the same amount. That
  // needs a schedule recalculation, which this viewer does not do. This row
  // used to PASS on a bare count of activities at or below zero float, with no
  // test behind it. The count is kept, as information only.
  const criticalCount = tasks.filter(t => parseFloat(t.total_float_hr_cnt) <= 0).length;
  const metric12 = notScored('Critical Path Test',
    'the test adds a delay and recalculates the schedule, and this viewer does not recalculate. ' +
    `For information, ${ofTasks(criticalCount)} have total float of zero or less`, 'finish moves with the delay');

  // 13 & 14. Never calculated here. They used to show a dash under a heading
  // that claimed all fourteen points.
  const metric13 = notScored('CPLI', 'it needs the critical path length in working days, which this viewer does not calculate', '≥ 0.95');
  const metric14 = notScored('BEI', 'this view does not calculate it. The full Schedule Health Report does, from a baseline', '≥ 0.95');

  // Metrics 6 and 8 are working-day thresholds, so the divisor they were applied
  // at — and any activity whose divisor was a fallback rather than a number read
  // off the file — travels with them to the page.
  const disclosure = cal.disclose(tasks);

  return {
    metrics: [metric1, metric2, metric3, metric4, metric5, metric6, metric7,
              metric8, metric9, metric10, metric11, metric12, metric13, metric14],
    disclosure,
    incompleteCount: n,
    missingActuals
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
    h('p', { class: 'quality-overlay-sub' }, 'This Lite view shows the checks it can score from the file, with no synthesized grade.'),
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
  // The denominator, beside the result it belongs to.
  { key: 'count',  label: 'Count' },
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

  const { metrics, disclosure, incompleteCount, missingActuals } = computeMetrics(A, B);
  const passCount   = metrics.filter(m => m.status === 'PASS').length;
  const reviewCount = metrics.filter(m => m.status === 'REVIEW').length;
  const failCount   = metrics.filter(m => m.status === 'FAIL').length;
  const notScoredCount = metrics.filter(m => m.status === NOT_SCORED).length;
  const scoredCount = metrics.length - notScoredCount;

  const table = dataTable({ columns: COLUMNS, rows: metrics });

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'DCMA Lite'),
    h('div', { class: 'lens-card' }, [
      // Count what was scored. This line used to say "14 of the 14 points" with
      // CPLI and BEI hard-coded to a dash and the Critical Path Test passing on
      // a count with no test behind it.
      h('p', { class: 'lens-dcma-heading' },
        `DCMA screening: ${scoredCount} of the 14 points are scored here · ${passCount} PASS · ${reviewCount} REVIEW · ` +
        `${failCount} FAIL · ${notScoredCount} not scored here, each with its reason in the table.`),
      h('p', { class: 'lens-dcma-population' },
        `Checks 1, 5, 6, 7, 8 and 10 are measured over the ${incompleteCount.toLocaleString()} incomplete activities in this file. ` +
        'Milestones, level of effort and WBS summary activities are left out, and so is finished work. ' +
        'The Count column gives the numerator and the denominator of every result.')
    ]),
    qualityOverlayCard(),
    h('div', { class: 'lens-card' }, [table]),
    h('div', { class: 'lens-card' }, [
      h('p', { class: 'lens-dcma-missing-actuals' },
        `Missing actual dates: ${missingActuals.toLocaleString()}. These are activities marked complete with no actual finish date, ` +
        'or in progress with no actual start date. It is a separate data check: it is not DCMA check 9, and it is not counted in the score above.')
    ]),
    ...disclosureCards(disclosure)
  ]);
}
