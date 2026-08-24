// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/schedule-quality.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer, getCalendarMap } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

// ─────────────────────────────────────────────────────────────────────────────
// P6 stores durations and float in HOURS. "Working days" therefore depends on
// the hours-per-day of the activity's OWN calendar. Testing raw hours against a
// baked-in 160 / 320 (i.e. 20 and 40 days at 8 hr/day) and then printing
// "working days" underneath is right only on an 8 hr calendar — and every
// previous fixture in this suite is 8 hr/day, which is why a green suite shipped
// the wrong thresholds.
//
// ten-hour-calendar.xer runs a 10 hr/day site calendar (day_hr_cnt = 10):
//   A1000  180 hr = 18 wd  ·  float 360 hr = 36 wd   → neither threshold
//   A1010  210 hr = 21 wd  ·  float 450 hr = 45 wd   → BOTH thresholds
//   A1020  150 hr = 15 wd  ·  float 200 hr = 20 wd   → neither threshold
//   A1030   40 hr          ·  float  40 hr           → calendar C99 is absent
//
// Correct answers: Long Duration 1, Large Float 1.
// The hard-coded answers: 180 > 160 and 210 > 160 → 2; 360 > 320 and 450 > 320
// → 2. A1000 is flagged as a 20-day-plus activity when it is an 18-day one.
// ─────────────────────────────────────────────────────────────────────────────

function loadFixture(name) {
  return parseXer(readFileSync(join(FIX, name), 'utf-8'), { filename: name });
}

function bigOf(el, title) {
  return [...el.querySelectorAll('.kpi')]
    .find(c => c.querySelector('.kpi-title')?.textContent === title)
    ?.querySelector('.kpi-big')?.textContent;
}

function subOf(el, title) {
  return [...el.querySelectorAll('.kpi')]
    .find(c => c.querySelector('.kpi-title')?.textContent === title)
    ?.querySelector('.kpi-sub')?.textContent;
}

describe('Schedule Quality converts hours through each activity calendar', () => {
  it('the fixture really is a 10 hr/day calendar', () => {
    // Guard the fixture: on an 8 hr/day calendar these tests are vacuous and
    // would pass against the hard-coded thresholds.
    const A = loadFixture('ten-hour-calendar.xer');
    const cal = getCalendarMap(A)['C10'];
    expect(cal).toBeTruthy();
    expect(Number(cal.hours_per_day)).toBe(10);
  });

  it('counts Long Duration in working days, not in 8-hour days', () => {
    const el = render({ A: loadFixture('ten-hour-calendar.xer'), B: null });
    expect(bigOf(el, 'Long Duration')).toBe('1');   // only the 21 wd activity
    expect(bigOf(el, 'Long Duration')).not.toBe('2'); // the 160 hr hard-code
  });

  it('counts Large Float in working days, not in 8-hour days', () => {
    const el = render({ A: loadFixture('ten-hour-calendar.xer'), B: null });
    expect(bigOf(el, 'Large Float')).toBe('1');     // only the 45 wd activity
    expect(bigOf(el, 'Large Float')).not.toBe('2'); // the 320 hr hard-code
  });

  it('an 18-working-day activity is not reported as over 20 working days', () => {
    // A1000 is 180 hr. That is 22.5 days at 8 hr and 18 days at 10 hr. Raising
    // its duration to 21 wd on its own calendar must flip the count, and only
    // then.
    const A = loadFixture('ten-hour-calendar.xer');
    expect(bigOf(render({ A, B: null }), 'Long Duration')).toBe('1');

    A.tables.TASK.records.find(t => t.task_code === 'A1000').target_drtn_hr_cnt = '210';
    expect(bigOf(render({ A, B: null }), 'Long Duration')).toBe('2');
  });

  it('a 36-working-day float is not reported as over 40 working days', () => {
    const A = loadFixture('ten-hour-calendar.xer');
    expect(bigOf(render({ A, B: null }), 'Large Float')).toBe('1');

    A.tables.TASK.records.find(t => t.task_code === 'A1000').total_float_hr_cnt = '450';
    expect(bigOf(render({ A, B: null }), 'Large Float')).toBe('2');
  });

  it('names the hours-per-day the thresholds were applied at', () => {
    // Without the divisor on the page, a reader cannot check the count.
    const el = render({ A: loadFixture('ten-hour-calendar.xer'), B: null });
    expect(el.textContent).toMatch(/10 hr per day/);
    expect(subOf(el, 'Long Duration')).toMatch(/per activity calendar/i);
    expect(subOf(el, 'Large Float')).toMatch(/per activity calendar/i);
  });

  it('labels Large Float in working days, not bare "days"', () => {
    const el = render({ A: loadFixture('ten-hour-calendar.xer'), B: null });
    expect(subOf(el, 'Large Float')).toMatch(/working days/i);
  });

  it('discloses the activity whose calendar is missing rather than guessing silently', () => {
    // A1030 names calendar C99, which is not in the file. Its hours are converted
    // at the P6 default 8 hr/day — a guess, and one that decides which side of a
    // threshold the activity lands on. It has to be on the face of the section.
    const el = render({ A: loadFixture('ten-hour-calendar.xer'), B: null });
    expect(el.textContent).toMatch(/1 activity names a calendar that is not in this file/);
    expect(el.textContent).toMatch(/8 hr per day/);
  });

  it('stays silent about missing calendars when every activity resolves', () => {
    const A = loadFixture('ten-hour-calendar.xer');
    A.tables.TASK.records.find(t => t.task_code === 'A1030').clndr_id = 'C10';
    const el = render({ A, B: null });
    expect(el.textContent).not.toMatch(/calendar that is not in this file/);
  });

  it('still reports correctly on an 8 hr/day file — the fix is not a rescale', () => {
    // minimal-3-task.xer is 8 hr/day with 40 hr durations and 0 / 16 hr float:
    // 5 wd and 0 / 2 wd. Nothing crosses either threshold, before or after.
    const el = render({ A: loadFixture('minimal-3-task.xer'), B: null });
    expect(bigOf(el, 'Long Duration')).toBe('0');
    expect(bigOf(el, 'Large Float')).toBe('0');
    expect(el.textContent).toMatch(/8 hr per day/);
  });
});
