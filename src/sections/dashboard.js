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
        h('p', {}, 'Drop an XER into the sidebar to see this dashboard come alive.')
      ])
    ]);
  }

  const m = computeMetrics(A);
  const banner = renderStatusBanner(m);
  const halfStepWarning = A.ermhdr?.isHalfStep
    ? h('div', { class: 'lens-card lens-warn' }, 'Half-Step XER (AACE 29R-03 MIP 3.4) — derived from base+update merge')
    : null;

  const elements = [
    h('h2', {}, 'Executive Dashboard'),
    banner
  ];
  if (halfStepWarning) elements.push(halfStepWarning);

  elements.push(
    h('div', { class: 'kpi-grid' }, [
      kpiCard({ title: 'Activities', big: m.totalActivities.toLocaleString(), sub: `${m.loeCount} LoE/WBS excluded` }),
      kpiCard({ title: 'Percent complete', big: `${m.percentComplete}%`, sub: `${m.completeCount} complete` }),
      kpiCard({ title: 'Critical activities', big: m.criticalCount.toLocaleString(), sub: `${m.criticalPercent}% of total`, tone: m.criticalPercent > 25 ? 'red' : m.criticalPercent > 15 ? 'amber' : 'green' }),
      kpiCard({ title: 'Data date', big: m.dataDate || '—', sub: 'last_recalc_date' }),
      kpiCard({ title: 'Project finish', big: m.projectFinish || '—', sub: 'scd_end_date' })
    ]),
    h('div', { class: 'kpi-grid' }, [
      kpiCard({ title: 'Relationships', big: m.relCount.toLocaleString() }),
      kpiCard({ title: 'Milestones', big: `${m.msComplete} / ${m.msTotal}`, sub: 'complete / total' }),
      kpiCard({ title: 'Zero-float activities', big: `${m.zeroFloatPercent}%`, sub: 'tot float <= 0', tone: m.zeroFloatPercent > 30 ? 'amber' : 'ink' }),
      kpiCard({ title: 'Calendars in use', big: m.calendarsInUse.toLocaleString() })
    ])
  );

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
  const percentComplete = realTasks.length > 0 ? Math.round((completeCount / realTasks.length) * 100) : 0;

  const criticalCount = realTasks.filter(t => {
    const tf = parseFloat(t.total_float_hr_cnt);
    return !isNaN(tf) && tf <= 0;
  }).length;
  const criticalPercent = realTasks.length > 0 ? Math.round((criticalCount / realTasks.length) * 100) : 0;

  const milestones = realTasks.filter(t => MILESTONE_TYPES.has(t.task_type || ''));
  const msTotal = milestones.length;
  const msComplete = milestones.filter(t => t.status_code === COMPLETE_STATUS).length;

  const zeroFloatCount = realTasks.filter(t => parseFloat(t.total_float_hr_cnt) === 0).length;
  const zeroFloatPercent = realTasks.length > 0 ? Math.round((zeroFloatCount / realTasks.length) * 100) : 0;

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
    percentComplete,
    criticalCount,
    criticalPercent,
    relCount: rels.length,
    msTotal,
    msComplete,
    zeroFloatCount,
    zeroFloatPercent,
    calendarsInUse: calendarsInUse || calendars.length,
    dataDate,
    projectFinish
  };
}

function renderStatusBanner(m) {
  let tone = 'green';
  let label = 'Schedule status — healthy';
  if (m.criticalPercent > 25 || m.zeroFloatPercent > 50) {
    tone = 'red';
    label = 'Schedule status — high concentration of critical / zero-float activities';
  } else if (m.criticalPercent > 15 || m.zeroFloatPercent > 30) {
    tone = 'amber';
    label = 'Schedule status — elevated critical / zero-float concentration';
  }
  return h('div', { class: 'lens-status-banner', 'data-tone': tone }, label);
}
