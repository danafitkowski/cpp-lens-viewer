import { h } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';

const MILESTONE_TYPES = new Set(['TT_Mile', 'TT_FinMile']);
const EXCLUDED_TYPES = new Set(['TT_LOE', 'TT_WBS']);

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
  const pctComplete   = realTasks.length > 0 ? Math.round((completeCount / realTasks.length) * 100) : 0;
  const criticalCount = realTasks.filter(t => {
    const tf = parseFloat(t.total_float_hr_cnt);
    return !isNaN(tf) && tf <= 0;
  }).length;

  const narrative = `Project ${proj.proj_short_name || '(unnamed)'} as of data date ${(proj.last_recalc_date || '').slice(0, 10) || 'unknown'}. ` +
    `${realTasks.length.toLocaleString()} activities (${completeCount} complete, ${activeCount} in progress) — ${pctComplete}% physical complete. ` +
    `${criticalCount.toLocaleString()} activities sit on the critical path (total float ≤ 0). ` +
    `Plan end date: ${(proj.plan_end_date || '').slice(0, 10) || 'not set'}.`;

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
      renderMilestoneTable(upcomingMilestones)
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
  if (criticalPct > 25) concerns.push(`${criticalPct}% of activities are critical — high concentration suggests over-constrained logic or under-progress.`);

  const noLogicCount = realTasks.filter(t => !t.task_id).length;
  if (noLogicCount > 0) concerns.push(`${noLogicCount} activities have no task_id (data quality).`);

  const assignments = getTable(A, 'TASKRSRC');
  if (assignments.length === 0) concerns.push('No resource assignments found — cost/loading analysis will be limited.');

  const codes = getTable(A, 'TASKACTV');
  if (codes.length === 0) concerns.push('No activity-code assignments — rolling up by trade/area is not possible.');

  const longDuration = realTasks.filter(t => {
    const d = parseFloat(t.target_drtn_hr_cnt);
    return !isNaN(d) && d > 20 * 8; // > 20 days at 8 hr/day
  }).length;
  if (longDuration > 0) concerns.push(`${longDuration} activities have duration > 20 working days — review for hammock-style summary tasks.`);

  return concerns;
}

function pickUpcomingMilestones(realTasks) {
  return realTasks
    .filter(t => MILESTONE_TYPES.has(t.task_type || ''))
    .filter(t => t.status_code !== 'TK_Complete')
    .map(t => ({
      code: t.task_code || '',
      name: t.task_name || '',
      date: (t.target_end_date || t.target_start_date || '').slice(0, 10)
    }))
    .filter(m => m.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
}

function renderMilestoneTable(rows) {
  if (rows.length === 0) {
    return h('p', { class: 'lens-section-stub' }, 'No incomplete milestones found.');
  }
  return h('table', { class: 'lens-table' }, [
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
}
