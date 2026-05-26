// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, traceChain } from '../../src/sections/path-explorer.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Path Explorer', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders activity picker when XER is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelector('select.lens-activity-picker')).toBeTruthy();
  });

  it('traceChain returns an array (function exported)', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    expect(typeof traceChain).toBe('function');
    // Pick any task; assert no exception
    const tasks = A.tables?.TASK?.records || [];
    if (tasks.length > 0) {
      const someId = tasks[0].task_id;
      const result = traceChain(A, someId, 'backward');
      expect(Array.isArray(result)).toBe(true);
    }
  });

  it('traceChain forward + backward both terminate within max depth', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const tasks = A.tables?.TASK?.records || [];
    if (tasks.length > 0) {
      const id = tasks[0].task_id;
      const back = traceChain(A, id, 'backward');
      const fwd  = traceChain(A, id, 'forward');
      expect(back.length).toBeLessThanOrEqual(200);
      expect(fwd.length).toBeLessThanOrEqual(200);
    }
  });
});
