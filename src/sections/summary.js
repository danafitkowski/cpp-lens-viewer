import { h } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { workingDayContext, divisorCaption, HOUR_FIELDS } from './_shared/working-days.js';

const MILESTONE_TYPES = new Set(['TT_Mile', 'TT_FinMile']);
const EXCLUDED_TYPES = new Set(['TT_LOE', 'TT_WBS']);

/** Long-duration concern threshold, in WORKING DAYS. */
const LONG_DURATION_WD = 20;

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Executive Summary'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const tasks = getTable(A, 'TASK');
  const realTasks = tasks.filter(t => !EXCLUDED_TYPES.has(t.task_type || ''));
  const projects = getTable(A, 'PROJECT');
  const proj = projects[0] || {};

  const completeCount = realTasks.filter(t => t.status_code === 'TK_Complete').length;
  const activeCount   = realTasks.filter(t => t.status_code === 'TK_Active').length;
  // Count-based, NOT weighted physical % complete: it is the share of activities
  // whose status_code is TK_Complete, ignoring duration and phys_complete_pct.
  // Label it for what it is — it was previously narrated as "% physical complete".
  const pctActivitiesComplete = realTasks.length > 0 ? Math.round((completeCount / realTasks.length) * 100) : 0;
  const criticalCount = realTasks.filter(t => {
    const tf = parseFloat(t.total_float_hr_cnt);
    return !isNaN(tf) && tf <= 0;
  }).length;

  // scd_end_date = CPM-calculated scheduled finish; plan_end_date = optional must-finish
  // constraint, frequently blank. "Project finish" means the former — most real XERs
  // (bid-stage schedules especially) never have the latter set at all.
  const projectFinish = (proj.scd_end_date || proj.plan_end_date || '').slice(0, 10);

  const narrative = `Project ${proj.proj_short_name || '(unnamed)'} as of data date ${(proj.last_recalc_date || '').slice(0, 10) || 'unknown'}. ` +
    `${realTasks.length.toLocaleString()} activities (${completeCount} complete, ${activeCount} in progress). ${pctActivitiesComplete}% of activities complete by count, not weighted physical % complete. ` +
    `${criticalCount.toLocaleString()} activities sit on the critical path (total float ≤ 0). ` +
    `Project finish: ${projectFinish || 'not set'}.`;

  const concerns = buildConcerns(A, { realTasks });
  const upcomingMilestones = pickUpcomingMilestones(realTasks);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Executive Summary'),
    h('div', { class: 'lens-card lens-narrative' }, [
      h('div', { class: 'lens-narrative-header' }, proj.proj_short_name || '(unnamed project)'),
      h('p', {}, narrative)
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Top concerns'),
      concerns.length === 0
        ? h('p', { class: 'lens-section-stub' }, 'No major concerns triggered by current rules.')
        : h('ul', { class: 'lens-concerns' }, concerns.map(c => h('li', {}, c)))
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Next milestones'),
      renderMilestoneTable(upcomingMilestones.rows, upcomingMilestones.total)
    ])
  ]);
}

function buildConcerns(A, { realTasks }) {
  const concerns = [];
  const taskCount = realTasks.length;
  if (taskCount === 0) {
    concerns.push('No activities found in TASK table.');
    return concerns;
  }
  const criticalPct = Math.round((realTasks.filter(t => parseFloat(t.total_float_hr_cnt) <= 0).length / taskCount) * 100);
  if (criticalPct > 25) concerns.push(`${criticalPct}% of activities are critical. High concentration suggests over-constrained logic or under-progress.`);

  const noLogicCount = realTasks.filter(t => !t.task_id).length;
  if (noLogicCount > 0) concerns.push(`${noLogicCount} activities have no task_id (data quality).`);

  const assignments = getTable(A, 'TASKRSRC');
  if (assignments.length === 0) concerns.push('No resource assignments found. Cost/loading analysis will be limited.');

  const codes = getTable(A, 'TASKACTV');
  if (codes.length === 0) concerns.push('No activity-code assignments. Rolling up by trade/area is not possible.');

  // > 20 WORKING DAYS on each activity's own calendar. The old test was
  // `d > 20 * 8` — 20 days only where a day is 8 hours — under a sentence that
  // said "working days", and it also disagreed with the Schedule Quality
  // section's Long Duration card on any file that is not 8 hr/day. Both now
  // read the same number out of the same module.
  const cal = workingDayContext(A);
  const longDuration = realTasks.filter(t => {
    const wd = cal.workingDays(t, HOUR_FIELDS.ORIGINAL_DURATION);
    return wd != null && wd > LONG_DURATION_WD;
  }).length;
  const disclosure = cal.disclose(realTasks, [HOUR_FIELDS.ORIGINAL_DURATION]);
  if (longDuration > 0) {
    concerns.push(
      `${longDuration} activities have duration > ${LONG_DURATION_WD} working days ` +
      `(converted at ${divisorCaption(disclosure)}). Review for hammock-style summary tasks.`
    );
  }
  // A divisor that was guessed rather than read decides which activities land in
  // that count, so it is a concern in its own right, not a footnote.
  if (disclosure.warning) concerns.push(disclosure.warning);

  return concerns;
}

function pickUpcomingMilestones(realTasks) {
  const all = realTasks
    .filter(t => MILESTONE_TYPES.has(t.task_type || ''))
    .filter(t => t.status_code !== 'TK_Complete')
    .map(t => ({
      code: t.task_code || '',
      name: t.task_name || '',
      date: (t.target_end_date || t.target_start_date || '').slice(0, 10)
    }))
    .filter(m => m.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { rows: all.slice(0, 5), total: all.length };
}

function renderMilestoneTable(rows, total) {
  if (rows.length === 0) {
    return h('p', { class: 'lens-section-stub' }, 'No incomplete milestones found.');
  }
  const table = h('table', { class: 'lens-table' }, [
    h('thead', {}, h('tr', {}, [
      h('th', {}, 'Code'),
      h('th', {}, 'Milestone'),
      h('th', {}, 'Target date')
    ])),
    h('tbody', {}, rows.map(r => h('tr', {}, [
      h('td', {}, r.code),
      h('td', {}, r.name),
      h('td', {}, r.date)
    ])))
  ]);
  if (total > rows.length) {
    return h('div', {}, [
      table,
      h('div', { class: 'lens-table-foot' }, `Showing ${rows.length} of ${total} upcoming milestones.`)
    ]);
  }
  return table;
}
