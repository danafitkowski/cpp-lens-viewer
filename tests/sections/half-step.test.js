// @vitest-environment happy-dom
//
// FIXTURE CONDITION — A and B are two SEPARATE exports of the same file.
// This suite used to parse minimal-3-task.xer twice and hand both sides the
// same task_id values, so a Half-Step keyed on the surrogate matched 2 of 2
// here and 0 of 318 on a real pair. B now goes through the shared re-export
// builder: every surrogate renumbered, every Activity ID left alone, TASK rows
// reversed so position cannot stand in for a match.
import { describe, it, expect } from 'vitest';
import { render, generateHalfStep } from '../../src/sections/half-step.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

const XER = () => readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
/** Updated / current export. */
const parseA = () => parseXer(XER());
/** Base / prior export of the SAME schedule, with every surrogate renumbered. */
const parseB = () => reexport(parseXer(XER()));

/** Find a TASK row by its stable Activity ID. */
const byCode = (model, code) => model.tables.TASK.records.find(t => t.task_code === code);

describe('Half-Step XER', () => {
  it('fixture sanity: A and B share every Activity ID and no task_id', () => {
    const A = parseA();
    const B = parseB();
    const overlap = assertDivergentSurrogates(A, B, { minSharedCodes: 2 });
    expect(overlap.sharedTaskIds).toBe(0);
    expect(overlap.sharedCodes).toBe(A.tables.TASK.records.length);
  });

  it('renders empty-state when only A is loaded', () => {
    const el = render({ A: parseA(), B: null });
    expect(el.textContent).toMatch(/two XERs|baseline|MIP 3\.4/i);
  });

  it('renders KPI cards when both loaded', () => {
    const el = render({ A: parseA(), B: parseB() });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(4);
  });

  it('exports generateHalfStep function', () => {
    expect(typeof generateHalfStep).toBe('function');
  });

  it('matches every shared activity across the renumbered surrogates', () => {
    const A = parseA();
    const result = generateHalfStep(A, parseB());
    expect(result._halfStepMeta.matched).toBe(A.tables.TASK.records.length);
    expect(result._halfStepMeta.unmatchedInUpdated).toBe(0);
    expect(result._halfStepMeta.unmatchedInBase).toBe(0);
    expect(result._halfStepMeta.implausible).toBe(false);
  });

  it('generateHalfStep returns a model with ermhdr.isHalfStep = true', () => {
    const result = generateHalfStep(parseA(), parseB());
    expect(result.ermhdr.isHalfStep).toBe(true);
    expect(result.tables.TASK).toBeDefined();
  });

  it('generateHalfStep preserves B target_drtn_hr_cnt even when A differs', () => {
    const A = parseA();
    const B = parseB();
    // Address the activity by its Activity ID — B's row order is reversed and
    // its task_id is renumbered, so records[0] is a different activity now.
    byCode(A, 'A1').target_drtn_hr_cnt = '999';
    byCode(B, 'A1').target_drtn_hr_cnt = '40';
    const result = generateHalfStep(A, B);
    // Half-step preserves B's target_drtn_hr_cnt
    expect(byCode(result, 'A1').target_drtn_hr_cnt).toBe('40');
  });

  it('overlays progress onto the row with the SAME Activity ID', () => {
    const A = parseA();
    const B = parseB();
    byCode(A, 'A2').status_code = 'TK_Complete';
    byCode(A, 'A2').phys_complete_pct = '100';
    const result = generateHalfStep(A, B);
    expect(byCode(result, 'A2').status_code).toBe('TK_Complete');
    expect(byCode(result, 'A2').phys_complete_pct).toBe('100');
    // and the activity that did NOT progress in A is untouched
    expect(byCode(result, 'A1').status_code).toBe('TK_NotStart');
    // B's structure survives: the output carries B's surrogate, not A's
    expect(byCode(result, 'A2').task_id).toBe(byCode(B, 'A2').task_id);
    expect(byCode(result, 'A2').task_id).not.toBe(byCode(A, 'A2').task_id);
  });
});
