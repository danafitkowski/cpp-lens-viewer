// @vitest-environment happy-dom
//
// On a phone the header must wrap, not widen the page.
//
// The header is one flex row: brand, tagline, spacer, status, Print, Privacy.
// It had no flex-wrap, and the status holds the loaded file names, which are
// long unbroken strings (underscores give a browser nowhere to break). Measured
// in a 390 px viewport with the public demonstration pair loaded: the document
// grew to 546 px (540 px with one file), Print sat at x 415 to 479 and Privacy
// at 509 to 546, both off the right edge of the screen.
//
// happy-dom does no layout, so this pins the two CSS properties that fix it, the
// same way lookahead-scroll-cue.test.js pins its overflow rule. The layout
// itself was measured in a real browser at 390 px before and after; the
// figures are in the commit message.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHeader } from '../../src/shell/header.js';
import { modelStore } from '../../src/state/model.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(__dirname, '..', '..', 'src', 'shell', 'shell.css'), 'utf-8');

describe('header on a narrow screen', () => {
  beforeEach(() => { modelStore.set({ A: null, B: null }); });

  it('wraps its controls onto a second line instead of pushing them off the screen', () => {
    const rule = CSS.match(/header\.lens-header\s*\{[^}]*\}/);
    expect(rule, 'shell.css lost the header.lens-header rule').toBeTruthy();
    expect(rule[0]).toContain('flex-wrap: wrap');
  });

  it('lets a long file name break inside the status instead of setting the page width', () => {
    const rule = CSS.match(/header\.lens-header \.status\s*\{[^}]*\}/);
    expect(rule, 'shell.css lost the header .status rule').toBeTruthy();
    // min-width: 0 lets the flex item shrink below its content; overflow-wrap:
    // anywhere gives an unbroken name somewhere to break.
    expect(rule[0]).toContain('min-width: 0');
    expect(rule[0]).toContain('overflow-wrap: anywhere');
  });

  it('the status is the element that carries both file names', () => {
    const el = renderHeader();
    modelStore.set({
      A: { filename: 'A_Long_Unbroken_Current_Schedule_File_Name.xer' },
      B: { filename: 'A_Long_Unbroken_Baseline_Schedule_File_Name.xer' }
    });
    const status = el.querySelector('.status');
    expect(status.textContent).toContain('A_Long_Unbroken_Current_Schedule_File_Name.xer');
    expect(status.textContent).toContain('A_Long_Unbroken_Baseline_Schedule_File_Name.xer');
    // Print and Privacy are still in the header, after the status.
    expect(el.querySelector('.lens-print-btn')).toBeTruthy();
    expect(el.querySelector('.privacy-link')).toBeTruthy();
  });
});
