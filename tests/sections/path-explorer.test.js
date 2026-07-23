// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, traceChain, pickEligibleTasks, DROPDOWN_LIMIT } from '../../src/sections/path-explorer.js';
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

  // ── Dropdown truncation disclosure ──────────────────────────────────
  //
  // pickEligibleTasks() holds the exact same count/slice/flag logic render()
  // uses to build the activity picker. It's exercised directly here (plain
  // objects, no XER parse, no DOM) because happy-dom's <select> is
  // pathologically slow to populate at real DROPDOWN_LIMIT scale — building
  // a single 500-option <select> already takes several seconds in this
  // environment (confirmed by hand: ~3.3s for 500, ~24s for 1000, on a
  // clearly super-linear curve), so a literal 5,000-plus-option DOM render
  // is not practical to run in a test. Testing the shared counting/slicing
  // function directly still exercises the real DROPDOWN_LIMIT threshold and
  // the exact logic render() wires into the note, without the DOM cost.
  function fakeTasks(n) {
    return Array.from({ length: n }, (_, i) => ({ task_id: String(i + 1), task_type: 'TT_Task' }));
  }

  it('pickEligibleTasks does not flag truncation at or under DROPDOWN_LIMIT', () => {
    const atLimit = pickEligibleTasks(fakeTasks(DROPDOWN_LIMIT));
    expect(atLimit.eligibleCount).toBe(DROPDOWN_LIMIT);
    expect(atLimit.pickable.length).toBe(DROPDOWN_LIMIT);
    expect(atLimit.truncated).toBe(false);

    const under = pickEligibleTasks(fakeTasks(3));
    expect(under.truncated).toBe(false);
  });

  it('pickEligibleTasks flags truncation and caps the pickable list when eligible activities exceed DROPDOWN_LIMIT', () => {
    const result = pickEligibleTasks(fakeTasks(DROPDOWN_LIMIT + 1234));
    expect(result.eligibleCount).toBe(DROPDOWN_LIMIT + 1234);
    expect(result.pickable.length).toBe(DROPDOWN_LIMIT);
    expect(result.truncated).toBe(true);
  });

  it('does not show a dropdown truncation note when eligible activities are within DROPDOWN_LIMIT', () => {
    // Real render()+DOM check at small (fast) scale — confirms the note is
    // correctly absent when pickEligibleTasks reports no truncation.
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const note = [...el.querySelectorAll('.lens-table-foot')]
      .find(n => /Showing first/.test(n.textContent));
    expect(note).toBeFalsy();
  });

  // ── Chain (MAX_DEPTH) truncation disclosure ─────────────────────────
  //
  // long-linear-chain.xer is a purpose-built 210-task fixture: a single
  // strict FS chain (task 2's driving pred is task 1, task 3's is task 2,
  // ... task 210's is task 209). Tracing backward from task 210 walks past
  // MAX_DEPTH=200 with real predecessors (tasks 1-9) still unvisited, so the
  // cap unambiguously cuts the chain off rather than coinciding with its
  // natural end. It stays small (210 options) so, unlike the DROPDOWN_LIMIT
  // fixtures above, it's cheap to drive through a full render()+DOM test too.

  it('traceChain flags truncated=true and stops at MAX_DEPTH when the driving chain runs past the cap', () => {
    const A = parseXer(readFileSync(join(FIX, 'long-linear-chain.xer'), 'utf-8'));
    const result = traceChain(A, '210', 'backward');
    expect(result.length).toBe(200);
    expect(result.truncated).toBe(true);
    // and there were genuinely more predecessors left to trace
    expect(result[result.length - 1].task_code).not.toBe('L0001');
  });

  it('traceChain flags truncated=false when the chain legitimately ends before MAX_DEPTH', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const result = traceChain(A, '2', 'backward');
    expect(result.length).toBeLessThan(200);
    expect(result.truncated).toBe(false);
  });

  it('renders a chain-truncated note on the chain card when a traced chain hits MAX_DEPTH', () => {
    const A = parseXer(readFileSync(join(FIX, 'long-linear-chain.xer'), 'utf-8'));
    const el = render({ A, B: null });
    document.body.appendChild(el);
    const select = el.querySelector('select.lens-activity-picker');
    select.value = '210';
    select.dispatchEvent(new Event('change'));

    const note = [...el.querySelectorAll('.lens-table-foot')]
      .find(n => /truncated/i.test(n.textContent));
    expect(note).toBeTruthy();
    document.body.removeChild(el);
  });
});
