// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/dashboard.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Executive Dashboard', () => {
  it('renders empty state when A is null', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('Load an XER in the sidebar to populate this dashboard.');
  });

  it('renders KPI grid when A is loaded', () => {
    const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
    const A = parseXer(text, { filename: 'minimal-3-task.xer' });
    const el = render({ A, B: null });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(5);
    expect(el.textContent).toMatch(/Activities/i);
  });

  it('shows status banner with color tone', () => {
    const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
    const A = parseXer(text);
    const el = render({ A, B: null });
    const banner = el.querySelector('.lens-status-banner');
    expect(banner).toBeTruthy();
    expect(['green', 'amber', 'red']).toContain(banner.getAttribute('data-tone'));
  });

  it('shows half-step warning when ermhdr flag set', () => {
    const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
    const A = parseXer(text);
    A.ermhdr.isHalfStep = true;
    const el = render({ A, B: null });
    expect(el.textContent).toContain('Half-Step');
  });

  it('falls back to scd_end_date (CPM-calculated finish) when plan_end_date (must-finish constraint) is blank', () => {
    // Most real XERs never have an explicit must-finish constraint set — plan_end_date
    // is optional and frequently empty. The calculated project finish always lives in
    // scd_end_date. Reading plan_end_date only (the old bug) showed '—' for these files.
    const text = readFileSync(join(FIX, 'blank-plan-end-date.xer'), 'utf-8');
    const A = parseXer(text, { filename: 'blank-plan-end-date.xer' });
    const el = render({ A, B: null });
    const cards = [...el.querySelectorAll('.kpi')];
    const finishCard = cards.find(c => c.querySelector('.kpi-title')?.textContent === 'Project finish');
    expect(finishCard).toBeTruthy();
    expect(finishCard.querySelector('.kpi-big').textContent).toBe('2026-08-15');
    expect(finishCard.querySelector('.kpi-big').textContent).not.toBe('—');
  });

  it('prefers scd_end_date over plan_end_date when both are present and differ', () => {
    // plan_end_date is a contractual target, not the current calculated finish. When the
    // schedule's forecast has slipped past (or sits ahead of) that target, the KPI must
    // show the calculated finish, not silently echo back the contractual date.
    const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8')
      .replace('2026-06-01 00:00\t2026-06-01 00:00', '2026-05-01 00:00\t2026-09-30 00:00');
    const A = parseXer(text, { filename: 'differing-finish-dates.xer' });
    const el = render({ A, B: null });
    const cards = [...el.querySelectorAll('.kpi')];
    const finishCard = cards.find(c => c.querySelector('.kpi-title')?.textContent === 'Project finish');
    expect(finishCard.querySelector('.kpi-big').textContent).toBe('2026-09-30');
  });
});
