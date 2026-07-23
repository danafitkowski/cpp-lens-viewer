// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/summary.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Executive Summary', () => {
  it('renders empty state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders project header from PROJECT table', () => {
    const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
    const A = parseXer(text);
    const el = render({ A, B: null });
    // The fixture's project short name is "TINY"
    expect(el.textContent).toMatch(/TINY|PROJ1|TEST|DEMO/i);
  });

  it('renders a narrative paragraph', () => {
    const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
    const A = parseXer(text);
    const el = render({ A, B: null });
    const para = el.querySelector('.lens-narrative p');
    expect(para).toBeTruthy();
    expect(para.textContent.length).toBeGreaterThan(40);
  });

  it('lists concerns when conditions trigger', () => {
    const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
    const A = parseXer(text);
    const el = render({ A, B: null });
    const concerns = el.querySelectorAll('.lens-concerns li');
    // Minimal fixture will trigger no-resources / no-codes concerns
    expect(concerns.length).toBeGreaterThanOrEqual(1);
  });

  it('narrative reports scd_end_date when plan_end_date is blank', () => {
    // blank-plan-end-date.xer: plan_end_date is blank, scd_end_date = 2026-08-15
    const text = readFileSync(join(FIX, 'blank-plan-end-date.xer'), 'utf-8');
    const A = parseXer(text);
    const el = render({ A, B: null });
    const para = el.querySelector('.lens-narrative p');
    expect(para.textContent).toContain('2026-08-15');
    expect(para.textContent).not.toContain('not set');
  });

  it('shows a truncation note when more than 5 incomplete milestones exist', () => {
    const text = readFileSync(join(FIX, 'many-milestones.xer'), 'utf-8');
    const A = parseXer(text);
    const el = render({ A, B: null });
    const rows = el.querySelectorAll('.lens-table tbody tr');
    expect(rows.length).toBe(5);
    expect(el.textContent).toContain('Showing 5 of 7 upcoming milestones');
  });

  it('does not show a truncation note when 5 or fewer incomplete milestones exist', () => {
    const text = readFileSync(join(FIX, 'five-milestones.xer'), 'utf-8');
    const A = parseXer(text);
    const el = render({ A, B: null });
    const rows = el.querySelectorAll('.lens-table tbody tr');
    expect(rows.length).toBe(5);
    expect(el.textContent).not.toContain('Showing');
  });
});
