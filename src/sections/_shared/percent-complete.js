/**
 * ONE place where an activity's percent complete is read.
 *
 * P6 stores three different percent completes and TASK.complete_pct_type says
 * which one the activity reports:
 *
 *   CP_Drtn   (original duration - remaining duration) / original duration.
 *             P6 shows 0% when remaining exceeds original, never a negative.
 *   CP_Phys   the percent the scheduler typed, stored in phys_complete_pct.
 *   CP_Units  actual units / (actual + remaining units), labor and nonlabor
 *             together. An activity with no units at all cannot be read that
 *             way, so it is read by the duration rule and reported as such.
 *
 * Duration is P6's default type, and P6 only keeps phys_complete_pct current on
 * Physical-type activities. Sections used to read phys_complete_pct for every
 * activity, so on an ordinary Duration-type schedule finished work read 0%:
 * measured on the public demonstration file, a WBS node with 12 of 12
 * activities complete rolled up to 0.0% and 57 of 81 "Completed this period"
 * rows read +0.0%.
 *
 * A completed activity is 100 whatever the stored fields say. A file that
 * states no type (P6 XML, where the parser already maps the activity percent
 * complete into phys_complete_pct, or a hand-built XER) is read from that
 * stored percent, and the basis line says how many activities that covers.
 *
 * The second thing this module owns is that BASIS LINE. A percentage whose rule
 * the reader cannot see is a number they cannot check.
 */

const COMPLETE_STATUS = 'TK_Complete';

/** Parse a raw XER cell; null when it holds no number. */
function num(raw) {
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function clamp(v) {
  return Math.min(100, Math.max(0, v));
}

function durationPct(task) {
  const original  = num(task.target_drtn_hr_cnt);
  const remaining = num(task.remain_drtn_hr_cnt);
  if (original == null || original <= 0 || remaining == null) return 0;
  return clamp(((original - remaining) / original) * 100);
}

/**
 * Percent complete for one TASK row, 0 to 100, and the rule that produced it.
 *
 * @param {object|null|undefined} task
 * @returns {{ pct: number, basis: 'duration'|'physical'|'units'|'units-as-duration'|'unstated' }}
 *   `basis` names the rule the activity's TYPE selects. It is not changed by
 *   the completed-is-100 rule, so the basis line can still count by type.
 */
export function percentComplete(task) {
  if (!task) return { pct: 0, basis: 'unstated' };
  const done = task.status_code === COMPLETE_STATUS;
  const type = task.complete_pct_type;

  if (type === 'CP_Drtn') {
    return { pct: done ? 100 : durationPct(task), basis: 'duration' };
  }
  if (type === 'CP_Units') {
    const actual    = (num(task.act_work_qty)    || 0) + (num(task.act_equip_qty)    || 0);
    const remaining = (num(task.remain_work_qty) || 0) + (num(task.remain_equip_qty) || 0);
    if (actual + remaining > 0) {
      return { pct: done ? 100 : clamp((actual / (actual + remaining)) * 100), basis: 'units' };
    }
    return { pct: done ? 100 : durationPct(task), basis: 'units-as-duration' };
  }
  const stored = num(task.phys_complete_pct);
  return {
    pct: done ? 100 : (stored == null ? 0 : clamp(stored)),
    basis: type === 'CP_Phys' ? 'physical' : 'unstated'
  };
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/**
 * The sentence that tells the reader how the percentages on this page were
 * read. Counts the activities under each rule so a mixed file is visible.
 *
 * @param {object[]} tasks  the TASK rows the section actually read
 * @returns {string}
 */
export function describeProgressBasis(tasks) {
  const counts = { duration: 0, physical: 0, units: 0, 'units-as-duration': 0, unstated: 0 };
  for (const t of (Array.isArray(tasks) ? tasks : [])) {
    if (t) counts[percentComplete(t).basis]++;
  }

  const parts = [];
  if (counts.duration > 0) {
    parts.push(`${counts.duration.toLocaleString()} by duration (original minus remaining duration, over original duration, never below 0% or above 100%)`);
  }
  if (counts.physical > 0) {
    parts.push(`${counts.physical.toLocaleString()} by physical percent (phys_complete_pct)`);
  }
  if (counts.units > 0) {
    parts.push(`${counts.units.toLocaleString()} by units (actual units over actual plus remaining units)`);
  }

  let text = 'Percent complete follows each activity\'s P6 percent complete type' +
    (parts.length > 0 ? `: ${parts.join(', ')}.` : '.');

  if (counts['units-as-duration'] > 0) {
    const n = counts['units-as-duration'];
    text += ` ${n.toLocaleString()} units-type ${plural(n, 'activity carries', 'activities carry')} no units and ` +
      `${plural(n, 'is', 'are')} read by duration.`;
  }
  if (counts.unstated > 0) {
    const n = counts.unstated;
    text += ` ${n.toLocaleString()} ${plural(n, 'activity states', 'activities state')} no percent complete type and ` +
      `${plural(n, 'is', 'are')} read from the stored percent complete (phys_complete_pct).`;
  }
  return text + ' A completed activity counts as 100%.';
}
