// @vitest-environment happy-dom
//
// Print path: a printed section is a fileable exhibit. The header carries a
// "Print this section" control, the content pane carries a print-only branded
// header (wordmark, viewer version, filename, data date, timestamp), and the
// @media print block in shell.css hides the app chrome and unclamps the
// scroll containers so the ACTIVE section prints in full on a white page.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { renderHeader } from '../../src/shell/header.js';
import { renderContent } from '../../src/shell/content.js';
import { buildPrintHeader } from '../../src/shell/print.js';
import { modelStore } from '../../src/state/model.js';
import { navStore } from '../../src/state/nav.js';
import { LENS_VERSION } from '../../src/version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');
const CSS = readFileSync(join(__dirname, '..', '..', 'src', 'shell', 'shell.css'), 'utf-8');

afterEach(() => {
  modelStore.set({ A: null, B: null });
  navStore.set({ active: 'dashboard' });
});

describe('Print this section control', () => {
  it('renders in the app header and calls window.print', () => {
    const el = renderHeader();
    const btn = el.querySelector('button.lens-print-btn');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('Print this section');
    const spy = vi.fn();
    window.print = spy;
    btn.dispatchEvent(new Event('click'));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('branded print header', () => {
  it('is mounted at the top of the content pane for the active section', () => {
    const el = renderContent();
    const ph = el.querySelector('.lens-print-header');
    expect(ph).toBeTruthy();
    expect(el.firstChild).toBe(ph);
    expect(ph.textContent).toContain('Critical Path Partners');
    expect(ph.textContent).toContain('CPP Lens');
    expect(ph.textContent).toContain(`CPP Lens v${LENS_VERSION}`);
    expect(ph.textContent).toContain('Section: Executive Dashboard');
    expect(ph.textContent).toContain('no schedule loaded');
    expect(ph.textContent).toContain('Printed:');
  });

  it('names the loaded file, its data date, and the active section', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'), { filename: 'jobsite.xer' });
    const el = renderContent();
    modelStore.set({ A, B: null });
    navStore.set({ active: 'lookahead' });
    const ph = el.querySelector('.lens-print-header');
    expect(ph.textContent).toContain('File: jobsite.xer');
    expect(ph.textContent).toContain('Section: 3-Week Lookahead');
    // Data date comes from PROJECT.last_recalc_date when the fixture carries one.
    const recalc = ((A.tables?.PROJECT?.records || [])[0]?.last_recalc_date || '').slice(0, 10);
    if (recalc) expect(ph.textContent).toContain(`Data date: ${recalc}`);
  });

  it('is hidden from assistive tech and from the screen stylesheet', () => {
    const ph = buildPrintHeader({ A: null, sectionTitle: 'Anything' });
    expect(ph.getAttribute('aria-hidden')).toBe('true');
    expect(CSS).toMatch(/\.lens-print-header\s*\{\s*display:\s*none/);
  });
});

describe('print stylesheet', () => {
  const printBlock = CSS.slice(CSS.indexOf('@media print'));

  it('exists', () => {
    expect(CSS).toContain('@media print');
  });

  it('hides the app chrome so only the active section prints', () => {
    expect(printBlock).toMatch(/header\.lens-header,\s*\n?\s*aside\.lens-sidebar,[\s\S]*?display:\s*none\s*!important/);
    expect(printBlock).toContain('.lens-print-btn { display: none !important; }');
  });

  it('prints on a white page and reveals the branded header', () => {
    expect(printBlock).toMatch(/body\s*\{\s*background:\s*#FFFFFF/i);
    expect(printBlock).toMatch(/\.lens-print-header\s*\{\s*\n?\s*display:\s*block/);
  });

  it('unclamps scroll containers (paper cannot scroll)', () => {
    expect(printBlock).toMatch(/\.lens-table-wrap\s*\{[^}]*max-height:\s*none/);
    expect(printBlock).toMatch(/\.lens-table-wrap\s*\{[^}]*overflow:\s*visible/);
  });
});
