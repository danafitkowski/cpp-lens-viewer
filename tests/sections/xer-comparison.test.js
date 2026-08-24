// @vitest-environment happy-dom
//
// FIXTURE CONDITION — A and B are two SEPARATE exports of the same schedule.
// This suite used to parse minimal-3-task.xer twice, so both sides carried the
// same task_id values and a surrogate-keyed diff reported 0 added / 0 deleted
// here while reporting every activity added AND deleted on a real pair. B now
// goes through the shared re-export builder.
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/xer-comparison.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

const XER = () => readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
const parseA = () => parseXer(XER());
const parseB = () => reexport(parseXer(XER()));

/** Read a KPI card's big number by its title. */
function kpi(el, title) {
  for (const card of el.querySelectorAll('.kpi')) {
    if (card.querySelector('.kpi-title')?.textContent === title) {
      return card.querySelector('.kpi-big')?.textContent;
    }
  }
  return null;
}

describe('XER Comparison', () => {
  it('fixture sanity: A and B share every Activity ID and no task_id', () => {
    const overlap = assertDivergentSurrogates(parseA(), parseB(), { minSharedCodes: 2 });
    expect(overlap.sharedTaskIds).toBe(0);
    expect(overlap.sharedCodes).toBe(2);
  });

  it('shows empty-state when neither XER is loaded', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toMatch(/two XERs|baseline|load/i);
  });

  it('shows empty-state when only A is loaded', () => {
    const el = render({ A: parseA(), B: null });
    expect(el.textContent).toMatch(/two XERs|baseline|load/i);
  });

  it('renders 4 KPI cards when both XERs loaded', () => {
    const el = render({ A: parseA(), B: parseB() });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(4);
  });

  it('shows zero diffs when the same schedule is exported twice', () => {
    const el = render({ A: parseA(), B: parseB() });
    // Named KPIs, not a bare search for the character '0' — the old assertion
    // passed on any page that happened to print a zero anywhere.
    expect(kpi(el, 'Activities added')).toBe('0');
    expect(kpi(el, 'Activities deleted')).toBe('0');
    expect(kpi(el, 'Activities changed')).toBe('0');
    expect(kpi(el, 'Field changes')).toBe('0');
  });

  it('relationships survive the re-export instead of churning', () => {
    // TASKPRED endpoints are surrogates too. Keyed raw, the single relationship
    // in this fixture read as added in A and deleted in B at the same time.
    const el = render({ A: parseA(), B: parseB() });
    expect(kpi(el, 'Relationships +/−')).toBe('+0 / −0');
    expect(el.textContent).toContain('1 retained');
  });

  it('detects added activities when B is missing one of them', () => {
    const A = parseA();
    const B = parseB();
    // Drop A2 by Activity ID — B's row order is reversed, so an index would
    // silently delete the wrong activity.
    B.tables.TASK.records = B.tables.TASK.records.filter(t => t.task_code !== 'A2');
    const el = render({ A, B });
    expect(el.textContent).toContain('Added activities');
    expect(kpi(el, 'Activities added')).toBe('1');
    expect(kpi(el, 'Activities deleted')).toBe('0');
    expect(el.textContent).toContain('A2');
  });
});
