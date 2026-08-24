// @vitest-environment happy-dom
//
// Cross-schedule matching must key on the stable Activity ID (task_code), not
// on the surrogate task_id P6 reassigns on every export.
//
// WHY THIS FILE WAS PART OF THE PROBLEM
// ------------------------------------
// It used to define its own reexport() helper that renumbered TASK.task_id and
// nothing else. TASKPRED still pointed at the OLD ids, so B was not a re-export
// at all — it was a file with 42 dangling relationship endpoints. Under a
// describe block titled "cross-schedule matching keys on stable task_code",
// that helper made relationship matching look covered while the shipped product
// reported 655 added / 535 deleted on a pair that actually shares 472.
//
// The helper is gone. Both sides now come from tests/fixtures/reexport.js,
// which renumbers task_id everywhere it is referenced — TASK, both TASKPRED
// endpoints, TASKACTV, TASKRSRC — and reverses TASK row order so a section that
// matches by array position cannot pass either.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseXer, getTable } from '@criticalpathpartners/lens-parser';
import { SAMPLE_XER } from '../../src/sample/sample-schedule.js';
import { buildActivities } from '../../src/sections/gantt.js';
import { diffModels } from '../../src/sections/_shared/diff-models.js';
import { indexTasks as periodIndexTasks } from '../../src/sections/period-reporting.js';
import { reexport, identityOverlap, assertDivergentSurrogates } from '../fixtures/reexport.js';

const parseA = () => parseXer(SAMPLE_XER, { filename: 'A.xer' });
const parseB = () => reexport(parseXer(SAMPLE_XER, { filename: 'B.xer' }));

describe('cross-schedule matching keys on stable task_code, not surrogate task_id', () => {
  it('fixture sanity: EVERY task_id moved, EVERY task_code stayed', () => {
    const A = parseA();
    const B = parseB();
    const taskCount = getTable(A, 'TASK').length;
    expect(taskCount).toBeGreaterThan(0);

    const overlap = assertDivergentSurrogates(A, B, { minSharedCodes: taskCount });
    expect(overlap.sharedTaskIds).toBe(0);        // matching on task_id can only give 0
    expect(overlap.sharedCodes).toBe(taskCount);  // matching on task_code must give all
  });

  it('fixture sanity: the re-export left NO dangling relationship endpoint', () => {
    // The old local helper renumbered TASK only. Every TASKPRED row in B then
    // referenced an id that no longer existed, so relationship matching could
    // not be exercised at all — the assertion that mattered never ran.
    const B = parseB();
    const ids = new Set(getTable(B, 'TASK').map(t => String(t.task_id)));
    const rels = getTable(B, 'TASKPRED');
    expect(rels.length).toBeGreaterThan(0);
    for (const r of rels) {
      expect(ids.has(String(r.task_id)), `successor ${r.task_id} has no TASK row`).toBe(true);
      expect(ids.has(String(r.pred_task_id)), `predecessor ${r.pred_task_id} has no TASK row`).toBe(true);
    }
  });

  it('gantt: baseline overlay matches EVERY activity across a renumbered task_id', () => {
    const acts = buildActivities(parseA(), parseB(), /* criticalOnly */ false, /* showBaseline */ true);
    expect(acts.length).toBeGreaterThan(0);
    const baselineCount = acts.filter(a => a.baseline_start).length;
    expect(baselineCount).toBe(acts.length); // "Baseline Matched" KPI == activity count
  });

  it('gantt: match is genuinely via task_code (renumber the code too → no match)', () => {
    const A = parseA();
    const B = parseB();
    for (const t of getTable(B, 'TASK')) t.task_code = String(t.task_code) + '_X';
    // Now NOTHING is shared: not the surrogate, not the Activity ID.
    expect(identityOverlap(A, B)).toEqual({ sharedCodes: 0, sharedTaskIds: 0 });
    const acts = buildActivities(A, B, false, true);
    expect(acts.filter(a => a.baseline_start).length).toBe(0);
  });

  it('diffModels: identical schedules with renumbered task_id => 0 added / 0 deleted', () => {
    const d = diffModels(parseA(), parseB());
    expect(d.counts.tasksAdded).toBe(0);
    expect(d.counts.tasksDeleted).toBe(0);
    expect(d.counts.activitiesChanged).toBe(0);
  });

  it('diffModels: every relationship is RETAINED across the re-export', () => {
    // This is the assertion the dangling-endpoint helper made impossible. With
    // endpoints renumbered consistently, a re-export must show zero churn.
    const A = parseA();
    const B = parseB();
    const relCount = getTable(A, 'TASKPRED').length;
    expect(relCount).toBeGreaterThan(0);

    const d = diffModels(A, B);
    expect(d.counts.relsRetained).toBe(relCount);
    expect(d.counts.relsAdded).toBe(0);
    expect(d.counts.relsDeleted).toBe(0);
    // and nothing was quietly dropped on the way there
    expect(d.counts.relsUnresolvedA).toBe(0);
    expect(d.counts.relsUnresolvedB).toBe(0);
    expect(d.counts.relsMalformedA).toBe(0);
    expect(d.counts.relsMalformedB).toBe(0);
  });

  it('period-reporting indexTasks: A and B share every key across a renumbered task_id', () => {
    const ia = periodIndexTasks(parseA());
    const ib = periodIndexTasks(parseB());
    expect(ia.size).toBeGreaterThan(0);
    let matched = 0;
    for (const k of ia.keys()) if (ib.has(k)) matched++;
    expect(matched).toBe(ia.size); // every current activity matched its prior by task_code
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REAL QA PAIR — the renumbering simulated above, as P6 actually produced it.
// Skipped when the files are not on this machine; LENS_QA_XER_DIR overrides.
// ─────────────────────────────────────────────────────────────────────────────

const QA_DIR = process.env.LENS_QA_XER_DIR || 'C:/Users/danaf/Downloads/.tmp.driveupload';
const QA_CURRENT = `${QA_DIR}/Georgian-College-current.xer`;
const QA_BASELINE = `${QA_DIR}/Georgian-College-baseline.xer`;
const HAVE_QA = existsSync(QA_CURRENT) && existsSync(QA_BASELINE);

describe.skipIf(!HAVE_QA)('real QA pair — Gantt baseline overlay', () => {
  const A = HAVE_QA ? parseXer(readFileSync(QA_CURRENT, 'latin1')) : null;
  const B = HAVE_QA ? parseXer(readFileSync(QA_BASELINE, 'latin1')) : null;

  it('is the real condition: 318 Activity IDs shared, zero task_ids shared', () => {
    expect(assertDivergentSurrogates(A, B, { minSharedCodes: 318 }))
      .toEqual({ sharedCodes: 318, sharedTaskIds: 0 });
  });

  it('matches the QA-confirmed 317 baseline overlays', () => {
    // The shipped build matched 0. 317 not 318 because one shared activity
    // carries no dates and is not drawn on the Gantt at all.
    const acts = buildActivities(A, B, /* criticalOnly */ false, /* showBaseline */ true);
    expect(acts.length).toBe(404);
    expect(acts.filter(a => a.baseline_start).length).toBe(317);
  });
});
