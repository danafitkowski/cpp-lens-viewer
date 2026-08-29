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
 *   divisorFor: (clndrId: any) => { hoursPerDay: number, source: 'calendar'|'unusable'|'missing', clndrId: string|null, raw: string|null },
 *   hoursToDays: (hours: any, clndrId: any) => number|null,
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

  /**
   * Which hours-per-day applies to an activity, and where that number came
   * from. 'calendar' = read off CALENDAR.day_hr_cnt. 'unusable' = the CALENDAR
   * row is there but states no usable day_hr_cnt. 'missing' = the activity
   * names a calendar this file does not contain, or names none at all.
   */
  function divisorFor(clndrId) {
    const id = (clndrId == null || clndrId === '') ? null : String(clndrId);
    if (id !== null && stated.has(id)) {
      return { hoursPerDay: stated.get(id), source: 'calendar', clndrId: id, raw: null };
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
  function hoursToDays(hours, clndrId) {
    if (!isConvertible(hours)) return null;
    const d = divisorFor(clndrId);
    return durationHoursToDays(hours, { hours_per_day: d.hoursPerDay }, P6_DEFAULT_HOURS_PER_DAY);
  }

  /**
   * Hours to working days for one TASK row, through that activity's calendar.
   */
  function workingDays(task, field) {
    if (!task) return null;
    return hoursToDays(task[field], task.clndr_id);
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
    let converted = 0;
    let missing = 0;
    let unusableCount = 0;

    for (const t of rows) {
      if (!t) continue;
      if (!fields.some(f => isConvertible(t[f]))) continue;
      converted++;
      const d = divisorFor(t.clndr_id);
      if (d.source === 'calendar') hoursPerDaySet.add(d.hoursPerDay);
      else if (d.source === 'unusable') { unusableCount++; unusableValues.add(d.raw); }
      else missing++;
    }

    const hoursPerDay = [...hoursPerDaySet].sort((a, b) => a - b);
    const fallback = missing + unusableCount;

    // Name the divisor the thresholds were applied at. On a 10 hr/day calendar
    // "> 20 working days" is 200 hr, not 160 — the reader cannot check the count
    // without knowing which divisor was used. Says what happened, not what is
    // assumed.
    const note = hoursPerDay.length > 0
      ? `Durations and float converted to working days at ${hoursPerDay.join(' / ')} hr per day (CALENDAR.day_hr_cnt).`
      : `No activity in this file resolves to a CALENDAR record with a usable day_hr_cnt. Durations and float converted at the P6 default ${P6_DEFAULT_HOURS_PER_DAY} hr per day.`;

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
