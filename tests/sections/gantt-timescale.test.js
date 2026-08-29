// @vitest-environment happy-dom
//
// REGRESSION SUITE — the Gantt must carry a timescale.
//
// The chart used to draw bars floating in blank space: no date axis, no month
// labels, no gridlines, no data-date line. A reader had no way to tell March
// from May without opening P6. These tests pin the three things a schedule
// reader orients by — tick positions, gridlines, and the data-date reference
// line — and prove the baseline ghost bars land on the same scale as the
// current bars.
//
// All expected dates below are real calendar facts (2 Feb 2026 IS a Monday;
// the month after Dec 2025 IS Jan 2026), so a tick engine that drifts a day
// or drops the year-end rollover fails against the calendar, not against a
// fixture built to match the code.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { computeTicks, computeTimeDomain, ganttSvg, render } from '../../src/sections/gantt.js';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

const iso = (d) => d.toISOString().slice(0, 10);

describe('computeTicks', () => {
  it('month ticks cross a year end: Nov 2025 to Mar 2026 yields Dec, Jan, Feb, Mar firsts', () => {
    const { unit, ticks } = computeTicks(new Date('2025-11-15'), new Date('2026-03-10'));
    expect(unit).toBe('month');
    expect(ticks.map(t => iso(t.date))).toEqual([
      '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01'
    ]);
    expect(ticks.map(t => t.label)).toEqual(['Dec 25', 'Jan 26', 'Feb 26', 'Mar 26']);
  });

  it('a domain starting exactly on a month first keeps that first as a tick', () => {
    const { unit, ticks } = computeTicks(new Date('2026-02-01'), new Date('2026-05-20'));
    expect(unit).toBe('month');
    expect(iso(ticks[0].date)).toBe('2026-02-01');
  });

  it('short span scales to weeks, every tick a Monday', () => {
    // 1 Feb to 15 Mar 2026 is 42 days. 1 Feb 2026 is a Sunday, so the first
    // Monday inside the domain is 2 Feb.
    const { unit, ticks } = computeTicks(new Date('2026-02-01'), new Date('2026-03-15'));
    expect(unit).toBe('week');
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) expect(t.date.getUTCDay()).toBe(1);
    expect(iso(ticks[0].date)).toBe('2026-02-02');
    expect(iso(ticks[ticks.length - 1].date)).toBe('2026-03-09');
    expect(ticks[0].label).toBe('2 Feb');
  });

  it('very long span scales to quarters on Jan/Apr/Jul/Oct firsts', () => {
    // A 2026 start to a mid-2029 finish, the shape of a multi-year program.
    const { unit, ticks } = computeTicks(new Date('2026-01-01'), new Date('2029-06-30'));
    expect(unit).toBe('quarter');
    for (const t of ticks) {
      expect(t.date.getUTCDate()).toBe(1);
      expect(t.date.getUTCMonth() % 3).toBe(0);
    }
    expect(iso(ticks[0].date)).toBe('2026-01-01');
    expect(iso(ticks[ticks.length - 1].date)).toBe('2029-04-01');
    expect(ticks[0].label).toBe('Q1 26');
    expect(ticks[4].label).toBe('Q1 27');
  });

  it('quarter phase is anchored to calendar quarters, not to the domain start', () => {
    // Domain starts mid-Q1; the first tick must be 1 Apr, never 1 Mar + 3n.
    const { unit, ticks } = computeTicks(new Date('2026-02-10'), new Date('2029-08-31'));
    expect(unit).toBe('quarter');
    expect(iso(ticks[0].date)).toBe('2026-04-01');
  });

  it('every tick lies inside the domain', () => {
    const cases = [
      [new Date('2025-11-15'), new Date('2026-03-10')],
      [new Date('2026-02-01'), new Date('2026-03-15')],
      [new Date('2026-01-01'), new Date('2029-06-30')]
    ];
    for (const [lo, hi] of cases) {
      const { ticks } = computeTicks(lo, hi);
      for (const t of ticks) {
        expect(+t.date).toBeGreaterThanOrEqual(+lo);
        expect(+t.date).toBeLessThanOrEqual(+hi);
      }
    }
  });
});

describe('computeTimeDomain', () => {
  it('spans min start to max finish, padded, and pulls in the data date', () => {
    // The minimal fixture's activities run 1-14 Feb 2026 with a data date of
    // 1 Jan 2026: the domain must reach past both.
    const acts = [
      { start: new Date('2026-02-01'), end: new Date('2026-02-07') },
      { start: new Date('2026-02-08'), end: new Date('2026-02-14') }
    ];
    const domain = computeTimeDomain(acts, new Date('2026-01-01'));
    expect(+domain.min).toBeLessThan(+new Date('2026-01-01'));
    expect(+domain.max).toBeGreaterThan(+new Date('2026-02-14'));
  });

  it('includes baseline dates so ghost bars can never fall off the scale', () => {
    const acts = [{
      start: new Date('2026-03-09'), end: new Date('2026-03-13'),
      baseline_start: new Date('2026-01-12'), baseline_end: new Date('2026-01-16')
    }];
    const domain = computeTimeDomain(acts, null);
    expect(+domain.min).toBeLessThan(+new Date('2026-01-12'));
  });

  it('returns null when nothing carries a date', () => {
    expect(computeTimeDomain([], null)).toBeNull();
    expect(computeTimeDomain([{ task_name: 'no dates' }], null)).toBeNull();
  });
});

