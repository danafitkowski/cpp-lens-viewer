// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/period-reporting.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

// ─────────────────────────────────────────────────────────────────────────────
// The column is populated with taskDisplayId(), i.e. the Activity ID
// (task_code), but it shipped headed "ID" over a row property literally named
// task_id. In P6 "ID" reads as the internal surrogate, which is reassigned on
// every export and means nothing across two files. The xer-comparison suite
// already asserts that a bare "ID" header over a code column is the mislabel;
// this section has to match.
//
// Both sides are built from ONE file and one side is put through reexport(), so
// the surrogates diverge while the codes hold — the real cross-export condition.
// ─────────────────────────────────────────────────────────────────────────────

function pair() {
  const src = readFileSync(join(FIX, 'negative-float.xer'), 'utf-8');
  const B = parseXer(src, { filename: 'baseline.xer' });   // period start
  const A = reexport(parseXer(src, { filename: 'current.xer' }));  // re-exported current
  return { A, B };
}

function headers(el) {
  return [...el.querySelectorAll('.lens-table thead th')].map(th => th.textContent);
}

describe('Period Reporting names the ID column for what it holds', () => {
  it('the pair really is two exports: codes shared, surrogates disjoint', () => {
    const { A, B } = pair();
    const { sharedCodes, sharedTaskIds } = assertDivergentSurrogates(A, B, { minSharedCodes: 4 });
    expect(sharedCodes).toBe(4);
    expect(sharedTaskIds).toBe(0);
  });

  it('heads the column "Activity ID", never a bare "ID"', () => {
    const { A, B } = pair();
    const el = render({ A, B });
    const hs = headers(el);
    expect(hs).toContain('Activity ID');
    expect(hs).not.toContain('ID');   // bare "ID" over a code column is the mislabel
  });

  it('the cells under that header carry Activity IDs, not surrogates', () => {
    const { A, B } = pair();
    const el = render({ A, B });
    const firstCells = [...el.querySelectorAll('.lens-table tbody tr')]
      .map(tr => tr.firstElementChild?.textContent);
    expect(firstCells.length).toBeGreaterThan(0);
    for (const cell of firstCells) {
      expect(cell).toMatch(/^A10\d0$/);
    }
    // The re-exported surrogates (100001…) must appear nowhere on the page.
    expect(el.textContent).not.toMatch(/\b10000[1-9]\b/);
  });

  it('labels a code-less row instead of passing its surrogate off as an Activity ID', () => {
    // An activity with no task_code can only be matched on the surrogate, which
    // holds across exports by luck, not by rule. Say so on the row.
    const { A, B } = pair();
    for (const m of [A, B]) {
      const row = m.tables.TASK.records.find(t => t.task_code === 'A1010');
      row.task_code = '';
      row.task_id = '900';
    }
    const el = render({ A, B });
    expect(el.textContent).toContain('900 (internal ID, no Activity ID)');
  });

  it('leaves rows that do have a code unlabelled', () => {
    const { A, B } = pair();
    const el = render({ A, B });
    expect(el.textContent).not.toContain('internal ID, no Activity ID');
  });

  it('still matches all four activities across the renumbered export', () => {
    // Guard against a "fix" that renames the header while the matching quietly
    // finds nothing: an empty table has no mislabelled column either.
    const { A, B } = pair();
    const el = render({ A, B });
    const codes = new Set([...el.querySelectorAll('.lens-table tbody tr')]
      .map(tr => tr.firstElementChild?.textContent));
    expect(codes).toEqual(new Set(['A1000', 'A1010', 'A1020', 'A1030']));
  });
});
