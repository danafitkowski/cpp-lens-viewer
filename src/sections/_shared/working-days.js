import { h } from '../../lib/dom.js';
import { getTable, getCalendarMap, durationHoursToDays } from '@criticalpathpartners/lens-parser';

/**
 * ONE place where P6 hours become working days.
 *
 * P6 stores durations, remaining durations and total float in HOURS. A working
 * day is therefore whatever the activity's OWN calendar says a day is:
 * 352 hr is 44 days on an 8 hr/day calendar and 35.2 days on a 10 hr/day one.
 * Sections used to divide by a baked-in 8 and then print "working days" or
 * "wd" underneath the result, which is wrong by 25% on a 10 hr/day calendar and
 * wrong silently — the label gives the reader no way to notice.
 *
 * That was not one bug in one section, it was the same bug re-typed in six
 * places, so the fix is not six edits: it is this module plus the guard in
 * tests/unit/no-local-hour-conversion.test.js, which fails the build if any
 * section imports durationHoursToDays itself or writes hour arithmetic of its
 * own. There is no list of "sections that convert hours" for anyone to keep up
 * to date — a section either goes through here or the suite goes red.
 *
 * The second thing this module owns is the DISCLOSURE. Whenever the divisor did
 * not come from the file, the section has to say so on its face: a guess that
 * decides which side of a threshold an activity lands on is not a detail.
 */

/** P6's own hours-per-day when the file states nothing usable. */
export const P6_DEFAULT_HOURS_PER_DAY = 8;

/** TASK columns that hold hours and get read as days. */
export const HOUR_FIELDS = Object.freeze({
  ORIGINAL_DURATION:  'target_drtn_hr_cnt',
  REMAINING_DURATION: 'remain_drtn_hr_cnt',
  TOTAL_FLOAT:        'total_float_hr_cnt'
});

const DEFAULT_DISCLOSED_FIELDS = [HOUR_FIELDS.ORIGINAL_DURATION, HOUR_FIELDS.TOTAL_FLOAT];

