// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '../../src/sections/dashboard-creator.js';
import { prefsStore } from '../../src/state/prefs.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Dashboard Creator', () => {
  beforeEach(() => {
    prefsStore.set({ ...prefsStore.get(), dashboardLayout: ['total-activities', 'pct-complete', 'critical-pct'] });
  });

  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders catalog + canvas when XER loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/available tiles/i);
    expect(el.textContent).toMatch(/your dashboard|dashboard/i);
  });

  it('canvas shows default 3 tiles', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    document.body.appendChild(el);
    const canvasTiles = el.querySelectorAll('.lens-dash-canvas .kpi');
    expect(canvasTiles.length).toBe(3);
    document.body.removeChild(el);
  });

  it('add button appends tile to layout', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    prefsStore.set({ ...prefsStore.get(), dashboardLayout: [] });
    const el = render({ A, B: null });
    document.body.appendChild(el);
    const addBtn = el.querySelector('.lens-dash-catalog button');
    if (addBtn) addBtn.click();
    expect(prefsStore.get().dashboardLayout.length).toBe(1);
    document.body.removeChild(el);
  });

  it('Project Finish tile falls back to scd_end_date (CPM-calculated finish) when plan_end_date (must-finish constraint) is blank', () => {
    // Most real XERs never have an explicit must-finish constraint set — plan_end_date
    // is optional and frequently empty. The calculated project finish always lives in
    // scd_end_date. Reading plan_end_date only (the old bug) showed '—' for these files.
    const A = parseXer(readFileSync(join(FIX, 'blank-plan-end-date.xer'), 'utf-8'), { filename: 'blank-plan-end-date.xer' });
    prefsStore.set({ ...prefsStore.get(), dashboardLayout: ['project-finish'] });
    const el = render({ A, B: null });
    document.body.appendChild(el);
    const cards = [...el.querySelectorAll('.lens-dash-canvas .kpi')];
    const finishCard = cards.find(c => c.querySelector('.kpi-title')?.textContent === 'Project Finish');
    expect(finishCard).toBeTruthy();
    expect(finishCard.querySelector('.kpi-big').textContent).toBe('2026-08-15');
    expect(finishCard.querySelector('.kpi-big').textContent).not.toBe('—');
    document.body.removeChild(el);
  });

  it('skips a saved tile id that no longer exists in the catalog, still renders the valid tile, and shows an unavailable-tile notice', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    prefsStore.set({ ...prefsStore.get(), dashboardLayout: ['total-activities', 'no-such-tile-xyz'] });
    const el = render({ A, B: null });
    document.body.appendChild(el);

    const cards = [...el.querySelectorAll('.lens-dash-canvas .kpi')];
    expect(cards.length).toBe(1);
    const totalActivitiesCard = cards.find(c => c.querySelector('.kpi-title')?.textContent === 'Total Activities');
    expect(totalActivitiesCard).toBeTruthy();
    expect(totalActivitiesCard.querySelector('.kpi-big').textContent).toBe('2');

    const notice = el.querySelector('.lens-dash-canvas .lens-table-foot');
    expect(notice).toBeTruthy();
    expect(notice.textContent).toMatch(/1 saved tile.*no longer available/i);

    document.body.removeChild(el);
  });

  it('does not show an unavailable-tile notice when every saved tile id resolves to a real tile', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    prefsStore.set({ ...prefsStore.get(), dashboardLayout: ['total-activities', 'pct-complete'] });
    const el = render({ A, B: null });
    document.body.appendChild(el);

    const notice = el.querySelector('.lens-dash-canvas .lens-table-foot');
    expect(notice).toBeFalsy();

    document.body.removeChild(el);
  });
});
