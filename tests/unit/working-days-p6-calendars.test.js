// Working days are counted on each calendar's hours per day as P6 schedules
// it (2026-10-13), through lens-parser 0.4.0's getCalendarMap, not off the raw
// CALENDAR.day_hr_cnt.
//
// Measured on Primavera P6 Professional 23.12.1's own F9:
//  - a calendar whose every working day works the same hours H converts at H
//    when day_hr_cnt says otherwise (a Monday-Saturday 07:00-17:00 calendar
//    declaring 8 ran a 40 h activity over four days);
//  - an EMPTY record (no clndr_data) is P6's internal 8-hour Standard
//    whatever day_hr_cnt declares (records declaring 10, 6 and 24 h ran the
//    same 08:00-16:00 days).
//
// The tests marked [discriminating] fail on the viewer before this change,
// which divided by the raw day_hr_cnt. Every calendar string is built here.
import { describe, it, expect } from 'vitest';
import { parseXer, getTable } from '@criticalpathpartners/lens-parser';
import { workingDayContext, P6_DEFAULT_HOURS_PER_DAY } from '../../src/sections/_shared/working-days.js';

const TAB = '\t';
const TEN = '(0||0(s|07:00|f|17:00)())';
function monFri(slot) {
  let body = '';
  for (let d = 1; d <= 7; d++) body += `(0||${d}()(${d >= 2 && d <= 6 ? slot : ''}))`;
  return `(0||CalendarData()((0||DaysOfWeek()(${body}))(0||Exceptions()())))`;
}

function xer(calRows) {
  const lines = [
    ['ERMHDR', '23.12', '2026-10-13', 'Project', 'admin', 'admin', 'db', 'Project Management', 'USD'],
    ['%T', 'PROJECT'],
    ['%F', 'proj_id', 'proj_short_name', 'last_recalc_date', 'clndr_id'],
    ['%R', '1', 'NEUTRAL', '2026-10-05 08:00', calRows[0][0]],
    ['%T', 'CALENDAR'],
    ['%F', 'clndr_id', 'clndr_name', 'day_hr_cnt', 'week_hr_cnt', 'clndr_data'],
    ...calRows.map(r => ['%R', ...r]),
    ['%T', 'TASK'],
    ['%F', 'task_id', 'task_code', 'proj_id', 'clndr_id', 'target_drtn_hr_cnt', 'total_float_hr_cnt'],
    ...calRows.map((r, i) => ['%R', String(i + 1), `A${i + 1}`, '1', r[0], '40', '40']),
    ['%E'],
  ];
  return parseXer(lines.map(l => l.join(TAB)).join('\r\n') + '\r\n');
}

describe('working days on the hours per day P6 schedules by', () => {
  it('[discriminating] a calendar declaring 8 whose shifts work 10 converts at 10', () => {
    const A = xer([['S10', 'Ten hour shifts', '8', '40', monFri(TEN)]]);
    const ctx = workingDayContext(A);
    expect(ctx.hoursToDays(40, 'S10')).toBe(4);
    expect(ctx.divisorFor('S10')).toMatchObject({ hoursPerDay: 10, source: 'calendar' });
  });

  it('[discriminating] an empty record declaring 10 converts at P6\'s 8-hour Standard', () => {
    const A = xer([['E10', 'Empty ten', '10', '50', '']]);
    const ctx = workingDayContext(A);
    expect(ctx.hoursToDays(40, 'E10')).toBe(5);
    expect(ctx.divisorFor('E10')).toMatchObject({ hoursPerDay: 8, source: 'calendar' });
  });

  it('a calendar whose shifts work what it declares converts as before', () => {
    const A = xer([['C10', 'Ten hour day', '10', '50', monFri(TEN)]]);
    const ctx = workingDayContext(A);
    expect(ctx.hoursToDays(40, 'C10')).toBe(4);
  });

  it('a row stating no usable hours per day is still disclosed, at the P6 default', () => {
    const A = xer([['CBLANK', 'Blank day hours', '', '50', '']]);
    const ctx = workingDayContext(A);
    expect(ctx.divisorFor('CBLANK')).toMatchObject({ hoursPerDay: P6_DEFAULT_HOURS_PER_DAY, source: 'unusable' });
    expect(ctx.disclose(getTable(A, 'TASK')).warning).toMatch(/no usable hours per day/);
  });

  it('[discriminating] the note names the shifts as the source of a shift-hours divisor', () => {
    const A = xer([['S10', 'Ten hour shifts', '8', '40', monFri(TEN)]]);
    const d = workingDayContext(A).disclose(getTable(A, 'TASK'));
    expect(d.hoursPerDay).toEqual([10]);
    expect(d.note).toMatch(/10 hr per day/);
    expect(d.note).toMatch(/shifts/);
  });
});
