// @vitest-environment happy-dom
//
// The three week cards are each roughly a third of the pane while their tables
// carry ten columns, so the right-most columns (Status / Notes) used to clip
// behind an invisible overflow edge with no cue. The fix is CSS keyed on the
// lens-week-card class: a legible minimum table width, overflow-x scrolling,
// and painted scroll shadows as the visible affordance. This test pins the
// class to the cards and the treatment to the class, so neither half can be
// dropped without failing the build.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { render } from '../../src/sections/lookahead.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');
const CSS = readFileSync(join(__dirname, '..', '..', 'src', 'shell', 'shell.css'), 'utf-8');

describe('3-Week Lookahead week-table overflow', () => {
  it('marks all three week cards with the scroll-treatment class', () => {
    const A = parseXer(readFileSync(join(FIX, 'lookahead-span-two-weeks.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelectorAll('.lens-week-card').length).toBe(3);
  });

  it('the class carries sideways scrolling with a visible cue', () => {
    // Scoped rule exists...
    const rule = CSS.match(/\.lens-week-card \.lens-table-wrap\s*\{[^}]*\}/);
    expect(rule, 'shell.css lost the .lens-week-card .lens-table-wrap rule').toBeTruthy();
    // ...and it scrolls horizontally with the scroll-shadow affordance
    // (background-attachment: local gradients ride the content edges).
    expect(rule[0]).toContain('overflow-x: auto');
    expect(rule[0]).toContain('background-attachment: local, local, scroll, scroll');
    // The table keeps a legible minimum width instead of crushing 10 columns
    // into a third of the pane.
    expect(CSS).toMatch(/\.lens-week-card \.lens-table\s*\{\s*min-width:\s*\d{3,}px;\s*\}/);
  });
});
