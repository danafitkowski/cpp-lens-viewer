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
});
