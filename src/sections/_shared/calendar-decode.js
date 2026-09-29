import { h } from '../../lib/dom.js';
import { getTable, getCalendarMap } from '@criticalpathpartners/lens-parser';

/**
 * ONE place that asks which calendars the parser could not read.
 *
 * lens-parser sets parse_incomplete on a calendar whose clndr_data is not
 * empty but decodes to no working days at all. Until the finish-first fix
 * (lens-parser 35a55ba, after canonical xer-parser e42b693) every calendar P6
 * wrote finish-first landed here, and nothing on screen said so: the Calendar
 * Viewer printed a bare dash for its work days and the reader had no way to
 * tell a calendar the viewer could not read from one with no working days.
 * Since that fix a real export rarely lands here, which is why the case needs
 * a notice: a rare, silent dash is easy to miss.
 *
 * What the finding says is what this viewer does, and no more. The parser's
 * working-day arithmetic substitutes a Monday to Friday week for such a
 * calendar, but this viewer never calls it: it does not recalculate the
 * schedule, it reads dates and float as P6 saved them, and it converts hours to
 * days by CALENDAR.day_hr_cnt alone (see working-days.js). So the notice does
 * not claim a substituted week that no figure on screen was computed on. It
 * names the calendar, says its work days are left blank, and says why nothing
 * else moves.
 */

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/**
 * Every calendar in the file whose work week could not be read, in CALENDAR
 * table order.
 *
 * @param {object|null} model  parsed XER model
 * @returns {{ clndr_id: string, clndr_name: string }[]}
 */
export function undecodedCalendars(model) {
  if (!model) return [];
  const calMap = getCalendarMap(model);
  const seen = new Set();
  const out = [];
  for (const row of getTable(model, 'CALENDAR')) {
    const id = row.clndr_id == null ? '' : String(row.clndr_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const info = calMap[id];
    if (info && info.parse_incomplete) {
      out.push({ clndr_id: id, clndr_name: info.clndr_name || '' });
    }
  }
  return out;
}

/** "Six Day (ID 2)", or "ID 2" when the calendar has no name. */
export function calendarLabel(cal) {
  return cal.clndr_name ? `${cal.clndr_name} (ID ${cal.clndr_id})` : `ID ${cal.clndr_id}`;
}

/**
 * The finding, rendered identically wherever it appears. Returns [] when every
 * calendar in the file was read, so a section spreads it in without a test of
 * its own.
 *
 * @param {object|null} model
 * @returns {Node[]}
 */
export function calendarDecodeCards(model) {
  const cals = undecodedCalendars(model);
  if (cals.length === 0) return [];
  const n = cals.length;
  return [h('div', { class: 'lens-card lens-warn lens-calendar-decode' },
    `Calendar finding: the work week of ${n} ${plural(n, 'calendar', 'calendars')} in this file ` +
    `could not be read: ${cals.map(calendarLabel).join('; ')}. ` +
    `${plural(n, 'Its', 'Their')} work days are left blank rather than guessed. ` +
    'This viewer does not recalculate the schedule, so the dates and float it shows are the ones P6 saved in the file.')];
}
