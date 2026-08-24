// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, computeLookahead } from '../../src/sections/lookahead.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE: lookahead-span-two-weeks.xer
// Data date 2026-03-02, so the windows are
//   W1 2026-03-02 → 03-08, W2 03-09 → 03-15, W3 03-16 → 03-22.
//
//   A100  03-04 → 03-10   spans W1 AND W2  (the double-count trap)
//   A110  03-03 → 03-05   W1 only
//   A120  03-17 → 03-19   W3 only
//   A130  06-01 → 06-05   incomplete, outside every window
//   A140  07-01 → 07-03   incomplete, outside every window
//   A150  complete        excluded from the lookahead entirely
//
// Buckets are 2 / 1 / 1. Three numbers are therefore all different, and the
// KPI must show the right one:
//   3 = distinct activities in the 21-day horizon  (the honest total)
//   4 = sum of the buckets                         (double-counts A100)
//   5 = every eligible incomplete activity         (what shipped, labelled
//       "activities across all 3 weeks": 291 against weeks of 14/19/28)
// ─────────────────────────────────────────────────────────────────────────────

function loadFixture() {
  return parseXer(readFileSync(join(FIX, 'lookahead-span-two-weeks.xer'), 'utf-8'));
}

function kpiByTitle(el, title) {
  return Array.from(el.querySelectorAll('.kpi'))
    .find(card => card.querySelector('.kpi-title')?.textContent === title);
}

describe('3-Week Lookahead total counts the union of the windows', () => {
  it('fixture sanity: one activity really does sit in two week buckets', () => {
    const { weekRows } = computeLookahead(loadFixture());
    expect(weekRows.map(w => w.length)).toEqual([2, 1, 1]);
    expect(weekRows[0].map(r => r.task_code).sort()).toEqual(['A100', 'A110']);
    expect(weekRows[1].map(r => r.task_code)).toEqual(['A100']);   // same activity again
    expect(weekRows[2].map(r => r.task_code)).toEqual(['A120']);
  });

  it('the total is the DISTINCT union: 3, not the 4-row sum of the buckets', () => {
    const { weekRows, activitiesInWindow } = computeLookahead(loadFixture());

    // Ground truth computed here, independently of the implementation.
    const distinctCodes = new Set();
    for (const week of weekRows) for (const row of week) distinctCodes.add(row.task_code);
    expect(distinctCodes.size).toBe(3);

    const bucketSum = weekRows.reduce((n, w) => n + w.length, 0);
    expect(bucketSum).toBe(4);

    expect(activitiesInWindow).toBe(3);
    expect(activitiesInWindow).toBe(distinctCodes.size);
    expect(activitiesInWindow).not.toBe(bucketSum);           // A100 counted once
  });

  it('the union is NOT the whole incomplete population', () => {
    const { activitiesInWindow, totalIncomplete } = computeLookahead(loadFixture());
    expect(totalIncomplete).toBe(5);              // A130/A140 sit past the horizon
    expect(activitiesInWindow).toBe(3);
    expect(activitiesInWindow).not.toBe(totalIncomplete);
  });

  it('KPI cards show each number under a label that matches it', () => {
    const el = render({ A: loadFixture(), B: null });

    const inWindow = kpiByTitle(el, 'In 3-Week Window');
    expect(inWindow).toBeTruthy();
    expect(inWindow.querySelector('.kpi-big').textContent).toBe('3');
    expect(inWindow.querySelector('.kpi-sub').textContent).toMatch(/distinct/i);

    const allIncomplete = kpiByTitle(el, 'All Incomplete');
    expect(allIncomplete).toBeTruthy();
    expect(allIncomplete.querySelector('.kpi-big').textContent).toBe('5');
    expect(allIncomplete.querySelector('.kpi-sub').textContent).toMatch(/whole schedule/i);
  });

  it('the old mislabelled KPI is gone', () => {
    const el = render({ A: loadFixture(), B: null });
    expect(kpiByTitle(el, 'Total in Lookahead')).toBeUndefined();
    expect(el.textContent).not.toContain('activities across all 3 weeks');
    // No card may show the whole-schedule figure under a 3-week label.
    for (const card of el.querySelectorAll('.kpi')) {
      const title = card.querySelector('.kpi-title')?.textContent || '';
      const sub   = card.querySelector('.kpi-sub')?.textContent || '';
      const big   = card.querySelector('.kpi-big')?.textContent || '';
      if (/3.week|all 3 weeks|weeks 1-3/i.test(`${title} ${sub}`)) {
        expect(big).toBe('3');
      }
    }
  });

  it('still renders the three week cards with their own row counts', () => {
    const el = render({ A: loadFixture(), B: null });
    expect(el.textContent).toMatch(/Week 1/);
    expect(el.textContent).toMatch(/Week 2/);
    expect(el.textContent).toMatch(/Week 3/);
    // A100 appears in the Week 1 and Week 2 tables — the union count is about
    // the KPI, not about hiding the activity from a week it really works in.
    const bodyRows = el.querySelectorAll('.lens-table tbody tr');
    expect(bodyRows.length).toBe(4);
  });
});