describe('Gantt timescale rendering', () => {
  const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));

  it('draws tick labels and vertical gridlines aligned to the ticks', () => {
    const el = render({ A, B: null });
    const grid = [...el.querySelectorAll('line.gantt-grid')];
    const labels = [...el.querySelectorAll('text.gantt-tick-label')];
    expect(grid.length).toBeGreaterThan(0);
    expect(labels.length).toBeGreaterThan(0);
    // Gridlines are vertical and strictly left-to-right.
    let prev = -Infinity;
    for (const g of grid) {
      expect(g.getAttribute('x1')).toBe(g.getAttribute('x2'));
      const x = parseFloat(g.getAttribute('x1'));
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
    // Every label sits on a gridline x (labels are offset +3px).
    const gridXs = grid.map(g => parseFloat(g.getAttribute('x1')));
    for (const t of labels) {
      const near = gridXs.some(x => Math.abs(parseFloat(t.getAttribute('x')) - 3 - x) < 0.01);
      expect(near).toBe(true);
    }
  });

  it('scales the fixture (data date 1 Jan to mid-Feb 2026) to weekly Monday ticks', () => {
    const el = render({ A, B: null });
    const labels = [...el.querySelectorAll('text.gantt-tick-label')].map(t => t.textContent);
    // 5 Jan 2026 is the first Monday after the padded domain opens.
    expect(labels).toContain('5 Jan');
    expect(labels).toContain('2 Feb');
  });

  it('draws one data-date line with a label, inside the timeline', () => {
    const el = render({ A, B: null });
    const dd = el.querySelectorAll('line.gantt-datadate');
    expect(dd.length).toBe(1);
    const x = parseFloat(dd[0].getAttribute('x1'));
    expect(x).toBeGreaterThan(220); // right of the name column
    const label = el.querySelector('text.gantt-datadate-label');
    expect(label.textContent).toBe('Data date 1-Jan-26');
  });

  it('omits the data-date line when the model has no PROJECT recalc date', () => {
    const acts = [{ task_id: '1', task_name: 'Activity One',
      start: new Date('2026-02-01'), end: new Date('2026-02-07'), critical: false }];
    const el = ganttSvg({ activities: acts, dataDate: null });
    expect(el.querySelectorAll('line.gantt-datadate').length).toBe(0);
    expect(el.querySelectorAll('rect.gantt-bar').length).toBe(1);
  });

  it('keeps the empty states', () => {
    expect(ganttSvg({ activities: [] }).textContent).toMatch(/no activities/i);
    expect(ganttSvg({ activities: [{ task_id: '1' }] }).textContent).toMatch(/no activities/i);
  });
});

describe('baseline ghost bars render against the same scale', () => {
  // B is a genuine re-export of A (renumbered surrogates, stable task_code),
  // so every activity carries baseline dates equal to its current dates. On a
  // shared scale each ghost bar must therefore sit at exactly its bar's x.
  const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
  const B = reexport(A);

  it('fixture sanity: the pair is a real re-export', () => {
    assertDivergentSurrogates(A, B);
  });

  it('ghost bars share the x mapping with the current bars', () => {
    const el = render({ A, B });
    const chk = el.querySelector('#gantt-chk-baseline');
    chk.checked = true;
    chk.dispatchEvent(new Event('change'));

    const bars = [...el.querySelectorAll('rect.gantt-bar')];
    const ghosts = [...el.querySelectorAll('rect.gantt-baseline')];
    expect(bars.length).toBe(2);
    expect(ghosts.length).toBe(2);
    for (let i = 0; i < bars.length; i++) {
      const bx = parseFloat(bars[i].getAttribute('x'));
      const gx = parseFloat(ghosts[i].getAttribute('x'));
      const bw = parseFloat(bars[i].getAttribute('width'));
      const gw = parseFloat(ghosts[i].getAttribute('width'));
      expect(gx).toBeCloseTo(bx, 6);
      expect(gw).toBeCloseTo(bw, 6);
    }
  });

  it('ghost bars sit between the gridlines that bracket their dates', () => {
    const el = render({ A, B });
    const chk = el.querySelector('#gantt-chk-baseline');
    chk.checked = true;
    chk.dispatchEvent(new Event('change'));

    // Activity One runs 1-7 Feb 2026. Its ghost bar must start left of the
    // 2 Feb Monday gridline and end right of it.
    const labels = [...el.querySelectorAll('text.gantt-tick-label')];
    const feb2 = labels.find(t => t.textContent === '2 Feb');
    expect(feb2).toBeTruthy();
    const feb2x = parseFloat(feb2.getAttribute('x')) - 3; // label offset
    const ghost = el.querySelectorAll('rect.gantt-baseline')[0];
    const gx = parseFloat(ghost.getAttribute('x'));
    const gEnd = gx + parseFloat(ghost.getAttribute('width'));
    expect(gx).toBeLessThan(feb2x);
    expect(gEnd).toBeGreaterThan(feb2x);
  });
});
