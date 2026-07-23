// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/lookahead.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('3-Week Lookahead', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders KPI cards when loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(5);
  });

  it('renders three week-cards', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/Week 1/i);
    expect(el.textContent).toMatch(/Week 2/i);
    expect(el.textContent).toMatch(/Week 3/i);
  });

  it('formats dates using UTC calendar day, not shifted by local timezone', () => {
    // Fixture: PROJECT.last_recalc_date = 2026-02-01 06:00 (a Sunday in UTC),
    // TASK early_start_date/early_end_date = 2026-02-01 (same UTC Sunday).
    // parseP6Date builds these as `new Date('2026-02-01')` — UTC midnight.
    // In any UTC-negative zone (e.g. America/Toronto, UTC-5 in February),
    // reading that Date with LOCAL getters rolls it back to Sat Jan 31.
    // Force a negative-offset zone so the bug reproduces regardless of the
    // CI runner's ambient timezone.
    const originalTz = process.env.TZ;
    process.env.TZ = 'America/Toronto';
    try {
      const A = parseXer(readFileSync(join(FIX, 'lookahead-utc-dates.xer'), 'utf-8'));
      const el = render({ A, B: null });
      const text = el.textContent;

      // The raw XER date field, string-sliced independently of any Date
      // object — this is the ground truth, not derived from a formatter
      // that could share the same bug.
      const expectedDate = '2026-02-01';
      const wrongDate = '2026-01-31';

      // Data Date KPI
      const dataDateKpi = Array.from(el.querySelectorAll('.kpi'))
        .find(card => card.querySelector('.kpi-title')?.textContent === 'Data Date');
      expect(dataDateKpi.querySelector('.kpi-big').textContent).toBe(expectedDate);

      // Week 1 heading — weekday name + calendar date
      expect(text).toContain('Sun Feb 1');
      expect(text).not.toContain('Sat Jan 31');

      // Task row Start/Finish columns
      expect(text).toContain(expectedDate);
      expect(text).not.toContain(wrongDate);
    } finally {
      process.env.TZ = originalTz;
    }
  });
});
