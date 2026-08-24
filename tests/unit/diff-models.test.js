import { describe, it, expect } from 'vitest';
import { diffModels } from '../../src/sections/_shared/diff-models.js';
import { assertDivergentSurrogates } from '../fixtures/reexport.js';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE CONDITION — two SEPARATE P6 exports, not one file read twice.
//
// The old fixtures here handed both models the same task_id values ('1', '2')
// and gave neither a task_code. That is a condition P6 never produces: it
// reassigns the surrogate task_id on every export and the Activity ID
// (task_code) is what stays put. Because the fixture matched on a key that
// happened to agree, all nine tests passed with the root-cause defect in place
// — a matcher keyed on task_id looked correct here while matching 0 of 318
// activities on the real Georgian College pair.
//
// Every model below therefore draws its surrogates from a side-specific range:
// the current export numbers in the 9000s, the prior export in the 100s. The
// two share task_code and nothing else. The fixture-sanity test at the top
// refuses the pair if that ever stops being true.
// ─────────────────────────────────────────────────────────────────────────────

/** Surrogate task_id per side. Same activity, different number in each export. */
const SURROGATE = {
  A: { A1000: '9001', A1010: '9002' },   // current / updated export
  B: { A1000: '101',  A1010: '102'  }    // prior / baseline export
};

/**
 * One TASK row for one side of the comparison.
 *
 * @param {'A'|'B'} side
 * @param {string} code - Activity ID (task_code), stable across exports
 * @param {object} [extra]
 */
function task(side, code, extra = {}) {
  return {
    task_id: SURROGATE[side][code],
    task_code: code,
    task_name: `Activity ${code}`,
    ...extra
  };
}

/**
 * One TASKPRED row, with both endpoints in the surrogate space of its OWN side.
 *
 * @param {'A'|'B'} side
 * @param {string} predCode
 * @param {string} succCode
 * @param {string} [pred_type]
 */
function rel(side, predCode, succCode, pred_type = 'PR_FS') {
  return {
    task_id: SURROGATE[side][succCode],        // TASKPRED.task_id IS the successor
    pred_task_id: SURROGATE[side][predCode],
    pred_type,
    lag_hr_cnt: '0'
  };
}

function model(tasks, rels = []) {
  return {
    tables: {
      TASK: { fields: ['task_id', 'task_code', 'task_name', 'target_end_date'], records: tasks },
      TASKPRED: { fields: ['task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'], records: rels }
    }
  };
}

