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


  // -------------------------------------------------------------------------
  // C10 / C11 corrections (2026-08-28). C10 published a >=80% band that
  // DCMA-EA PAM 200.1 never contained (§4.10 is 100% — every task with
  // duration carries dollars or hours) and stamped PASS with a fifth of the
  // schedule unresourced. C11 was gated on TK_NotStart with a zero target,
  // making an in-progress activity sitting past its planned finish invisible
  // while §4.11 is a finish test with a 5% ceiling.
  // -------------------------------------------------------------------------

  it('C10 Resources reports N/A when the export carries no TASKRSRC at all', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const rows = Array.from(el.querySelectorAll('tbody tr'));
    const c10 = rows.find(r => /Resources/.test(r.textContent));
    expect(c10).toBeTruthy();
    expect(c10.textContent).toContain('N/A');
    expect(c10.textContent).toContain('100%');
    expect(c10.textContent).not.toContain('80');
  });

  it('C11 Missed Tasks carries the 5% band, not a zero target', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const rows = Array.from(el.querySelectorAll('tbody tr'));
    const c11 = rows.find(r => /Missed Tasks/.test(r.textContent));
    expect(c11).toBeTruthy();
    expect(c11.textContent).toMatch(/5\s*%/);
    expect(c11.textContent).toContain('past planned finish');
  });

  it('renders 14 rows in the metrics table when XER is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(14);
  });

  it('does not fabricate a grade — points to the real Schedule Health Report tool instead, without hiding any of the 14 raw metric rows', () => {
    // "Lite" means lite: no synthesized A-F score here at all, real or blurred.
    // The real CPP Quality Overlay grade is a published feature of the standalone
    // Schedule Health Report tool. Computing a second one here would risk two
    // different grades for the same schedule on two different pages.
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });

    expect(el.querySelector('.quality-grade-blur')).toBeFalsy();

    const cta = el.querySelector('.quality-overlay a');
    expect(cta).toBeTruthy();
    expect(cta.getAttribute('href')).toBe('https://criticalpathpartners.ca/schedule-health-report.html');
    expect(cta.textContent).toMatch(/schedule health report/i);

    // The full 14-row metric table must still render in full underneath.
    expect(el.querySelectorAll('tbody tr').length).toBe(14);
  });
});
