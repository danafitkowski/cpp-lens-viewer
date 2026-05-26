import { describe, it, expect } from 'vitest';
import { anonymizeModel, deanonymizeRecords } from '../../src/mcp/anonymizer.js';

describe('anonymizer', () => {
  function modelWithTasks(tasks) {
    return {
      tables: {
        TASK: {
          fields: Object.keys(tasks[0] || {}),
          records: tasks
        }
      }
    };
  }

  it('strips task_name from every TASK record', () => {
    const m = modelWithTasks([
      { task_id: '1', task_code: 'A100', task_name: 'Confidential foundation work' },
      { task_id: '2', task_code: 'A200', task_name: 'Sensitive framing detail' }
    ]);
    const { model, map } = anonymizeModel(m);
    expect(model.tables.TASK.records[0].task_name).toBe('ACT_0001_task_name');
    expect(model.tables.TASK.records[1].task_name).toBe('ACT_0002_task_name');
    expect(map['ACT_0001_task_name']).toBe('Confidential foundation work');
  });

  it('preserves task_id, task_code, dates, durations, status', () => {
    const m = modelWithTasks([
      { task_id: '1', task_code: 'A100', task_name: 'Secret', target_start_date: '2024-01-15 08:00', target_drtn_hr_cnt: '40', status_code: 'TK_NotStart' }
    ]);
    const { model } = anonymizeModel(m);
    const r = model.tables.TASK.records[0];
    expect(r.task_id).toBe('1');
    expect(r.task_code).toBe('A100');
    expect(r.target_start_date).toBe('2024-01-15 08:00');
    expect(r.target_drtn_hr_cnt).toBe('40');
    expect(r.status_code).toBe('TK_NotStart');
  });

  it('deanonymizeRecords restores task_name from the map', () => {
    const m = modelWithTasks([{ task_id: '1', task_code: 'A100', task_name: 'Original' }]);
    const { model, map } = anonymizeModel(m);
    const restored = deanonymizeRecords(model.tables.TASK.records, map);
    expect(restored[0].task_name).toBe('Original');
  });

  it('strips wbs_name and wbs_short_name from PROJWBS records', () => {
    const m = {
      tables: {
        PROJWBS: {
          fields: ['wbs_id', 'wbs_name', 'wbs_short_name'],
          records: [{ wbs_id: '10', wbs_name: 'Confidential Phase', wbs_short_name: 'CPH' }]
        }
      }
    };
    const { model, map } = anonymizeModel(m);
    expect(model.tables.PROJWBS.records[0].wbs_name).not.toBe('Confidential Phase');
    expect(model.tables.PROJWBS.records[0].wbs_short_name).not.toBe('CPH');
    // Both fields tokenized to WBS_0001_* prefix
    expect(model.tables.PROJWBS.records[0].wbs_name).toMatch(/^WBS_/);
  });

  it('returns a deep copy — original model is unchanged', () => {
    const m = modelWithTasks([{ task_id: '1', task_name: 'Original' }]);
    anonymizeModel(m);
    expect(m.tables.TASK.records[0].task_name).toBe('Original');
  });

  it('leaves empty-string fields untouched (no token consumed)', () => {
    const m = modelWithTasks([
      { task_id: '1', task_code: 'A1', task_name: '' },
      { task_id: '2', task_code: 'A2', task_name: 'Real' }
    ]);
    const { model, map } = anonymizeModel(m);
    expect(model.tables.TASK.records[0].task_name).toBe('');
    expect(model.tables.TASK.records[1].task_name).toBe('ACT_0002_task_name');
    // map only has the real entry
    expect(Object.keys(map)).toEqual(['ACT_0002_task_name']);
  });

  it('handles missing tables gracefully', () => {
    const { model, map } = anonymizeModel({ tables: {} });
    expect(model.tables).toEqual({});
    expect(map).toEqual({});
  });
});
