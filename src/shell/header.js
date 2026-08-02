import { h } from '../lib/dom.js';
import { modelStore } from '../state/model.js';

export function renderHeader() {
  const statusSpan = h('div', { class: 'status', id: 'lens-status', role: 'status', 'aria-live': 'polite' }, 'No XER loaded');
  const el = h('header', { class: 'lens-header' }, [
    // A11Y/SEO: this is the page's one real heading, so it is an h1 rather than a
    // div. The only other h1 in the bundle lives inside <noscript>, which renders
    // only when JS is off — and in that case this one is never created, so the
    // document always has exactly one h1. Styling is class-based and unchanged.
    h('h1', { class: 'brand' }, 'CPP Lens'),
    h('div', { class: 'tagline' }, 'Primavera P6 viewer + forensic engine'),
    h('div', { class: 'spacer' }),
    statusSpan
  ]);
  modelStore.subscribe(({ A, B }) => {
    let msg = 'No XER loaded';
    if (A) msg = `${A.filename || '(unnamed)'} loaded`;
    if (A && B) msg = `${A.filename} | comparing with ${B.filename}`;
    statusSpan.textContent = msg;
  });
  return el;
}
