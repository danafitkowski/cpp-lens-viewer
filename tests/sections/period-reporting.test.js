// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/period-reporting.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Period Reporting', () => {
  it('shows empty-state when only A is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/two XERs|load|baseline/i);
  });

  it('renders KPI cards when both loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(4);
  });

  it('detects slipped activity when A end_date is later than B', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    // Push A's first task end-date 5 days later than B's
    if (A.tables.TASK?.records?.[0]) {
      A.tables.TASK.records[0].target_end_date = '2026-02-05 17:00';
    }
    if (B.tables.TASK?.records?.[0]) {
      B.tables.TASK.records[0].target_end_date = '2026-01-31 17:00';
    }
    const el = render({ A, B });
    expect(el.textContent).toMatch(/slipped/i);
  });
});
