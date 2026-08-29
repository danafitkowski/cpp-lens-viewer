/**
 * Print support for the viewer.
 *
 * Two pieces:
 *   1. buildPrintHeader() — a branded strip mounted at the top of the content
 *      pane, hidden on screen and shown only by the @media print block in
 *      shell.css. It carries what a fileable exhibit needs on its face: the
 *      CPP wordmark, the viewer version (the same string reported to the
 *      Engine as lensVersion), the loaded filename, the schedule's data date,
 *      and a print timestamp.
 *   2. buildPrintButton() — the small "Print this section" control in the app
 *      header. The content pane renders exactly one section at a time, so
 *      window.print() with the print stylesheet (which hides the header,
 *      sidebar, and button, and unclamps every scroll container) prints the
 *      active section alone on a white page.
 *
 * The timestamp is re-stamped on the browser's beforeprint event so the
 * printed time is the time of printing, not the time the section rendered.
 */

import { h } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { LENS_VERSION } from '../version.js';

function fmtTimestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Build the print-only header for the active section.
 *
 * @param {{ A: object|null, sectionTitle: string }} args
 * @returns {HTMLElement}
 */
export function buildPrintHeader({ A, sectionTitle }) {
  const filename = A ? (A.filename || '(unnamed)') : 'no schedule loaded';
  let dataDate = '';
  if (A) {
    const projects = getTable(A, 'PROJECT');
    dataDate = ((projects[0] || {}).last_recalc_date || '').slice(0, 10);
  }

  const meta = [
    h('span', {}, `Section: ${sectionTitle}`),
    h('span', {}, `File: ${filename}`)
  ];
  if (dataDate) meta.push(h('span', {}, `Data date: ${dataDate}`));
  meta.push(h('span', {}, `CPP Lens v${LENS_VERSION}`));
  meta.push(h('span', { class: 'lens-print-ts' }, `Printed: ${fmtTimestamp()}`));

  // aria-hidden: the strip is display:none on screen and purely presentational
  // when printed; it must not add noise for screen-reader users.
  return h('div', { class: 'lens-print-header', 'aria-hidden': 'true' }, [
    h('div', { class: 'print-brand' }, [
      'Critical Path Partners',
      h('span', { class: 'print-sub' }, 'CPP Lens · Primavera P6 viewer + forensic engine')
    ]),
    h('div', { class: 'print-meta' }, meta)
  ]);
}

// Re-stamp every print timestamp at print time. Registered once at module
// load; the content pane holds at most one print header at a time, but the
// selector sweep keeps this correct even if that changes.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeprint', () => {
    for (const el of document.querySelectorAll('.lens-print-ts')) {
      el.textContent = `Printed: ${fmtTimestamp()}`;
    }
  });
}

/**
 * The "Print this section" control for the app header.
 *
 * @returns {HTMLElement}
 */
export function buildPrintButton() {
  return h('button', {
    class: 'lens-print-btn',
    type: 'button',
    title: 'Print the active section with a branded exhibit header',
    onclick: () => { window.print(); }
  }, 'Print this section');
}
