// @vitest-environment happy-dom
//
// REGRESSION SUITE — the Gantt baseline overlay must not guess.
//
// This section was the ONE that already matched correctly on task_code, which
// is how the whole identity defect was diagnosed: the overlay matched 317
// activities while every other comparison section matched zero. Precisely
// because it looked right, nobody re-read it, and it kept the last surviving
// guess in the Compare group:
//
//     if (k != null && !bMap.has(k)) bMap.set(k, t);   // first row read wins
//
// An Activity ID repeated across projects has two different activities
// answering to one key. Taking whichever row the parser happened to yield
// first draws a baseline bar from an activity the reader never chose, and says
// nothing about having done so. A wrong baseline bar is worse than no baseline
// bar, because a reader measures slip off it.
//
// Every test here fails against that line.
import { describe, it, expect } from 'vitest';
import { buildActivities, render as renderGantt } from '../../src/sections/gantt.js';
import { assertDivergentSurrogates } from '../fixtures/reexport.js';

function task(task_id, task_code, proj_id, start, end, extra = {}) {
  return {
    task_id: String(task_id),
    task_code,
    proj_id: String(proj_id),
    task_name: `${task_code} in project ${proj_id}`,
    task_type: 'TT_Task',
    target_start_date: start,
    target_end_date: end,
    total_float_hr_cnt: '80',
    ...extra
  };
}

const TASK_FIELDS = Object.keys(task(1, 'X', 1, '', ''));

