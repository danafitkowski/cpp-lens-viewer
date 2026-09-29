// @vitest-environment happy-dom
//
// A calendar whose work week the parser could not read is named on screen.
//
// lens-parser sets parse_incomplete when a non-empty clndr_data decodes to no
// working days. The Calendar Viewer used to print a bare dash for that
// calendar's work days, the same dash a reader sees for a calendar that simply
// has none, and the downloadable Calendar Report did the same. Nothing named
// the calendar or said the week was unread.
//
// The finding says what THIS viewer does and nothing more. The viewer does not
// recalculate the schedule and never uses a calendar's work week, so it must
// not claim a substituted Monday to Friday week: it says the work days are
// left blank and that dates and float are the ones P6 saved.
//
// THE FIXTURE (synthetic)
//
//   C1  5-Day            start-first slots  (s|08:00|f|16:00)  decodes Mon-Fri
//   C2  Six Day Shift    finish-first slots (f|16:00|s|08:00)  decodes Mon-Sat
//                        (lens-parser 35a55ba; before it, this one was unread)
//   C3  Night Shift      slot tokens the parser does not know   UNREAD
//   C4  (no name)        slot tokens the parser does not know   UNREAD, named by ID
//   C5  Blank            empty clndr_data                       not a decode failure:
//                        the parser returns early on an empty string, as the
//                        canonical Python parser does, so it is not flagged
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { undecodedCalendars, calendarDecodeCards } from '../../src/sections/_shared/calendar-decode.js';
import { render as renderCalendars } from '../../src/sections/calendar-viewer.js';
import { SAMPLE_XER } from '../../src/sample/sample-schedule.js';

vi.mock('../../src/lib/download.js', () => ({ download: vi.fn() }));
import { download } from '../../src/lib/download.js';
import { render as renderUtilities } from '../../src/sections/xer-utilities.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

const DAYS = (slot) => {
  const day = (n, on) => on ? `(0||${n}()((0||0(${slot})())))` : `(0||${n}()())`;
  return [day(1, false), day(2, true), day(3, true), day(4, true), day(5, true), day(6, true), day(7, slot.startsWith('f|'))].join('');
};
const CAL = (slot) => `(0||CalendarData()((0||DaysOfWeek()(${DAYS(slot)}))(0||Exceptions()((0||0(d|46192)())))))`;

const START_FIRST = CAL('s|08:00|f|16:00');
const FINISH_FIRST = CAL('f|16:00|s|08:00');
const UNKNOWN_SLOTS = CAL('b|08:00|e|16:00');

function xer(calRows) {
  return [
    'ERMHDR\t18.8\t2026-09-29\tProject\tadmin\tSynthetic\tdb\tPM\tCAD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date',
    '%R\t1\tSYNTH\t2026-09-01 08:00',
    '%T\tCALENDAR',
    '%F\tclndr_id\tclndr_name\tday_hr_cnt\tweek_hr_cnt\tclndr_data',
    ...calRows.map(r => `%R\t${r.join('\t')}`),
    '%T\tTASK',
    '%F\ttask_id\ttask_code\ttask_name\ttask_type\tstatus_code\tclndr_id\ttarget_drtn_hr_cnt\ttotal_float_hr_cnt',
    '%R\t1\tA1\tFirst\tTT_Task\tTK_NotStart\tC1\t40\t0',
    ''
  ].join('\n');
}

const MIXED = xer([
  ['C1', '5-Day', '8', '40', START_FIRST],
  ['C2', 'Six Day Shift', '8', '48', FINISH_FIRST],
  ['C3', 'Night Shift', '10', '50', UNKNOWN_SLOTS],
  ['C4', '', '8', '40', UNKNOWN_SLOTS],
  ['C5', 'Blank', '8', '40', '']
]);

const CLEAN = xer([
  ['C1', '5-Day', '8', '40', START_FIRST],
  ['C2', 'Six Day Shift', '8', '48', FINISH_FIRST]
]);