describe('diffModels', () => {
  it('fixture sanity: the two models share task_code and NO task_id', () => {
    const A = model([task('A', 'A1000'), task('A', 'A1010')],
                    [rel('A', 'A1000', 'A1010')]);
    const B = model([task('B', 'A1000'), task('B', 'A1010')],
                    [rel('B', 'A1000', 'A1010')]);
    const overlap = assertDivergentSurrogates(A, B, { minSharedCodes: 2 });
    expect(overlap.sharedTaskIds).toBe(0);
    expect(overlap.sharedCodes).toBe(2);

    // And the relationship endpoints stay inside their own file's id space —
    // a re-export renumbers TASKPRED too, it does not leave endpoints dangling.
    for (const [m, side] of [[A, 'A'], [B, 'B']]) {
      const ids = new Set(m.tables.TASK.records.map(t => t.task_id));
      for (const r of m.tables.TASKPRED.records) {
        expect(ids.has(r.task_id), `${side} successor endpoint`).toBe(true);
        expect(ids.has(r.pred_task_id), `${side} predecessor endpoint`).toBe(true);
      }
    }
  });

  it('detects added activities', () => {
    const A = model([task('A', 'A1000'), task('A', 'A1010')]);
    const B = model([task('B', 'A1000')]);
    const d = diffModels(A, B);
    expect(d.tasks.added.map(t => t.task_code)).toEqual(['A1010']);
    // The row handed back is A's row, carrying A's surrogate — not B's.
    expect(d.tasks.added.map(t => t.task_id)).toEqual(['9002']);
    expect(d.tasks.deleted).toEqual([]);
  });

  it('detects deleted activities', () => {
    const A = model([task('A', 'A1000')]);
    const B = model([task('B', 'A1000'), task('B', 'A1010')]);
    const d = diffModels(A, B);
    expect(d.tasks.deleted.map(t => t.task_code)).toEqual(['A1010']);
    expect(d.tasks.deleted.map(t => t.task_id)).toEqual(['102']);
    expect(d.tasks.added).toEqual([]);
  });

  it('detects name changes', () => {
    const A = model([task('A', 'A1000', { task_name: 'Renamed' })]);
    const B = model([task('B', 'A1000', { task_name: 'Original' })]);
    const d = diffModels(A, B);
    const nameChange = d.tasks.changed.find(c => c.field === 'task_name');
    expect(nameChange).toBeTruthy();
    expect(nameChange.before).toBe('Original');
    expect(nameChange.after).toBe('Renamed');
    // Matched across the renumbering, and it says how.
    expect(nameChange.task_code).toBe('A1000');
    expect(nameChange.matched_on).toBe('task_code');
  });

  it('detects date shifts and reports days delta', () => {
    const A = model([task('A', 'A1000', { target_end_date: '2024-01-20 17:00' })]);
    const B = model([task('B', 'A1000', { target_end_date: '2024-01-15 17:00' })]);
    const d = diffModels(A, B);
    const shift = d.tasks.changed.find(c => c.field === 'target_end_date');
    expect(shift).toBeTruthy();
    expect(shift.daysDelta).toBe(5);
    expect(shift.task_code).toBe('A1000');
  });

  it('detects added relationships', () => {
    const A = model([task('A', 'A1000'), task('A', 'A1010')], [rel('A', 'A1000', 'A1010')]);
    const B = model([task('B', 'A1000'), task('B', 'A1010')], []);
    const d = diffModels(A, B);
    expect(d.relationships.added).toHaveLength(1);
    expect(d.relationships.deleted).toHaveLength(0);
    // Named by Activity ID, so the row means something outside its own export.
    expect(d.relationships.added[0].pred_code).toBe('A1000');
    expect(d.relationships.added[0].succ_code).toBe('A1010');
    expect(d.relationships.added[0].endpoints_resolved).toBe(true);
  });

  it('detects deleted relationships', () => {
    const A = model([task('A', 'A1000'), task('A', 'A1010')], []);
    const B = model([task('B', 'A1000'), task('B', 'A1010')], [rel('B', 'A1000', 'A1010')]);
    const d = diffModels(A, B);
    expect(d.relationships.added).toHaveLength(0);
    expect(d.relationships.deleted).toHaveLength(1);
    expect(d.relationships.deleted[0].pred_code).toBe('A1000');
    expect(d.relationships.deleted[0].succ_code).toBe('A1010');
  });

  it('a relationship on both sides is RETAINED, not added-and-deleted', () => {
    // The shipped bug read every relationship in A as added and every one in B
    // as deleted, because the composite key was built from raw surrogates that
    // cannot agree across exports (655 added / 535 deleted on a pair sharing 472).
    const A = model([task('A', 'A1000'), task('A', 'A1010')], [rel('A', 'A1000', 'A1010')]);
    const B = model([task('B', 'A1000'), task('B', 'A1010')], [rel('B', 'A1000', 'A1010')]);
    const d = diffModels(A, B);
    expect(d.counts.relsRetained).toBe(1);
    expect(d.counts.relsAdded).toBe(0);
    expect(d.counts.relsDeleted).toBe(0);
  });

  it('returns counts at the top level', () => {
    const A = model([task('A', 'A1000'), task('A', 'A1010')]);
    const B = model([task('B', 'A1000', { task_name: 'Activity A1000 (old)' })]);
    const d = diffModels(A, B);
    expect(d.counts.tasksAdded).toBe(1);
    // One activity, one changed field — the two counts happen to agree here.
    // tests/unit/diff-counts.test.js pins the case where they must not.
    expect(d.counts.activitiesChanged).toBe(1);
    expect(d.counts.fieldChanges).toBe(1);
    expect(d.counts.tasksDeleted).toBe(0);
    expect(d.counts.relsAdded).toBe(0);
    expect(d.counts.relsDeleted).toBe(0);
  });

  it('returns empty diff for the same schedule exported twice', () => {
    // Same activities, same values, different surrogates — the everyday case
    // that used to read as a wholesale rewrite of the schedule.
    const A = model([task('A', 'A1000'), task('A', 'A1010')], [rel('A', 'A1000', 'A1010')]);
    const B = model([task('B', 'A1000'), task('B', 'A1010')], [rel('B', 'A1000', 'A1010')]);
    const d = diffModels(A, B);
    expect(d.tasks.added).toEqual([]);
    expect(d.tasks.deleted).toEqual([]);
    expect(d.tasks.changed).toEqual([]);
    expect(d.relationships.added).toEqual([]);
    expect(d.relationships.deleted).toEqual([]);
  });

  it('handles null/empty A or B gracefully', () => {
    expect(() => diffModels(null, null)).not.toThrow();
    expect(() => diffModels({}, {})).not.toThrow();
    const d = diffModels({}, {});
    expect(d.counts.tasksAdded).toBe(0);
    expect(d.counts.tasksDeleted).toBe(0);
  });
});
