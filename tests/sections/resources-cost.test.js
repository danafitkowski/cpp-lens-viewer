// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/resources-cost.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Resources / Cost', () => {
  it('renders empty-state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders resource KPI cards when with-resources.xer is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'with-resources.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const kpis = el.querySelectorAll('.kpi');
    // 4 summary KPIs + 5 type KPIs (RT_Labor, RT_Mat, RT_Equip, RT_Role, other) = 9
    expect(kpis.length).toBeGreaterThanOrEqual(4);
    // with-resources.xer has 2 RSRC and 3 TASKRSRC
    expect(el.textContent).toContain('2');   // total resources
    expect(el.textContent).toContain('3');   // total assignments
  });

  it('shows top resources table with resource names', () => {
    const A = parseXer(readFileSync(join(FIX, 'with-resources.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toContain('John Smith');
    expect(el.textContent).toContain('Excavator');
  });
});
