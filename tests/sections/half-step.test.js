// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, generateHalfStep } from '../../src/sections/half-step.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Half-Step XER', () => {
  it('renders empty-state when only A is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/two XERs|baseline|MIP 3\.4/i);
  });

  it('renders KPI cards when both loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(4);
  });

  it('exports generateHalfStep function', () => {
    expect(typeof generateHalfStep).toBe('function');
  });

  it('generateHalfStep returns a model with ermhdr.isHalfStep = true', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const result = generateHalfStep(A, B);
    expect(result.ermhdr.isHalfStep).toBe(true);
    expect(result.tables.TASK).toBeDefined();
  });

  it('generateHalfStep preserves B target_drtn_hr_cnt even when A differs', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    if (A.tables.TASK?.records?.[0]) A.tables.TASK.records[0].target_drtn_hr_cnt = '999';
    if (B.tables.TASK?.records?.[0]) B.tables.TASK.records[0].target_drtn_hr_cnt = '40';
    const result = generateHalfStep(A, B);
    // Half-step preserves B's target_drtn_hr_cnt
    expect(result.tables.TASK.records[0].target_drtn_hr_cnt).toBe('40');
  });
});
