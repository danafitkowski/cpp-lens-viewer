import { describe, it, expect } from 'vitest';
import { parseXer, getTable } from '@criticalpathpartners/lens-parser';
import { SAMPLE_XER } from '../../src/sample/sample-schedule.js';

describe('bundled sample schedule', () => {
  it('parses into a usable model (PROJECT + TASK rows)', () => {
    const model = parseXer(SAMPLE_XER, { filename: 'sample-demo.xer' });
    expect(getTable(model, 'PROJECT').length).toBeGreaterThan(0);
    expect(getTable(model, 'TASK').length).toBeGreaterThan(0);
  });
});
