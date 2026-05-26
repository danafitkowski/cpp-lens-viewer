// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/constraints-float.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Constraints / Float', () => {
  it('renders empty-state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders 4 KPI cards and constraint + float tables when XER is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // 4 KPI cards
    const kpis = el.querySelectorAll('.kpi');
    expect(kpis.length).toBe(4);
    // Both distribution tables present (constraint type + float buckets)
    const tables = el.querySelectorAll('tbody');
    expect(tables.length).toBeGreaterThanOrEqual(2);
    // At least one float bucket row visible
    expect(el.textContent).toContain('Float buckets');
  });

  it('counts hard constraints from constraint-types fixture', () => {
    const A = parseXer(readFileSync(join(FIX, 'constraint-types.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // constraint-types.xer has CS_MSO x2, CS_MEO x1, CS_MANDSTART x1, CS_MANDFIN x1 = 5 hard
    const kpis = el.querySelectorAll('.kpi');
    // Second KPI = critical, third KPI = hard constraints
    const hardKpi = kpis[2];
    expect(hardKpi.textContent).toContain('5');
  });
});
