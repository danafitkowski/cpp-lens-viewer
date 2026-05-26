// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/activity-codes.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Activity Codes', () => {
  it('renders empty-state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders 4 KPI cards when XER is loaded (minimal fixture, no codes)', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const kpis = el.querySelectorAll('.kpi');
    expect(kpis.length).toBe(4);
    // No code types defined message expected (coverage table empty-state)
    expect(el.textContent).toContain('No code types defined');
  });

  it('shows coverage rows when activity codes are present', () => {
    const A = parseXer(readFileSync(join(FIX, 'with-activity-codes.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // with-activity-codes.xer has 2 ACTVTYPE rows (Phase, Area)
    const rows = el.querySelectorAll('tbody tr');
    // First table = coverage (2 rows for Phase + Area), second table = assignments (3 rows)
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(el.textContent).toContain('Phase');
    expect(el.textContent).toContain('Area');
  });
});
