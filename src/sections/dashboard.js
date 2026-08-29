import { h } from '../lib/dom.js';
import { getTable, getTableAliased } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';

const COMPLETE_STATUS = 'TK_Complete';
const ACTIVE_STATUS = 'TK_Active';
const MILESTONE_TYPES = new Set(['TT_Mile', 'TT_FinMile']);
const EXCLUDED_TYPES = new Set(['TT_LOE', 'TT_WBS']);

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Executive Dashboard'),
      h('div', { class: 'lens-card' }, [
        h('p', {}, 'Load an XER in the sidebar to populate this dashboard.')
      ])
    ]);
  }

  const m = computeMetrics(A);
  const banner = renderStatusBanner(m);
  const halfStepWarning = A.ermhdr?.isHalfStep
    ? h('div', { class: 'lens-card lens-warn' }, 'Half-Step XER (AACE 29R-03 MIP 3.4): derived from base+update merge')
    : null;

  const elements = [
    h('h2', {}, 'Executive Dashboard'),
    banner
  ];
  if (halfStepWarning) elements.push(halfStepWarning);

  elements.push(
    h('div', { class: 'kpi-grid' }, [
      kpiCard({ title: 'Activities', big: m.totalActivities.toLocaleString(), sub: `${m.loeCount} LoE/WBS excluded` }),
      // Labelled for the quantity actually computed: the share of activities whose
      // status_code is TK_Complete. It ignores duration weighting and ignores
      // phys_complete_pct, so it is NOT physical % complete and must not read as
      // though it were. Same wording as the Executive Summary narrative.
      kpiCard({ title: 'Activities complete', big: `${m.pctActivitiesComplete}%`, sub: `${m.completeCount} of ${m.totalActivities} by count, not physical % complete` }),
      kpiCard({ title: 'Critical activities', big: m.criticalCount.toLocaleString(), sub: `${m.criticalPercent}% of total`, tone: m.criticalPercent > 25 ? 'red' : m.criticalPercent > 15 ? 'amber' : 'green' }),
      kpiCard({ title: 'Data date', big: m.dataDate || '—', sub: 'last_recalc_date' }),
      kpiCard({ title: 'Project finish', big: m.projectFinish || '—', sub: 'scd_end_date' })
    ]),
    h('div', { class: 'kpi-grid' }, [
      kpiCard({ title: 'Relationships', big: m.relCount.toLocaleString() }),
      kpiCard({ title: 'Milestones', big: `${m.msComplete} / ${m.msTotal}`, sub: 'complete / total' }),
      // Counts every activity at or below zero total float — negative float included.
      // Negative-float activities are the most behind-schedule work in the file; an
      // "equals zero" test drops exactly them while still claiming "≤ 0". The split
      // is spelled out so the reader can reconcile this against Critical activities.
      kpiCard({ title: 'Zero or negative float', big: `${m.nonPositiveFloatPercent}%`, sub: `total float ≤ 0: ${m.negativeFloatCount} negative, ${m.zeroFloatCount} zero`, tone: m.nonPositiveFloatPercent > 30 ? 'amber' : 'ink' }),
      kpiCard({ title: 'Calendars in use', big: m.calendarsInUse.toLocaleString() })
    ])
  );

  // Both float percentages above divide by ALL real activities, including any that
  // carry no total_float_hr_cnt at all. Saying so on the face of the dashboard is
  // the difference between a percentage a reader can reconcile and one they cannot.
  if (m.nullFloatCount > 0) {
    elements.push(h('div', { class: 'lens-card' }, [
      h('p', {}, `${m.nullFloatCount.toLocaleString()} of ${m.totalActivities.toLocaleString()} activities carry no total float value. They are counted in the denominator of both float percentages above and in neither numerator.`)
    ]));
  }

  return h('div', { class: 'lens-section-content' }, elements);
}

