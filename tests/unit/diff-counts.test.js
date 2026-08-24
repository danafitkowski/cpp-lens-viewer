import { describe, it, expect } from 'vitest';
import { diffModels } from '../../src/sections/_shared/diff-models.js';
import { resolveTaskKey, taskKey } from '../../src/sections/_shared/identity.js';
import { assertDivergentSurrogates } from '../fixtures/reexport.js';

// ─────────────────────────────────────────────────────────────────────────────
// REAL-WORLD FIXTURE CONDITION
//
// P6 reassigns the internal surrogate task_id on every export. Two exports of
// the SAME project therefore share task_code (the Activity ID) and share
// nothing else. Every fixture below gives A and B DIFFERENT task_id values for
// the same activity — fixtures with consistent task_ids let the old code pass
// while the shipped product was matching nothing.
//
// What this suite pins:
//   counts.activitiesChanged — DISTINCT activities with >= 1 changed field
//   counts.fieldChanges      — TOTAL field-level changes
// The shipped bug rendered the field total ("1,429" on a 405-activity
// schedule) under the label "Activities changed".
// ─────────────────────────────────────────────────────────────────────────────

function model(tasks, rels = []) {
  return {
    tables: {
      TASK: {
        fields: ['task_id', 'task_code', 'task_name', 'target_start_date',
                 'target_end_date', 'total_float_hr_cnt'],
        records: tasks
      },
      TASKPRED: { fields: ['task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'], records: rels }
    }
  };
}

/** Current export. Surrogate ids in the 9000s. */
function currentModel() {
  return model([
    // A1000 moved 5 calendar days later, finish moved too, and float dropped:
    // THREE field changes on ONE activity.
    { task_id: '9001', task_code: 'A1000', task_name: 'Excavate pier 3',
      target_start_date: '2026-03-16 08:00', target_end_date: '2026-03-27 17:00',
      total_float_hr_cnt: '0' },
    // Untouched.
    { task_id: '9002', task_code: 'A1010', task_name: 'Form pier 3',
      target_start_date: '2026-03-30 08:00', target_end_date: '2026-04-03 17:00',
      total_float_hr_cnt: '40' },
    { task_id: '9003', task_code: 'A1020', task_name: 'Pour pier 3',
      target_start_date: '2026-04-06 08:00', target_end_date: '2026-04-08 17:00',
      total_float_hr_cnt: '40' }
  ]);
}

/** Prior export of the same three activities. Surrogate ids in the 100s. */
function baselineModel() {
  return model([
    { task_id: '101', task_code: 'A1000', task_name: 'Excavate pier 3',
      target_start_date: '2026-03-11 08:00', target_end_date: '2026-03-20 17:00',
      total_float_hr_cnt: '24' },
    { task_id: '102', task_code: 'A1010', task_name: 'Form pier 3',
      target_start_date: '2026-03-30 08:00', target_end_date: '2026-04-03 17:00',
      total_float_hr_cnt: '40' },
    { task_id: '103', task_code: 'A1020', task_name: 'Pour pier 3',
      target_start_date: '2026-04-06 08:00', target_end_date: '2026-04-08 17:00',
      total_float_hr_cnt: '40' }
  ]);
}

