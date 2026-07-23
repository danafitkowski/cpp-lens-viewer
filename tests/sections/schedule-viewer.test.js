// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/schedule-viewer.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer, getTable } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Schedule Viewer', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders activity table from fixture', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('shows activity count in toolbar', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelector('.lens-count').textContent).toMatch(/\d+ activities/);
  });

  it('groups activities under WBS band rows, nested under the correct branch — not a flat list', () => {
    // Task Z1 (Area B) is listed BEFORE task A1 (Area A) in the raw XER, but the
    // viewer must render actual WBS band rows with activities nested underneath the
    // branch they belong to — a flat list (even one with a WBS text column) is not
    // "WBS format".
    const A = parseXer(readFileSync(join(FIX, 'wbs-sort-order.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const bandNames = [...el.querySelectorAll('.wbs-band-row .wbs-band-name')].map(n => n.textContent);
    expect(bandNames).toEqual(expect.arrayContaining(['Project', 'Area A', 'Area B']));

    const allRows = [...el.querySelectorAll('tbody tr')];
    const indexOf = (pred) => allRows.findIndex(pred);
    const areaABand = indexOf(r => r.classList.contains('wbs-band-row') && r.textContent.includes('Area A'));
    const areaBBand = indexOf(r => r.classList.contains('wbs-band-row') && r.textContent.includes('Area B'));
    const a1Row = indexOf(r => r.textContent.includes('A1') && !r.classList.contains('wbs-band-row'));
    const z1Row = indexOf(r => r.textContent.includes('Z1') && !r.classList.contains('wbs-band-row'));
    expect(areaABand).toBeGreaterThanOrEqual(0);
    expect(areaABand).toBeLessThan(a1Row);
    expect(a1Row).toBeLessThan(areaBBand);
    expect(areaBBand).toBeLessThan(z1Row);
  });

  it('collapsing a WBS band hides its activities without losing them from the underlying data', () => {
    const A = parseXer(readFileSync(join(FIX, 'wbs-sort-order.xer'), 'utf-8'));
    const el = render({ A, B: null });
    document.body.appendChild(el);
    const areaABand = [...el.querySelectorAll('.wbs-band-row')].find(r => r.textContent.includes('Area A'));
    areaABand.click();
    // Check activity rows specifically, not band rows — "Area A" + "1 act" concatenates
    // to "...A1 act", which would false-positive-match a loose textContent.includes('A1').
    const stillHasA1Row = [...el.querySelectorAll('tr.lens-activity-row')].some(r => r.textContent.includes('A1'));
    expect(stillHasA1Row).toBe(false);
    // Total activity count in the toolbar must be unaffected by collapse state.
    expect(el.querySelector('.lens-count').textContent).toMatch(/2 activities/);
    document.body.removeChild(el);
  });

  it('never drops an activity: total rendered activity rows equal the parsed task count, across every WBS branch', () => {
    const A = parseXer(readFileSync(join(FIX, 'deep-wbs.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const activityRows = [...el.querySelectorAll('tbody tr')].filter(r => !r.classList.contains('wbs-band-row'));
    expect(activityRows.length).toBe(getTable(A, 'TASK').length);
  });

  it('search input filters rows in real time', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    document.body.appendChild(el);
    const search = el.querySelector('input[type="search"]');
    const before = el.querySelectorAll('tbody tr').length;
    search.value = 'nonexistent-search-term-zzzzz';
    search.dispatchEvent(new Event('input'));
    expect(el.querySelectorAll('tbody tr').length).toBe(0);
    expect(before).toBeGreaterThan(0);
    document.body.removeChild(el);
  });
});
