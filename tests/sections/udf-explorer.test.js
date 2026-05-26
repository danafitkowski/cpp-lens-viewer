// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/udf-explorer.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('UDF Explorer', () => {
  it('renders empty-state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders 4 KPI cards when XER is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'with-udfs.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const kpis = el.querySelectorAll('.kpi');
    expect(kpis.length).toBe(4);
  });

  it('shows at least 1 UDFTYPE row in the type list when with-udfs.xer is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'with-udfs.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // with-udfs.xer has 2 UDFTYPE rows
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(el.textContent).toContain('task_note');
  });
});
