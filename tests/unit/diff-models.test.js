import { describe, it, expect } from 'vitest';
import { diffModels } from '../../src/sections/_shared/diff-models.js';

function model(tasks, rels = []) {
  return {
    tables: {
      TASK: { fields: ['task_id', 'task_name', 'target_end_date'], records: tasks },
      TASKPRED: { fields: ['task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'], records: rels }
    }
  };
}

describe('diffModels', () => {
  it('detects added activities', () => {
    const A = model([{ task_id: '1', task_name: 'A' }, { task_id: '2', task_name: 'B' }]);
    const B = model([{ task_id: '1', task_name: 'A' }]);
    const d = diffModels(A, B);
    expect(d.tasks.added.map(t => t.task_id)).toEqual(['2']);
    expect(d.tasks.deleted).toEqual([]);
  });

  it('detects deleted activities', () => {
    const A = model([{ task_id: '1', task_name: 'A' }]);
    const B = model([{ task_id: '1', task_name: 'A' }, { task_id: '2', task_name: 'B' }]);
    const d = diffModels(A, B);
    expect(d.tasks.deleted.map(t => t.task_id)).toEqual(['2']);
  });

  it('detects name changes', () => {
    const A = model([{ task_id: '1', task_name: 'Renamed' }]);
    const B = model([{ task_id: '1', task_name: 'Original' }]);
    const d = diffModels(A, B);
    const nameChange = d.tasks.changed.find(c => c.field === 'task_name');
    expect(nameChange).toBeTruthy();
    expect(nameChange.before).toBe('Original');
    expect(nameChange.after).toBe('Renamed');
  });

  it('detects date shifts and reports days delta', () => {
    const A = model([{ task_id: '1', task_name: 'X', target_end_date: '2024-01-20 17:00' }]);
    const B = model([{ task_id: '1', task_name: 'X', target_end_date: '2024-01-15 17:00' }]);
    const d = diffModels(A, B);
    const shift = d.tasks.changed.find(c => c.field === 'target_end_date');
    expect(shift).toBeTruthy();
    expect(shift.daysDelta).toBe(5);
  });

  it('detects added relationships', () => {
    const A = model([{ task_id: '1' }, { task_id: '2' }], [{ task_id: '2', pred_task_id: '1', pred_type: 'PR_FS', lag_hr_cnt: '0' }]);
    const B = model([{ task_id: '1' }, { task_id: '2' }], []);
    const d = diffModels(A, B);
    expect(d.relationships.added).toHaveLength(1);
    expect(d.relationships.deleted).toHaveLength(0);
  });

  it('detects deleted relationships', () => {
    const A = model([{ task_id: '1' }, { task_id: '2' }], []);
    const B = model([{ task_id: '1' }, { task_id: '2' }], [{ task_id: '2', pred_task_id: '1', pred_type: 'PR_FS', lag_hr_cnt: '0' }]);
    const d = diffModels(A, B);
    expect(d.relationships.added).toHaveLength(0);
    expect(d.relationships.deleted).toHaveLength(1);
  });

  it('returns counts at the top level', () => {
    const A = model([{ task_id: '1', task_name: 'A' }, { task_id: '2', task_name: 'B' }]);
    const B = model([{ task_id: '1', task_name: 'A_old' }]);
    const d = diffModels(A, B);
    expect(d.counts.tasksAdded).toBe(1);
    expect(d.counts.tasksChanged).toBe(1);
    expect(d.counts.tasksDeleted).toBe(0);
    expect(d.counts.relsAdded).toBe(0);
    expect(d.counts.relsDeleted).toBe(0);
  });

  it('returns empty diff for identical models', () => {
    const tasks = [{ task_id: '1', task_name: 'A' }];
    const d = diffModels(model(tasks), model(tasks));
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
