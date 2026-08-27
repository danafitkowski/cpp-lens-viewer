// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '../../src/sections/engine-parity.js';

/**
 * Render-side checks for the Engine Parity section. The figure-vs-SSOT checks
 * live in tests/unit/engine-parity.test.js, which runs in the node environment;
 * this file needs a DOM, so it sits in tests/sections/ per this repo's
 * environmentMatchGlobs.
 */

describe('engine parity section', () => {
  it('lists every one of the thirteen cases, never a subset', () => {
    const el = render({ A: null, B: null });
    const rows = el.querySelectorAll('tbody tr');
    // 13 case rows + 4 limitation rows across the two tables.
    expect(rows.length).toBe(20); // 13 cases + 7 limits
    const text = el.textContent;
    for (const n of ['01', '02', '03', '04', '05', '06', '07', '08', '09',
                     '10', '11', '12', '13']) {
      expect(text).toContain(n);
    }
  });

  it('discloses that the P6 result is fitted, not blind', () => {
    // The single most important disclosure on the page. The first version of
    // this section omitted it and published 13 of 13 as if it were blind.
    const text = render({ A: null, B: null }).textContent;
    expect(text).toContain('Fitted, not blind');
    expect(text).toMatch(/first blind run/i);
    expect(text).toMatch(/6 of 13/);
    expect(text).toMatch(/fitted to/);
  });

  it('discloses that the port total skips comparisons', () => {
    const text = render({ A: null, B: null }).textContent;
    expect(text).toMatch(/skipped rather than failed/);
    // Surface history: 989 -> 995 at v2.9.41, which retired three alert-parity
    // carve-outs, then 995 -> 1015 when a 46th fixture landed and two engine
    // defects were fixed (a transposed constraint-date column read, and the
    // missing SS/SF late-finish conversion in the backward pass). Those two
    // fixes are why the skips collapsed from 64 to 6: the Python reference now
    // emits a signed free-float value everywhere the JavaScript engine does,
    // except on three fixtures where NEITHER assigns one.
    //
    // These are the RENDERED strings. tests/unit/engine-parity.test.js is the
    // one that runs the real harness and pins these same numbers to it, so a
    // figure cannot be updated here without the harness agreeing.
    expect(text).toMatch(/1009 of 1015/);
    expect(text).toMatch(/43 of 46/);
    expect(text).toMatch(/not a pass rate/);
  });

  it('states the limits and the boundary on the same page as the results', () => {
    const text = render({ A: null, B: null }).textContent;
    expect(text).toContain('Day granular');
    expect(text).toContain('No resource levelling');
    expect(text).toContain('Same author, both ports');
    expect(text).toMatch(/no second implementation/);
    // The boundary sentence is the point of the section.
    expect(text).toMatch(/covers the CPM engine/);
    expect(text).toMatch(/not a delay analysis/);
  });

  it('does not present either headline as a clean pass rate', () => {
    const text = render({ A: null, B: null }).textContent;
    // "925 / 925" on its own was the misleading form. It may appear inside the
    // explanation, but the KPI must carry the counted total.
    expect(text).toMatch(/Port agreement, counted/);
    expect(text).toMatch(/Against P6, fitted/);
  });

  it('renders using only classes the shell stylesheet defines', () => {
    // A first draft invented lens-kpi-row / lens-kpi-label / lens-kpi-value /
    // lens-kpi-sub / lens-note, which would have rendered unstyled while looking
    // right in source. Pin the ones that exist.
    const css = readFileSync(join(process.cwd(), 'src', 'shell', 'shell.css'),
                             'utf8');
    const el = render({ A: null, B: null });
    const used = new Set();
    el.querySelectorAll('*').forEach(node => {
      for (const c of node.classList) used.add(c);
    });
    const missing = [...used].filter(c => !css.includes('.' + c));
    expect(missing, `classes not in shell.css: ${missing.join(', ')}`)
      .toHaveLength(0);
  });
});