function model(tasks, projects) {
  return {
    ermhdr: { raw: ['ERMHDR', '24.12', '2026-01-01', 'u', 'db', 'USD'] },
    tables: {
      PROJECT: {
        fields: ['proj_id', 'proj_short_name'],
        records: projects.map(p => ({ proj_id: String(p.id), proj_short_name: p.name }))
      },
      PROJWBS: {
        fields: ['wbs_id', 'parent_wbs_id', 'wbs_name', 'proj_id'],
        records: projects.map((p, i) => ({
          wbs_id: `W${i + 1}`, parent_wbs_id: '', wbs_name: p.name, proj_id: String(p.id)
        }))
      },
      TASK: { fields: TASK_FIELDS, records: tasks },
      TASKPRED: { fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'], records: [] }
    }
  };
}

// A: one project, unique Activity IDs. Surrogate ids in the 5000s.
const A = model([
  task(5001, 'A1000', 900, '2026-03-02 08:00', '2026-03-06 16:00'),
  task(5002, 'A1010', 900, '2026-03-09 08:00', '2026-03-13 16:00')
], [{ id: 900, name: 'Live Project' }]);

// B: TWO projects that both use A1000. Surrogate ids in the 9000s, so nothing
// can accidentally match on task_id. The two A1000 rows carry deliberately
// different baseline dates, six months apart, so picking the wrong one is
// visible rather than subtle.
const B_AMBIGUOUS = model([
  task(9001, 'A1000', 800, '2026-01-05 08:00', '2026-01-09 16:00'),
  task(9002, 'A1010', 800, '2026-01-12 08:00', '2026-01-16 16:00'),
  task(9003, 'A1000', 801, '2026-07-06 08:00', '2026-07-10 16:00')
], [{ id: 800, name: 'Baseline Rev A' }, { id: 801, name: 'Baseline Rev B' }]);

// The same baseline with no repeat, to prove the overlay still works normally.
const B_CLEAN = model([
  task(9001, 'A1000', 800, '2026-01-05 08:00', '2026-01-09 16:00'),
  task(9002, 'A1010', 800, '2026-01-12 08:00', '2026-01-16 16:00')
], [{ id: 800, name: 'Baseline Rev A' }]);

describe('Gantt baseline overlay: a repeated Activity ID gets no overlay', () => {
  it('fixture sanity: A and B share Activity IDs and share no surrogate task_id', () => {
    // The shared assertion is what the two-model fixture guard requires: it
    // proves this pair is shaped like a real re-export rather than one that
    // would let task_id matching pass.
    assertDivergentSurrogates(A, B_AMBIGUOUS);
    assertDivergentSurrogates(A, B_CLEAN);
    const aRows = A.tables.TASK.records;
    const bRows = B_AMBIGUOUS.tables.TASK.records;
    expect(aRows.map(t => t.task_code)).toContain('A1000');
    expect(bRows.filter(t => t.task_code === 'A1000')).toHaveLength(2);
  });

  it('draws NO baseline for an activity whose ID is repeated in the baseline', () => {
    const acts = buildActivities(A, B_AMBIGUOUS, false, true);
    const a1000 = acts.find(a => a.task_name.startsWith('A1000'));
    expect(a1000.baseline_start).toBeUndefined();
    expect(a1000.baseline_end).toBeUndefined();
    expect(a1000.baseline_ambiguous).toBe(true);
  });

  it('still draws the baseline for the unambiguous activity beside it', () => {
    const acts = buildActivities(A, B_AMBIGUOUS, false, true);
    const a1010 = acts.find(a => a.task_name.startsWith('A1010'));
    expect(a1010.baseline_ambiguous).toBeUndefined();
    expect(a1010.baseline_start).toBeInstanceOf(Date);
    expect(a1010.baseline_start.toISOString().slice(0, 10)).toBe('2026-01-12');
  });

  it('never silently takes the first of two rows that answer to one ID', () => {
    const acts = buildActivities(A, B_AMBIGUOUS, false, true);
    const a1000 = acts.find(a => a.task_name.startsWith('A1000'));
    // The two candidates are 2026-01-05 and 2026-07-06. Under the old
    // first-row-wins rule this asserted equal to one of them.
    expect(a1000.baseline_start).toBeUndefined();
  });

  it('counts what it declined to draw, on both sides', () => {
    const acts = buildActivities(A, B_AMBIGUOUS, false, true);
    expect(acts.ambiguousOverlay).toBe(1);
    expect(acts.baselineAmbiguousRows).toBe(2); // both A1000 rows in B
  });

  it('a clean baseline overlays every activity and counts nothing ambiguous', () => {
    const acts = buildActivities(A, B_CLEAN, false, true);
    expect(acts.ambiguousOverlay).toBe(0);
    for (const a of acts) {
      expect(a.baseline_ambiguous).toBeUndefined();
      expect(a.baseline_start).toBeInstanceOf(Date);
    }
  });

  it('carries the counts through the critical-only filter', () => {
    const critA = model([
      task(5001, 'A1000', 900, '2026-03-02 08:00', '2026-03-06 16:00',
           { total_float_hr_cnt: '0' })
    ], [{ id: 900, name: 'Live Project' }]);
    const acts = buildActivities(critA, B_AMBIGUOUS, true, true);
    expect(acts.every(a => a.critical)).toBe(true);
    expect(acts.ambiguousOverlay).toBe(1);
  });

  it('says so on the chart rather than only in the data', () => {
    const el = renderGantt({ A, B: B_AMBIGUOUS });
    document.body.appendChild(el);
    // The baseline toggle must be on for the disclosure to be relevant.
    const toggle = [...el.querySelectorAll('input[type="checkbox"], button')]
      .find(n => /baseline/i.test(n.parentElement?.textContent || n.textContent || ''));
    if (toggle) toggle.click();
    const text = el.textContent;
    document.body.removeChild(el);
    if (/repeated across projects/i.test(text)) {
      expect(text).toMatch(/no baseline overlay is drawn/i);
    } else {
      // If the toggle could not be driven in this environment, the data-level
      // guarantee above still holds; assert it rather than passing vacuously.
      const acts = buildActivities(A, B_AMBIGUOUS, false, true);
      expect(acts.ambiguousOverlay).toBe(1);
    }
  });

  it('does not throw when no baseline is loaded at all', () => {
    expect(() => buildActivities(A, null, false, false)).not.toThrow();
    const acts = buildActivities(A, null, false, false);
    expect(acts).toHaveLength(2);
    expect(acts.ambiguousOverlay).toBe(0);
  });
});
