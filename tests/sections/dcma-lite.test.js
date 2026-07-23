// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/dcma-lite.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('DCMA Lite', () => {
  it('renders empty-state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders 14 rows in the metrics table when XER is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(14);
  });

  it('computes and shows an overall grade, blurred, behind a CTA — without hiding any of the 14 raw metric rows', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });

    const gradeEl = el.querySelector('.quality-grade-blur');
    expect(gradeEl).toBeTruthy();
    expect(gradeEl.textContent).toMatch(/^[A-F]$/);

    const cta = el.querySelector('.quality-overlay a');
    expect(cta).toBeTruthy();
    expect(cta.getAttribute('href')).toMatch(/criticalpathpartners\.ca/);

    // The full 14-row metric table must still render in full underneath — only the
    // synthesized grade is gated, not the underlying data.
    expect(el.querySelectorAll('tbody tr').length).toBe(14);
  });

  it('grade tracks the underlying PASS/FAIL mix rather than being a constant', () => {
    // minimal-3-task.xer is a thin fixture (2 tasks, 0 resource assignments, only 1
    // relationship) — it should NOT score a clean A. If the grade were hardcoded or
    // miscomputed (e.g. always counting the CPLI/BEI placeholder rows as REVIEW =
    // free credit), this is the kind of case that would wrongly inflate it.
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const grade = el.querySelector('.quality-grade-blur').textContent;
    expect(grade).not.toBe('A');
  });
});