describe('undecodedCalendars', () => {
  it('names exactly the calendars whose work week did not decode, in table order', () => {
    const A = parseXer(MIXED);
    expect(undecodedCalendars(A)).toEqual([
      { clndr_id: 'C3', clndr_name: 'Night Shift' },
      { clndr_id: 'C4', clndr_name: '' }
    ]);
  });

  it('does not flag a finish-first calendar, which decodes', () => {
    expect(undecodedCalendars(parseXer(CLEAN))).toEqual([]);
  });

  it('is empty for no model', () => {
    expect(undecodedCalendars(null)).toEqual([]);
    expect(calendarDecodeCards(null)).toEqual([]);
  });

  it('finds nothing in the bundled sample or in any committed fixture', () => {
    expect(undecodedCalendars(parseXer(SAMPLE_XER))).toEqual([]);
    for (const f of readdirSync(FIX).filter(n => n.endsWith('.xer'))) {
      const A = parseXer(readFileSync(join(FIX, f), 'utf-8'));
      expect(undecodedCalendars(A), f).toEqual([]);
    }
  });
});

describe('calendarDecodeCards', () => {
  it('renders nothing when every calendar was read', () => {
    expect(calendarDecodeCards(parseXer(CLEAN))).toEqual([]);
  });

  it('names each unread calendar, by name and ID, or by ID alone', () => {
    const [card] = calendarDecodeCards(parseXer(MIXED));
    expect(card.className).toContain('lens-warn');
    expect(card.textContent).toBe(
      'Calendar finding: the work week of 2 calendars in this file could not be read: ' +
      'Night Shift (ID C3); ID C4. Their work days are left blank rather than guessed. ' +
      'This viewer does not recalculate the schedule, so the dates and float it shows are the ones P6 saved in the file.'
    );
  });

  it('uses the singular for one calendar', () => {
    const A = parseXer(xer([['C3', 'Night Shift', '10', '50', UNKNOWN_SLOTS]]));
    const [card] = calendarDecodeCards(A);
    expect(card.textContent).toContain('the work week of 1 calendar in this file could not be read: Night Shift (ID C3).');
    expect(card.textContent).toContain('Its work days are left blank');
  });

  it('does not claim a substituted week the viewer never computes on', () => {
    const [card] = calendarDecodeCards(parseXer(MIXED));
    expect(card.textContent).not.toMatch(/Mon|Fri|substitut|8 ?h/i);
  });
});

describe('Calendar Viewer', () => {
  it('shows the finding above the calendar cards', () => {
    const el = renderCalendars({ A: parseXer(MIXED), B: null });
    const finding = el.querySelector('.lens-calendar-decode');
    expect(finding).not.toBeNull();
    expect(finding.textContent).toContain('Night Shift (ID C3); ID C4');
    const kpiGrid = el.querySelector('.kpi-grid');
    expect(finding.compareDocumentPosition(kpiGrid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('marks the unread calendar\'s own card instead of printing a bare dash', () => {
    const el = renderCalendars({ A: parseXer(MIXED), B: null });
    const card = [...el.querySelectorAll('.lens-card')].find(c => c.querySelector('h3')?.textContent === 'Night Shift');
    expect(card.textContent).toContain('Not read');
    expect(card.textContent).toContain('could not be read from the file');
    // Its hours per day still come from the file.
    expect(card.textContent).toContain('10');
  });

  it('still lists the work days of the calendars it did read', () => {
    const el = renderCalendars({ A: parseXer(MIXED), B: null });
    const six = [...el.querySelectorAll('.lens-card')].find(c => c.querySelector('h3')?.textContent === 'Six Day Shift');
    expect(six.textContent).toContain('Monday, Tuesday, Wednesday, Thursday, Friday, Saturday');
    expect(six.textContent).not.toContain('Not read');
  });

  it('shows no finding on a clean file', () => {
    const el = renderCalendars({ A: parseXer(CLEAN), B: null });
    expect(el.querySelector('.lens-calendar-decode')).toBeNull();
    expect(el.textContent).not.toContain('Not read');
  });
});

describe('Calendar Report download', () => {
  it('says the work week could not be read instead of printing a dash', () => {
    download.mockClear();
    const el = renderUtilities({ A: parseXer(MIXED), B: null });
    const btn = [...el.querySelectorAll('button')].find(b => /calendar report/i.test(b.textContent));
    btn.click();
    expect(download).toHaveBeenCalledTimes(1);
    const html = download.mock.calls[0][0];
    const night = html.slice(html.indexOf('<h2>Night Shift</h2>'));
    expect(night).toMatch(/^<h2>Night Shift<\/h2>[\s\S]*?Work days: could not be read from the file/);
    const five = html.slice(html.indexOf('<h2>5-Day</h2>'));
    expect(five).toMatch(/^<h2>5-Day<\/h2>[\s\S]*?Work days: Monday, Tuesday, Wednesday, Thursday, Friday</);
  });
});