/** True when a raw XER cell holds a number we can divide. */
function isConvertible(raw) {
  return raw != null && raw !== '' && !isNaN(parseFloat(raw));
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/**
 * Build the hours-to-working-days context for one parsed model.
 *
 * @param {object|null} A  parsed XER model
 * @returns {{
 *   calMap: Record<string, object>,
 *   divisorFor: (clndrId: any, projId?: any) => { hoursPerDay: number, source: 'calendar'|'unusable'|'missing', clndrId: string|null, raw: string|null, inherited: 'project'|'default'|null },
 *   hoursToDays: (hours: any, clndrId: any, projId?: any) => number|null,
 *   workingDays: (task: object, field: string) => number|null,
 *   disclose: (tasks: object[], fields?: string[]) => object
 * }}
 */
export function workingDayContext(A) {
  const calMap = A ? getCalendarMap(A) : {};

  // Read the RAW CALENDAR rows, not only getCalendarMap's normalised view.
  // getCalendarMap already substitutes 8 for a missing or unparsable
  // day_hr_cnt, and durationHoursToDays substitutes 8 again for a zero, so by
  // the time a caller is holding a calInfo object the substitution is invisible
  // — a calendar row that exists but states nothing usable looks exactly like a
  // real 8 hr/day calendar. Checking only whether the CALENDAR row is PRESENT
  // (the old test in schedule-quality.js) therefore reports clean on the worst
  // case: a file full of calendars carrying a blank day_hr_cnt. The raw field is
  // the only place the difference survives, so the disclosure is made from it.
  const stated   = new Map();   // clndr_id -> hours/day the file actually states
  const unusable = new Map();   // clndr_id -> the raw day_hr_cnt we could not use

  if (A) {
    for (const row of getTable(A, 'CALENDAR')) {
      const id = row.clndr_id;
      if (id == null || id === '') continue;
      const key = String(id);
      const n = parseFloat(row.day_hr_cnt);
      if (Number.isFinite(n) && n > 0) {
        stated.set(key, n);
      } else {
        const raw = row.day_hr_cnt;
        unusable.set(key, raw == null || String(raw).trim() === '' ? '(blank)' : String(raw));
      }
    }
  }

  // CALENDAR INHERITANCE (2026-11-07). An activity with a BLANK clndr_id is
  // not scheduled on an 8-hour guess: P6 schedules it on its PROJECT calendar
  // (PROJECT.clndr_id), else on the database default calendar (the CALENDAR row
  // flagged default_flag = 'Y'). This module used to send a blank straight to
  // the 8-hour fallback, so on a 10 h/day project calendar 400 h read as 50
  // working days instead of 40. Only a blank id inherits: an activity that
  // names a calendar this file does not carry is still reported as missing.
  const projectCalendar = new Map();   // proj_id -> clndr_id
  const projectRows = A ? getTable(A, 'PROJECT') : [];
  for (const p of projectRows) {
    const pid = p.proj_id == null ? '' : String(p.proj_id).trim();
    const cid = p.clndr_id == null ? '' : String(p.clndr_id).trim();
    if (pid !== '' && cid !== '' && !projectCalendar.has(pid)) projectCalendar.set(pid, cid);
  }
  const onlyProjectCalendar = projectRows.length === 1
    ? (projectRows[0].clndr_id == null ? '' : String(projectRows[0].clndr_id).trim())
    : '';
  let defaultCalendar = '';
  if (A) {
    for (const row of getTable(A, 'CALENDAR')) {
      const id = row.clndr_id == null ? '' : String(row.clndr_id).trim();
      if (id !== '' && String(row.default_flag == null ? '' : row.default_flag).trim().toUpperCase() === 'Y') {
        defaultCalendar = id;
        break;
      }
    }
  }

  /** True when this file carries a CALENDAR row (or parsed calendar) for the id. */
  function inFile(id) {
    return id !== '' && (stated.has(id) || unusable.has(id) || calMap[id] != null);
  }

  /**
   * The calendar a blank-calendar activity inherits, and from where. The
   * project is the activity's proj_id; where the caller does not pass one and
   * the file holds a single project, that project's calendar applies.
   */
  function inheritedCalendar(projId) {
    const pid = projId == null ? '' : String(projId).trim();
    const fromProject = pid !== '' ? (projectCalendar.get(pid) || '') : onlyProjectCalendar;
    if (inFile(fromProject)) return { id: fromProject, inherited: 'project' };
    if (inFile(defaultCalendar)) return { id: defaultCalendar, inherited: 'default' };
    return null;
  }

  /**
   * Which hours-per-day applies to an activity, and where that number came
   * from. 'calendar' = the calendar's hours per day as P6 schedules it:
   * CALENDAR.day_hr_cnt, or the hours its shifts work where every working day
   * works the same and day_hr_cnt says otherwise, or P6's internal 8-hour
   * Standard for an empty record (lens-parser's getCalendarMap applies both
   * rules, measured on P6's own F9). 'unusable' = the CALENDAR row is there
   * but states no usable day_hr_cnt and has no shifts to read one from.
   * 'missing' = the activity names a calendar this file does not contain, or
   * names none at all and no project or default calendar is in the file.
   * `inherited` is 'project' or 'default' when the activity names no calendar
   * and the divisor came from the calendar P6 schedules it on instead.
   */
  function divisorFor(clndrId, projId) {
    const blank = clndrId == null || String(clndrId).trim() === '';
    if (blank) {
      const inh = inheritedCalendar(projId);
      if (inh) return { ...resolve(inh.id), inherited: inh.inherited };
    }
    return { ...resolve(blank ? null : clndrId), inherited: null };
  }

  function resolve(clndrId) {
    const id = (clndrId == null || clndrId === '') ? null : String(clndrId);
    const cal = id !== null ? calMap[id] : null;
    // The hours its shifts work, where P6 schedules on them instead of the
    // declared figure (also where day_hr_cnt is unusable but the week has hours).
    if (cal && !cal.empty_record && cal.declared_hours_per_day != null) {
      return { hoursPerDay: cal.hours_per_day, source: 'calendar', clndrId: id, raw: null, basis: 'shifts' };
    }
    // An empty record that states its hours: P6 schedules it on its internal
    // 8-hour Standard whatever it declares.
    if (cal && cal.empty_record && stated.has(id)) {
      return { hoursPerDay: cal.hours_per_day, source: 'calendar', clndrId: id, raw: null, basis: 'standard' };
    }
    if (id !== null && stated.has(id)) {
      return { hoursPerDay: stated.get(id), source: 'calendar', clndrId: id, raw: null, basis: 'declared' };
    }
    if (id !== null && unusable.has(id)) {
      return { hoursPerDay: P6_DEFAULT_HOURS_PER_DAY, source: 'unusable', clndrId: id, raw: unusable.get(id) };
    }
    return { hoursPerDay: P6_DEFAULT_HOURS_PER_DAY, source: 'missing', clndrId: id, raw: null };
  }

  /**
   * Hours to working days on a named calendar.
   * @returns {number|null} null when the cell is absent or unparsable — never 0,
   *                        because 0 is a real duration and a real float.
   */
  function hoursToDays(hours, clndrId, projId) {
    if (!isConvertible(hours)) return null;
    const d = divisorFor(clndrId, projId);
    return durationHoursToDays(hours, { hours_per_day: d.hoursPerDay }, P6_DEFAULT_HOURS_PER_DAY);
  }

  /**
   * Hours to working days for one TASK row, through that activity's calendar.
   */
  function workingDays(task, field) {
    if (!task) return null;
    return hoursToDays(task[field], task.clndr_id, task.proj_id);
  }

  /**
   * What has to be said out loud about the conversion the section just did.
   *
   * @param {object[]} tasks   the rows the section actually converted
   * @param {string[]} [fields] which hour columns it read
   */
  function disclose(tasks, fields = DEFAULT_DISCLOSED_FIELDS) {
    const rows = Array.isArray(tasks) ? tasks : [];
    const hoursPerDaySet = new Set();
    const unusableValues = new Set();
    const bases = new Set();
    let converted = 0;
    let missing = 0;
    let unusableCount = 0;
    let inheritedProject = 0;
    let inheritedDefault = 0;

    for (const t of rows) {
      if (!t) continue;
      if (!fields.some(f => isConvertible(t[f]))) continue;
      converted++;
      const d = divisorFor(t.clndr_id, t.proj_id);
      if (d.inherited === 'project') inheritedProject++;
      else if (d.inherited === 'default') inheritedDefault++;
      if (d.source === 'calendar') { hoursPerDaySet.add(d.hoursPerDay); bases.add(d.basis); }
      else if (d.source === 'unusable') { unusableCount++; unusableValues.add(d.raw); }
      else missing++;
    }

    const hoursPerDay = [...hoursPerDaySet].sort((a, b) => a - b);
    const fallback = missing + unusableCount;

    // Name the divisor the thresholds were applied at. On a 10 hr/day calendar
    // "> 20 working days" is 200 hr, not 160 — the reader cannot check the count
    // without knowing which divisor was used. Says what happened, not what is
    // assumed, and where each figure came from.
    const source = [
      bases.has('declared') ? 'CALENDAR.day_hr_cnt' : null,
      bases.has('shifts') ? 'the hours a calendar\'s shifts work, where they differ from day_hr_cnt, as P6 schedules' : null,
      bases.has('standard') ? 'P6\'s internal 8-hour Standard for a calendar record with no week defined' : null,
    ].filter(Boolean).join('; ');
    let note = hoursPerDay.length > 0
      ? `Durations and float converted to working days at ${hoursPerDay.join(' / ')} hr per day (${source}).`
      : `No activity in this file resolves to a CALENDAR record with a usable day_hr_cnt. Durations and float converted at the P6 default ${P6_DEFAULT_HOURS_PER_DAY} hr per day.`;
    const inherited = inheritedProject + inheritedDefault;
    if (inherited > 0) {
      const on = [
        inheritedProject > 0 ? `${inheritedProject.toLocaleString()} on the project calendar` : null,
        inheritedDefault > 0 ? `${inheritedDefault.toLocaleString()} on the default calendar` : null
      ].filter(Boolean).join(' and ');
      note += ` ${inherited.toLocaleString()} ${plural(inherited, 'activity names no calendar of its own and was', 'activities name no calendar of their own and were')} ` +
        `converted on the calendar P6 schedules ${plural(inherited, 'it', 'them')} on: ${on}.`;
    }

    let warning = null;
    if (fallback > 0) {
      const parts = [];
      if (missing > 0) {
        parts.push(
          `${missing.toLocaleString()} ${plural(missing, 'activity names', 'activities name')} ` +
          'a calendar that is not in this file.'
        );
      }
      if (unusableCount > 0) {
        const shown = [...unusableValues].sort().join(', ');
        parts.push(
          `${unusableCount.toLocaleString()} ${plural(unusableCount, 'activity resolves', 'activities resolve')} ` +
          `to a CALENDAR record that states no usable hours per day (day_hr_cnt ${shown}).`
        );
      }
      parts.push(
        `Their durations and float were converted at the P6 default ${P6_DEFAULT_HOURS_PER_DAY} hr per day, ` +
        'which may put them on the wrong side of the working-day thresholds in this section.'
      );
      warning = parts.join(' ');
    }

    return {
      hoursPerDay,
      converted,
      missing,
      unusable: unusableCount,
      unusableValues: [...unusableValues].sort(),
      inheritedProject,
      inheritedDefault,
      fallback,
      note,
      warning
    };
  }

  return { calMap, divisorFor, hoursToDays, workingDays, disclose };
}

/**
 * The disclosure, rendered identically wherever it appears. Returns [] when the
 * section converted nothing, the note card when it did, and the amber warning
 * card whenever any divisor was a fallback rather than a number from the file.
 *
 * @param {object} disclosure  from context.disclose()
 * @returns {Node[]}
 */
export function disclosureCards(disclosure) {
  if (!disclosure || disclosure.converted === 0) return [];
  const out = [h('div', { class: 'lens-card' }, [h('p', {}, disclosure.note)])];
  if (disclosure.warning) {
    out.push(h('div', { class: 'lens-card lens-warn' }, disclosure.warning));
  }
  return out;
}

/** Short caption naming the divisor, for sections with no room for a card. */
export function divisorCaption(disclosure) {
  if (!disclosure || disclosure.converted === 0) return '';
  return disclosure.hoursPerDay.length > 0
    ? `${disclosure.hoursPerDay.join(' / ')} hr per day`
    : `${P6_DEFAULT_HOURS_PER_DAY} hr per day (P6 default)`;
}