describe('diffModels change counts: activities vs fields', () => {
  it('fixture sanity: task_id differs between exports while task_code matches', () => {
    // The shared refusal: no task_id may be shared, at least one task_code must be.
    const overlap = assertDivergentSurrogates(currentModel(), baselineModel(), { minSharedCodes: 3 });
    expect(overlap).toEqual({ sharedCodes: 3, sharedTaskIds: 0 });

    const a = currentModel().tables.TASK.records;
    const b = baselineModel().tables.TASK.records;
    for (let i = 0; i < a.length; i++) {
      expect(a[i].task_id).not.toBe(b[i].task_id);  // surrogate renumbered
      expect(a[i].task_code).toBe(b[i].task_code);  // Activity ID stable
    }
  });

  it('matches across renumbered task_id: nothing added, nothing deleted', () => {
    const d = diffModels(currentModel(), baselineModel());
    expect(d.counts.tasksAdded).toBe(0);
    expect(d.counts.tasksDeleted).toBe(0);
  });

  it('one activity changed in three fields => 1 activity changed, 3 field changes', () => {
    const d = diffModels(currentModel(), baselineModel());
    expect(d.counts.activitiesChanged).toBe(1);
    expect(d.counts.fieldChanges).toBe(3);
    // The exact confusion that shipped: the two are NOT the same number.
    expect(d.counts.fieldChanges).not.toBe(d.counts.activitiesChanged);
    // Keys are internal (prefixed by the identity module) — compare against the
    // canonical resolver rather than hard-coding its key format.
    expect(d.tasks.changedActivityKeys)
      .toEqual([taskKey({ task_code: 'A1000', task_id: '9001' })]);
    expect(d.tasks.changed).toHaveLength(3);
    expect(d.tasks.changed.map(c => c.field).sort())
      .toEqual(['target_end_date', 'target_start_date', 'total_float_hr_cnt']);
  });

  it('the ambiguous counts.tasksChanged name is gone, not silently redefined', () => {
    const d = diffModels(currentModel(), baselineModel());
    expect(d.counts.tasksChanged).toBeUndefined();
    expect('tasksChanged' in d.counts).toBe(false);
  });

  it('changed entries carry the Activity ID and the surrogate separately', () => {
    const d = diffModels(currentModel(), baselineModel());
    for (const c of d.tasks.changed) {
      expect(c.task_code).toBe('A1000');
      expect(c.task_id).toBe('9001');     // real surrogate, not the match key
      expect(c.key).toBe(taskKey({ task_code: 'A1000', task_id: '9001' }));
      expect(c.matched_on).toBe('task_code');
    }
  });

  it('activities changed stays 1 when a fourth field moves on the same activity', () => {
    const A = currentModel();
    A.tables.TASK.records[0].task_name = 'Excavate pier 3 (revised)';
    const d = diffModels(A, baselineModel());
    expect(d.counts.activitiesChanged).toBe(1);
    expect(d.counts.fieldChanges).toBe(4);
  });

  it('two activities changed in three fields each => 2 activities, 6 field changes', () => {
    const A = currentModel();
    A.tables.TASK.records[1].target_start_date = '2026-04-06 08:00';
    A.tables.TASK.records[1].target_end_date   = '2026-04-10 17:00';
    A.tables.TASK.records[1].total_float_hr_cnt = '0';
    const d = diffModels(A, baselineModel());
    expect(d.counts.activitiesChanged).toBe(2);
    expect(d.counts.fieldChanges).toBe(6);
    expect(d.tasks.changedActivityKeys.sort()).toEqual([
      taskKey({ task_code: 'A1000' }),
      taskKey({ task_code: 'A1010' })
    ].sort());
  });
});

describe('honest degradation when an activity has no Activity ID', () => {
  it('falls back to task_id, reports matched_on, and keeps the row', () => {
    const A = model([
      { task_id: '9001', task_code: 'A1000', task_name: 'Coded', total_float_hr_cnt: '0' },
      { task_id: '55',   task_code: '',      task_name: 'Uncoded now', total_float_hr_cnt: '8' }
    ]);
    const B = model([
      { task_id: '101', task_code: 'A1000', task_name: 'Coded', total_float_hr_cnt: '0' },
      { task_id: '55',  task_code: '',      task_name: 'Uncoded then', total_float_hr_cnt: '8' }
    ]);
    const d = diffModels(A, B);
    // Row is NOT dropped: it matched on the surrogate and reports one change.
    expect(d.counts.tasksAdded).toBe(0);
    expect(d.counts.tasksDeleted).toBe(0);
    expect(d.counts.activitiesChanged).toBe(1);
    expect(d.counts.fieldChanges).toBe(1);
    const entry = d.tasks.changed[0];
    expect(entry.matched_on).toBe('task_id');
    expect(entry.key).toBe(taskKey({ task_id: '55' }));
    expect(entry.task_code).toBe('');
    expect(entry.task_id).toBe('55');
  });

  it('a whitespace-only task_code falls back instead of dropping the activity', () => {
    // getFirstField returns '   ' as a "present" value; trimming it to '' used
    // to drop the row from the index entirely — a silently vanished activity.
    const r = resolveTaskKey({ task_code: '   ', task_id: '77' });
    expect(r.matched_on).toBe('task_id');
    expect(r.key).toBe(taskKey({ task_id: '77' }));
    expect(r.key).not.toBe('');

    const A = model([{ task_id: '9100', task_code: '   ', task_name: 'Ghost A', total_float_hr_cnt: '0' }]);
    const B = model([{ task_id: '9100', task_code: '   ', task_name: 'Ghost B', total_float_hr_cnt: '0' }]);
    const d = diffModels(A, B);
    expect(d.counts.tasksAdded).toBe(0);
    expect(d.counts.tasksDeleted).toBe(0);
    expect(d.counts.activitiesChanged).toBe(1);   // the row survived to be diffed
  });

  it('resolveTaskKey prefers the stable Activity ID', () => {
    const coded = resolveTaskKey({ task_code: 'A1000', task_id: '9001' });
    expect(coded.matched_on).toBe('task_code');
    expect(coded.key).toBe(taskKey({ task_code: 'A1000' }));
    // Same activity re-exported with a different surrogate resolves identically.
    expect(resolveTaskKey({ task_code: 'A1000', task_id: '101' }).key).toBe(coded.key);

    const nothing = resolveTaskKey({ task_code: '', task_id: '' });
    expect(nothing.matched_on).toBe('none');
    expect(nothing.key).toBe('');
  });
});
