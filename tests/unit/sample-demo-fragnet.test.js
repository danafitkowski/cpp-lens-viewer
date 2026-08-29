// The canned demo fragnet must stay REAL against the sample schedule it ships
// with. Time Impact Analysis resolves fragnet ties by task_code, so a tie that
// references a code the sample does not contain is a fragnet the Engine cannot
// insert — and the flagship demo's first click on Run dead-ends again, exactly
// the failure this fragnet exists to fix. Every check below derives from
// SAMPLE_XER itself (parsed, not restated), so editing the sample or the
// fragnet independently breaks the build instead of the live demo.
import { describe, it, expect } from 'vitest';
import { parseXer, getTable } from '@criticalpathpartners/lens-parser';
import { SAMPLE_XER, SAMPLE_FILENAME, SAMPLE_DEMO_FRAGNETS } from '../../src/sample/sample-schedule.js';

const model = parseXer(SAMPLE_XER, { filename: SAMPLE_FILENAME });
const tasks = getTable(model, 'TASK');
const taskByCode = new Map(tasks.map(t => [t.task_code, t]));

describe('sample demo fragnet', () => {
  it('exports at least one fragnet in the Engine contract shape', () => {
    expect(Array.isArray(SAMPLE_DEMO_FRAGNETS)).toBe(true);
    expect(SAMPLE_DEMO_FRAGNETS.length).toBeGreaterThan(0);
    for (const f of SAMPLE_DEMO_FRAGNETS) {
      expect(f.id).toBeTruthy();
      expect(f.name).toBeTruthy();
      expect(f.liability).toBeTruthy();
      expect(Array.isArray(f.activities)).toBe(true);
      expect(f.activities.length).toBeGreaterThan(0);
      expect(Array.isArray(f.ties)).toBe(true);
      expect(f.ties.length).toBeGreaterThan(0);
      for (const a of f.activities) {
        expect(a.code).toBeTruthy();
        expect(a.name).toBeTruthy();
        expect(a.duration_days).toBeGreaterThan(0);
      }
      for (const tie of f.ties) {
        expect(tie.from_code).toBeTruthy();
        expect(tie.to_code).toBeTruthy();
        expect(['FS', 'SS', 'FF', 'SF']).toContain(tie.type);
      }
    }
  });

  it('is clearly labelled a demo fragnet, with an owner-caused event', () => {
    for (const f of SAMPLE_DEMO_FRAGNETS) {
      expect(f.name.toLowerCase()).toContain('demo fragnet');
      expect(f.liability).toBe('Owner');
    }
  });

  it('every tie endpoint is a REAL sample task_code or a fragnet activity code', () => {
    for (const f of SAMPLE_DEMO_FRAGNETS) {
      const fragCodes = new Set(f.activities.map(a => a.code));
      for (const tie of f.ties) {
        for (const code of [tie.from_code, tie.to_code]) {
          const known = fragCodes.has(code) || taskByCode.has(code);
          expect(known, `tie references "${code}", which is neither a fragnet activity nor a task_code in SAMPLE_XER`).toBe(true);
        }
      }
    }
  });

  it('fragnet activity codes do not collide with existing sample activities', () => {
    for (const f of SAMPLE_DEMO_FRAGNETS) {
      for (const a of f.activities) {
        expect(taskByCode.has(a.code), `fragnet activity code "${a.code}" already exists in SAMPLE_XER`).toBe(false);
      }
    }
  });

  it('ties into the sample schedule on at least one zero-float (critical) activity', () => {
    // The demo exists to show a real impacted completion date. A fragnet tied
    // only into float would move nothing and the first-click result would show
    // zero impact — technically a run, but an empty demo.
    for (const f of SAMPLE_DEMO_FRAGNETS) {
      const scheduleEndpoints = f.ties
        .flatMap(t => [t.from_code, t.to_code])
        .filter(code => taskByCode.has(code));
      expect(scheduleEndpoints.length).toBeGreaterThan(0);
      const touchesCritical = scheduleEndpoints.some(
        code => parseFloat(taskByCode.get(code).total_float_hr_cnt) === 0
      );
      expect(touchesCritical, `no tie endpoint of "${f.id}" is on the sample's critical path`).toBe(true);
    }
  });

  it('SAMPLE_FILENAME is the filename the sample model actually carries', () => {
    expect(SAMPLE_FILENAME).toBe('sample-demo.xer');
    expect(model.filename).toBe(SAMPLE_FILENAME);
  });
});
