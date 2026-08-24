// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { findSection } from '../../src/sections/_registry.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Compare & Period group is wired (no placeholders)', () => {
  // Two SEPARATE exports of the same schedule. Parsing one file twice gave both
  // sides the same task_id values — the condition P6 never produces, and the
  // one under which a surrogate-keyed section renders perfectly.
  const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
  const A = parseXer(text);
  const B = reexport(parseXer(text));

  it('fixture sanity: the two models share task_code and no task_id', () => {
    const overlap = assertDivergentSurrogates(A, B, { minSharedCodes: 2 });
    expect(overlap.sharedTaskIds).toBe(0);
  });

  for (const id of ['compare', 'period', 'narrative-flip']) {
    it(`section "${id}" renders real content (not Coming soon)`, () => {
      const el = findSection(id).render({ A, B });
      expect(el).toBeDefined();
      expect(el.textContent || '').not.toContain('Coming soon');
    });
  }

  it('all three sections belong to Compare & Period group', () => {
    expect(findSection('compare').group).toBe('Compare & Period');
    expect(findSection('period').group).toBe('Compare & Period');
    expect(findSection('narrative-flip').group).toBe('Compare & Period');
  });
});
