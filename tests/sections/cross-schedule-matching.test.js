import { describe, it, expect } from 'vitest';
import { parseXer, getTable } from '@criticalpathpartners/lens-parser';
import { SAMPLE_XER } from '../../src/sample/sample-schedule.js';
import { buildActivities } from '../../src/sections/gantt.js';
import { diffModels } from '../../src/sections/_shared/diff-models.js';
import { indexTasks as periodIndexTasks } from '../../src/sections/period-reporting.js';

// Simulate a SEPARATE P6 re-export of the same schedule: P6 reassigns the
// internal surrogate task_id on export, but the user-facing task_code
// (Activity ID) is stable. We renumber B's task_id by +1000 and leave
// task_code untouched. Cross-schedule matching MUST therefore key on
// task_code, not task_id — that is the bug this suite locks.
function reexport(model) {
  for (const t of getTable(model, 'TASK')) {
    t.task_id = String(Number(t.task_id) + 1000);
  }
  return model;
}

describe('cross-schedule matching keys on stable task_code, not surrogate task_id', () => {
  it('renumbering task_id actually changes task_id but keeps task_code (fixture sanity)', () => {
    const A = parseXer(SAMPLE_XER, { filename: 'A.xer' });
    const B = reexport(parseXer(SAMPLE_XER, { filename: 'B.xer' }));
    const a0 = getTable(A, 'TASK')[0];
    const b0 = getTable(B, 'TASK')[0];
    expect(b0.task_id).not.toBe(a0.task_id);   // surrogate renumbered
    expect(b0.task_code).toBe(a0.task_code);   // Activity ID stable
  });

  it('gantt: baseline overlay matches EVERY activity across a renumbered task_id', () => {
    const A = parseXer(SAMPLE_XER, { filename: 'A.xer' });
    const B = reexport(parseXer(SAMPLE_XER, { filename: 'B.xer' }));
    const acts = buildActivities(A, B, /* criticalOnly */ false, /* showBaseline */ true);
    expect(acts.length).toBeGreaterThan(0);
    const baselineCount = acts.filter(a => a.baseline_start).length;
    expect(baselineCount).toBe(acts.length); // "Baseline Matched" KPI == activity count
  });

  it('gantt: match is genuinely via task_code (renumber the code too → no match)', () => {
    const A = parseXer(SAMPLE_XER, { filename: 'A.xer' });
    const B = parseXer(SAMPLE_XER, { filename: 'B.xer' });
    for (const t of getTable(B, 'TASK')) {
      t.task_id = String(Number(t.task_id) + 1000);
      t.task_code = String(t.task_code) + '_X';
    }
    const acts = buildActivities(A, B, false, true);
    expect(acts.filter(a => a.baseline_start).length).toBe(0);
  });

  it('diffModels: identical schedules with renumbered task_id => 0 added / 0 deleted', () => {
    const A = parseXer(SAMPLE_XER, { filename: 'A.xer' });
    const B = reexport(parseXer(SAMPLE_XER, { filename: 'B.xer' }));
    const d = diffModels(A, B);
    expect(d.counts.tasksAdded).toBe(0);
    expect(d.counts.tasksDeleted).toBe(0);
  });

  it('period-reporting indexTasks: A and B share every key across a renumbered task_id', () => {
    const A = parseXer(SAMPLE_XER, { filename: 'A.xer' });
    const B = reexport(parseXer(SAMPLE_XER, { filename: 'B.xer' }));
    const ia = periodIndexTasks(A);
    const ib = periodIndexTasks(B);
    expect(ia.size).toBeGreaterThan(0);
    let matched = 0;
    for (const k of ia.keys()) if (ib.has(k)) matched++;
    expect(matched).toBe(ia.size); // every current activity matched its prior by task_code
  });
});
