// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/risk-register.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Risk Register', () => {
  it('renders empty-state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders 4 KPI cards when XER is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const kpis = el.querySelectorAll('.kpi');
    expect(kpis.length).toBe(4);
  });

  it('renders risk table rows for minimal fixture (no-resource rule fires)', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // minimal-3-task.xer has 2 TT_Task activities with no TASKRSRC → "No resources" rule fires
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('severity badges are present in the risk table', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const badges = el.querySelectorAll('.lens-badge');
    expect(badges.length).toBeGreaterThan(0);
  });
});
