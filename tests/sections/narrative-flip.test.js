// @vitest-environment happy-dom
//
// FIXTURE CONDITION — two things were wrong with the old fixture here.
//
//   1. A and B were the same file parsed twice, so both carried the same
//      task_id values. Narrative Flip keyed on the surrogate looked correct.
//   2. minimal-3-task.xer has no ACTVTYPE / ACTVCODE / TASKACTV tables, so the
//      section had nothing to compare and rendered "0 flips" whatever it did
//      with identity. The assertion `textContent` contains '0' held for the
//      wrong reason.
//
// B is now a real re-export, and both sides carry activity codes.
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/narrative-flip.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer, getTable } from '@criticalpathpartners/lens-parser';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';
import { withActivityCodes } from '../fixtures/activity-codes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

const CODED_XER = withActivityCodes(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
const parseA = () => parseXer(CODED_XER, { filename: 'A.xer' });
const parseB = () => reexport(parseXer(CODED_XER, { filename: 'B.xer' }));

/** Read a KPI card's big number by its title. */
function kpi(el, title) {
  for (const card of el.querySelectorAll('.kpi')) {
    if (card.querySelector('.kpi-title')?.textContent === title) {
      return card.querySelector('.kpi-big')?.textContent;
    }
  }
  return null;
}

describe('Narrative Flip', () => {
  it('fixture sanity: divergent task_id, shared task_code, real code assignments', () => {
    const A = parseA();
    const B = parseB();
    const overlap = assertDivergentSurrogates(A, B, { minSharedCodes: 2 });
    expect(overlap.sharedTaskIds).toBe(0);
    // Without these three tables the section has nothing to compare and every
    // count below would be zero no matter how identity is resolved.
    expect(getTable(A, 'ACTVTYPE').length).toBeGreaterThan(0);
    expect(getTable(A, 'ACTVCODE').length).toBeGreaterThan(0);
    expect(getTable(A, 'TASKACTV').length).toBeGreaterThan(0);
    expect(getTable(B, 'TASKACTV').length).toBe(getTable(A, 'TASKACTV').length);
  });

  it('shows empty-state when only A is loaded', () => {
    const el = render({ A: parseA(), B: null });
    expect(el.textContent).toMatch(/two XERs|load|baseline/i);
  });

  it('renders KPI cards when both XERs loaded', () => {
    const el = render({ A: parseA(), B: parseB() });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(4);
  });

  it('shows zero flips when codes are identical across the re-export', () => {
    const A = parseA();
    const el = render({ A, B: parseB() });
    const shared = getTable(A, 'TASK').length;
    expect(kpi(el, 'Shared activities compared')).toBe(String(shared));
    expect(kpi(el, 'Total flips detected')).toBe('0');
    expect(kpi(el, 'Unchanged activities')).toBe(String(shared));
  });

  it('shows a flip when a code assignment actually moves', () => {
    // The counterpart to the test above: if this reads 0 the section is blind
    // to its own input and "zero flips" proves nothing.
    const B = parseB();
    const assignment = getTable(B, 'TASKACTV').find(ta => ta.actv_code_type_id === 'AT1');
    assignment.actv_code_id = assignment.actv_code_id === 'AC1' ? 'AC2' : 'AC1';
    const el = render({ A: parseA(), B });
    expect(kpi(el, 'Total flips detected')).toBe('1');
    expect(kpi(el, 'Unchanged activities')).toBe('1');
    expect(el.textContent).toContain('Phase');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REAL QA PAIR — two genuine exports of the same project.
//
// A synthetic fixture proves the mechanism; only the real pair proves the
// number. Skipped when the files are not on this machine, so the suite still
// runs anywhere; point LENS_QA_XER_DIR at them to enable it.
// ─────────────────────────────────────────────────────────────────────────────

const QA_DIR = process.env.LENS_QA_XER_DIR || 'C:/Users/danaf/Downloads/.tmp.driveupload';
const QA_CURRENT = `${QA_DIR}/Georgian-College-current.xer`;
const QA_BASELINE = `${QA_DIR}/Georgian-College-baseline.xer`;
const HAVE_QA = existsSync(QA_CURRENT) && existsSync(QA_BASELINE);

describe.skipIf(!HAVE_QA)('Narrative Flip — real QA pair, Georgian College', () => {
  const A = HAVE_QA ? parseXer(readFileSync(QA_CURRENT, 'latin1')) : null;
  const B = HAVE_QA ? parseXer(readFileSync(QA_BASELINE, 'latin1')) : null;

  it('is the real condition: task_id disjoint, Activity IDs shared', () => {
    expect(assertDivergentSurrogates(A, B, { minSharedCodes: 318 }))
      .toEqual({ sharedCodes: 318, sharedTaskIds: 0 });
  });

  it('matches the QA-confirmed 313 flips / 5 unchanged over 318 shared', () => {
    // The shipped build read 410 of 410 as a flip, because the two code maps
    // were keyed in two different surrogate ID spaces.
    const el = render({ A, B });
    expect(kpi(el, 'Shared activities compared')).toBe('318');
    expect(kpi(el, 'Total flips detected')).toBe('313');
    expect(kpi(el, 'Unchanged activities')).toBe('5');
  });

  it('flips + unchanged equal the shared population, with A-only/B-only as scope', () => {
    const el = render({ A, B });
    const flips = Number(kpi(el, 'Total flips detected'));
    const unchanged = Number(kpi(el, 'Unchanged activities'));
    expect(flips + unchanged).toBe(Number(kpi(el, 'Shared activities compared')));
    // 405 current, 327 baseline, 318 shared → 87 A-only, 9 B-only.
    expect(el.textContent).toContain('A-only 87');
    expect(el.textContent).toContain('B-only 9');
  });
});
