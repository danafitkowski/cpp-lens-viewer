import { describe, it, expect } from 'vitest';
import { parseXer, getTable } from '@criticalpathpartners/lens-parser';
import { SAMPLE_XER } from '../../src/sample/sample-schedule.js';

describe('bundled sample schedule', () => {
  it('parses into a rich, usable demo model', () => {
    const model = parseXer(SAMPLE_XER, { filename: 'sample-demo.xer' });
    expect(getTable(model, 'PROJECT').length).toBe(1);
    // A real showcase schedule (not a sparse fixture): WBS phases, many
    // activities, logic, and resources, so the schedule / WBS / critical-path /
    // resource sections all populate when a visitor clicks "Load a sample".
    expect(getTable(model, 'TASK').length).toBeGreaterThan(20);
    expect(getTable(model, 'PROJWBS').length).toBeGreaterThan(5);
    expect(getTable(model, 'TASKPRED').length).toBeGreaterThan(20);
    expect(getTable(model, 'RSRC').length).toBeGreaterThan(0);
  });
});