function computeMetrics(A) {
  const tasks = getTable(A, 'TASK');
  const rels = getTableAliased(A, 'REL');
  const projects = getTable(A, 'PROJECT');
  const calendars = getTable(A, 'CALENDAR');

  const realTasks = tasks.filter(t => !EXCLUDED_TYPES.has(t.task_type || ''));
  const loeCount = tasks.length - realTasks.length;
  const completeCount = realTasks.filter(t => t.status_code === COMPLETE_STATUS).length;
  const activeCount = realTasks.filter(t => t.status_code === ACTIVE_STATUS).length;
  // Share of activities whose status_code is TK_Complete. Deliberately NOT named
  // percentComplete: that name is the mislabel this card shipped with. It is a
  // head-count ratio — unweighted by duration, and unrelated to phys_complete_pct.
  const pctActivitiesComplete = realTasks.length > 0 ? Math.round((completeCount / realTasks.length) * 100) : 0;

  // ── Float census ───────────────────────────────────────────────────────────
  // ONE pass, ONE population, feeding BOTH float cards. The dashboard previously
  // ran two independent tests over the same activities — "Critical activities"
  // used total float ≤ 0 while "Zero-float activities" used === 0 under a "≤ 0"
  // label — so every negative-float activity (the work already behind, the most
  // critical rows in the file) was dropped from one card and kept in the other,
  // and the two cards contradicted each other on the same screen. Deriving both
  // from this census is what makes that divergence impossible rather than merely
  // fixed once: there is no second rule left to keep in step.
  let negativeFloatCount = 0;
  let zeroFloatCount = 0;
  let nullFloatCount = 0;
  for (const t of realTasks) {
    const tf = parseFloat(t.total_float_hr_cnt);
    if (isNaN(tf)) nullFloatCount++;
    else if (tf < 0) negativeFloatCount++;
    else if (tf === 0) zeroFloatCount++;
  }
  const nonPositiveFloatCount = negativeFloatCount + zeroFloatCount;
  const nonPositiveFloatPercent = realTasks.length > 0 ? Math.round((nonPositiveFloatCount / realTasks.length) * 100) : 0;

  // "Critical" on this dashboard means total float ≤ 0 — the same population the
  // float card reports. Same number, by construction.
  const criticalCount = nonPositiveFloatCount;
  const criticalPercent = nonPositiveFloatPercent;

  const milestones = realTasks.filter(t => MILESTONE_TYPES.has(t.task_type || ''));
  const msTotal = milestones.length;
  const msComplete = milestones.filter(t => t.status_code === COMPLETE_STATUS).length;

  const calendarsInUse = new Set(realTasks.map(t => t.clndr_id).filter(Boolean)).size;

  const primary = projects[0] || {};
  const dataDate = (primary.last_recalc_date || '').slice(0, 10);
  // scd_end_date = CPM-calculated scheduled finish; plan_end_date = optional contractual
  // must-finish constraint, frequently blank. "Project finish" means the former — most
  // real XERs (bid-stage schedules especially) never have the latter set at all.
  const projectFinish = (primary.scd_end_date || primary.plan_end_date || '').slice(0, 10);

  return {
    totalActivities: realTasks.length,
    loeCount,
    completeCount,
    activeCount,
    pctActivitiesComplete,
    criticalCount,
    criticalPercent,
    relCount: rels.length,
    msTotal,
    msComplete,
    negativeFloatCount,
    zeroFloatCount,
    nullFloatCount,
    nonPositiveFloatCount,
    nonPositiveFloatPercent,
    calendarsInUse: calendarsInUse || calendars.length,
    dataDate,
    projectFinish
  };
}

// The banner used to OR two thresholds together — one on criticalPercent, one on
// zeroFloatPercent — as though they measured different things. They read the same
// population (total float ≤ 0), so the second test only ever masked the fact that
// the two cards disagreed. One measure, one threshold pair.
function renderStatusBanner(m) {
  let tone = 'green';
  let label = 'Schedule status: healthy';
  if (m.criticalPercent > 25) {
    tone = 'red';
    label = 'Schedule status: high concentration of activities at or below zero total float';
  } else if (m.criticalPercent > 15) {
    tone = 'amber';
    label = 'Schedule status: elevated concentration of activities at or below zero total float';
  }
  return h('div', { class: 'lens-status-banner', 'data-tone': tone }, label);
}
