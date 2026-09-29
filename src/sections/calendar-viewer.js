import { h } from '../lib/dom.js';
import { getTable, getCalendarMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';
import { calendarDecodeCards } from './_shared/calendar-decode.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function computeMetrics(A) {
  const calRows = getTable(A, 'CALENDAR');
  const calMap  = getCalendarMap(A);

  // Build ordered list of calendar entries
  const calendars = calRows.map(row => {
    const id   = row.clndr_id   || '';
    const info = calMap[id] || {};
    return {
      clndr_id:         id,
      clndr_name:       info.clndr_name        || row.clndr_name || id,
      work_day_indices: info.work_days          || [],
      work_day_names:   info.work_day_names     || info.work_days?.map(i => DAY_NAMES[i] || String(i)) || [],
      hours_per_day:    info.hours_per_day != null ? info.hours_per_day : (parseFloat(row.day_hr_cnt) || 8),
      holidays:         info.holidays           || [],
      special_workdays: info.special_workdays   || [],
      parse_incomplete: Boolean(info.parse_incomplete)
    };
  });

  // Default calendar = first one
  const defaultCal = calendars[0] || null;

  // Total holidays across all calendars
  const totalHolidays = calendars.reduce((sum, c) => sum + c.holidays.length, 0);

  return {
    calendars,
    defaultCal,
    totalHolidays
  };
}

// A calendar whose work week could not be read says so on its own card, not
// with a bare dash that looks like a calendar with no working days
// (see _shared/calendar-decode.js).
const WORK_WEEK_NOT_READ = 'Not read';

function workDaysText(cal) {
  if (cal.parse_incomplete) return WORK_WEEK_NOT_READ;
  return cal.work_day_names.length > 0
    ? cal.work_day_names.join(', ')
    : cal.work_day_indices.map(i => DAY_NAMES[i] || String(i)).join(', ') || '—';
}

const HOLIDAY_COLS      = [{ key: 'date', label: 'Date' }];
const SPECIAL_WD_COLS   = [{ key: 'date', label: 'Date' }];

function calendarCard(cal) {
  const innerKpis = [
    cal.parse_incomplete
      ? kpiCard({ title: 'Work days', big: WORK_WEEK_NOT_READ, sub: 'could not be read from the file', tone: 'amber' })
      : kpiCard({ title: 'Work days',     big: workDaysText(cal), sub: 'days of the week',        tone: 'ink' }),
    kpiCard({ title: 'Hours/day',     big: cal.hours_per_day,   sub: 'hr/day',                  tone: 'ink' }),
    kpiCard({ title: 'Holidays',      big: cal.holidays.length, sub: 'non-working exceptions',  tone: cal.holidays.length > 0 ? 'amber' : 'green' }),
    kpiCard({ title: 'Special workdays', big: cal.special_workdays.length, sub: 'extra working exceptions', tone: 'ink' })
  ];

  const children = [
    h('h3', {}, cal.clndr_name || cal.clndr_id),
    h('div', { class: 'kpi-grid' }, innerKpis)
  ];

  if (cal.holidays.length > 0) {
    const holidayRows = cal.holidays.map(d => ({ date: d })); // FX-021: list every holiday (no silent slice)
    children.push(
      h('div', { style: { marginTop: '12px' } }, [
        h('h4', { style: { marginBottom: '4px', fontWeight: '700' } }, 'Holidays'),
        dataTable({ columns: HOLIDAY_COLS, rows: holidayRows })
      ])
    );
  }

  if (cal.special_workdays.length > 0) {
    const spRows = cal.special_workdays.map(d => ({ date: d })); // FX-021: list every special workday
    children.push(
      h('div', { style: { marginTop: '12px' } }, [
        h('h4', { style: { marginBottom: '4px', fontWeight: '700' } }, 'Special workdays'),
        dataTable({ columns: SPECIAL_WD_COLS, rows: spRows })
      ])
    );
  }

  return h('div', { class: 'lens-card' }, children);
}

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Calendar Viewer'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const m = computeMetrics(A);

  const defaultWorkDayStr = m.defaultCal ? workDaysText(m.defaultCal) : '—';

  const kpis = [
    kpiCard({ title: 'Total Calendars', big: m.calendars.length, sub: 'CALENDAR records', tone: 'ink' }),
    kpiCard({ title: 'Default Work Days', big: defaultWorkDayStr, sub: m.defaultCal ? m.defaultCal.clndr_name : '—', tone: 'ink' }),
    kpiCard({ title: 'Default Hours/Day', big: m.defaultCal ? m.defaultCal.hours_per_day : '—', sub: 'hr/day', tone: 'ink' }),
    kpiCard({ title: 'Total Holidays', big: m.totalHolidays, sub: 'across all calendars', tone: m.totalHolidays > 0 ? 'amber' : 'green' })
  ];

  const calCards = m.calendars.map(calendarCard);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Calendar Viewer'),
    ...calendarDecodeCards(A),
    h('div', { class: 'kpi-grid' }, kpis),
    ...calCards
  ]);
}
