// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/dashboard.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

// ─────────────────────────────────────────────────────────────────────────────
// negative-float.xer carries the condition every previous dashboard fixture
// lacked: an activity with NEGATIVE total float. minimal-3-task.xer has floats
// of 0 and 16 only, so an "=== 0" test and a "<= 0" test give the same answer
// on it and the whole suite stayed green while the shipped card was wrong.
//
// Floats in the fixture are -40 / 0 / 8 / 8 hours (-5 / 0 / 1 / 1 working days).
// The honest answer for "total float <= 0" is 2 of 4 = 50%. The shipped
// "=== 0" computation gives 1 of 4 = 25%, dropping the ONE activity that is
// already behind — the row a forensic reader is looking for.
//
// The same fixture has exactly one TK_Complete activity and every
// phys_complete_pct = 0, so an activity-count ratio reads 25% while anything
// actually derived from phys_complete_pct reads 0%. A card headed "Percent
// complete" over 25% is telling the reader the project is a quarter built.
// ─────────────────────────────────────────────────────────────────────────────

function loadFixture(name) {
  return parseXer(readFileSync(join(FIX, name), 'utf-8'), { filename: name });
}

function cardByTitle(el, title) {
  return [...el.querySelectorAll('.kpi')]
    .find(c => c.querySelector('.kpi-title')?.textContent === title);
}

function bigOf(el, title) {
  return cardByTitle(el, title)?.querySelector('.kpi-big')?.textContent;
}

function subOf(el, title) {
  return cardByTitle(el, title)?.querySelector('.kpi-sub')?.textContent;
}

describe('Dashboard float card counts negative float, not just exactly zero', () => {
  it('the fixture really does contain negative float', () => {
    // Guard the fixture itself: if this ever stops holding, the tests below
    // become vacuous and would pass against the broken code again.
    const A = loadFixture('negative-float.xer');
    const floats = A.tables.TASK.records.map(t => parseFloat(t.total_float_hr_cnt));
    expect(floats.some(f => f < 0)).toBe(true);
    expect(floats.some(f => f === 0)).toBe(true);
    expect(floats.some(f => f > 0)).toBe(true);
  });

  it('reports 50% for "total float <= 0" on floats of -40 / 0 / 8 / 8', () => {
    const el = render({ A: loadFixture('negative-float.xer'), B: null });
    const card = cardByTitle(el, 'Zero or negative float');
    expect(card).toBeTruthy();
    expect(card.querySelector('.kpi-big').textContent).toBe('50%');
    // 25% is the shipped answer — the negative-float activity excluded.
    expect(card.querySelector('.kpi-big').textContent).not.toBe('25%');
  });

  it('shows the negative / zero split so the count can be reconciled', () => {
    const el = render({ A: loadFixture('negative-float.xer'), B: null });
    const sub = subOf(el, 'Zero or negative float');
    expect(sub).toMatch(/≤\s*0/);
    expect(sub).toMatch(/1 negative/);
    expect(sub).toMatch(/1 zero/);
  });

  it('agrees with the Critical activities card sitting beside it', () => {
    // The defect was two cards on one dashboard contradicting each other: the
    // critical card used <= 0 and read 2 (50%), the float card used === 0 and
    // read 25%. Both now come off one census, so they cannot diverge.
    const el = render({ A: loadFixture('negative-float.xer'), B: null });
    expect(bigOf(el, 'Critical activities')).toBe('2');
    expect(subOf(el, 'Critical activities')).toContain('50%');
    expect(bigOf(el, 'Zero or negative float')).toBe('50%');
  });

  it('does not head the card "Zero-float" while counting negative float too', () => {
    const el = render({ A: loadFixture('negative-float.xer'), B: null });
    const titles = [...el.querySelectorAll('.kpi-title')].map(t => t.textContent);
    expect(titles).not.toContain('Zero-float activities');
  });

  it('discloses activities with no float value, which sit in the denominator', () => {
    // A blank total_float_hr_cnt is neither zero nor negative, but it is still
    // counted in "of all activities". Say so, or the percentage cannot be
    // reconciled against the activity count.
    const A = loadFixture('negative-float.xer');
    A.tables.TASK.records.find(t => t.task_code === 'A1020').total_float_hr_cnt = '';
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/1 of 4 activities carry no total float value/);
    // The ≤ 0 population is untouched by a blank: still 2 of 4.
    expect(bigOf(el, 'Zero or negative float')).toBe('50%');
  });

  it('says nothing about null float when every activity has a value', () => {
    const el = render({ A: loadFixture('negative-float.xer'), B: null });
    expect(el.textContent).not.toMatch(/carry no total float value/);
  });
});

describe('Dashboard percentage is labelled for the quantity it computes', () => {
  it('the fixture drives activity-count and phys_complete_pct apart', () => {
    const A = loadFixture('negative-float.xer');
    const rows = A.tables.TASK.records;
    expect(rows.filter(t => t.status_code === 'TK_Complete').length).toBe(1);
    expect(rows.length).toBe(4);
    expect(rows.every(t => parseFloat(t.phys_complete_pct) === 0)).toBe(true);
  });

  it('does not present an activity-count ratio under a bare "Percent complete"', () => {
    const el = render({ A: loadFixture('negative-float.xer'), B: null });
    const titles = [...el.querySelectorAll('.kpi-title')].map(t => t.textContent);
    expect(titles).not.toContain('Percent complete');
  });

  it('names the 25% as a head-count of complete activities', () => {
    const el = render({ A: loadFixture('negative-float.xer'), B: null });
    const card = cardByTitle(el, 'Activities complete');
    expect(card).toBeTruthy();
    expect(card.querySelector('.kpi-big').textContent).toBe('25%');
    const sub = card.querySelector('.kpi-sub').textContent;
    expect(sub).toMatch(/by count/i);
    expect(sub).toMatch(/not physical % complete/i);
    expect(sub).toContain('1 of 4');
  });

  it('keeps the qualifier at 0%, where the two measures happen to agree', () => {
    const A = loadFixture('negative-float.xer');
    A.tables.TASK.records.find(t => t.task_code === 'A1000').status_code = 'TK_NotStart';
    const el = render({ A, B: null });
    expect(bigOf(el, 'Activities complete')).toBe('0%');
    expect(subOf(el, 'Activities complete')).toMatch(/by count/i);
  });
});
