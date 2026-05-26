import { h, on } from '../lib/dom.js';
import { SECTIONS, GROUPS } from '../sections/_registry.js';
import { navStore } from '../state/nav.js';
import { modelStore } from '../state/model.js';
import { parseXer } from '@criticalpathpartners/lens-parser';

function renderFileBox() {
  const fileA = h('input', { type: 'file', accept: '.xer,.txt', id: 'lens-file-a' });
  const fileB = h('input', { type: 'file', accept: '.xer,.txt', id: 'lens-file-b' });
  const analyze = h('button', {}, 'Analyze');
  const reset = h('button', { class: 'secondary' }, 'Reset');

  on(analyze, 'click', async () => {
    const fa = fileA.files[0];
    if (!fa) { alert('Pick a current XER first.'); return; }
    const textA = await fa.text();
    const A = parseXer(textA, { filename: fa.name });
    let B = null;
    if (fileB.files[0]) {
      const fb = fileB.files[0];
      B = parseXer(await fb.text(), { filename: fb.name });
    }
    modelStore.set({ A, B });
  });

  on(reset, 'click', () => {
    fileA.value = '';
    fileB.value = '';
    modelStore.set({ A: null, B: null });
  });

  return h('div', { class: 'file-box' }, [
    h('label', {}, 'Current / update XER'), fileA,
    h('label', {}, 'Previous / baseline XER (optional)'), fileB,
    analyze, reset
  ]);
}

function renderNav() {
  const buttons = [];
  const buttonsById = {};
  const root = h('nav', {});

  for (const group of GROUPS) {
    root.appendChild(h('div', { class: 'group' }, group));
    for (const s of SECTIONS.filter(x => x.group === group)) {
      const b = h('button', { 'data-id': s.id }, s.title);
      on(b, 'click', () => navStore.set({ active: s.id }));
      root.appendChild(b);
      buttons.push(b);
      buttonsById[s.id] = b;
    }
  }

  navStore.subscribe(({ active }) => {
    for (const b of buttons) b.classList.remove('active');
    if (buttonsById[active]) buttonsById[active].classList.add('active');
  });

  const initial = navStore.get().active;
  if (buttonsById[initial]) buttonsById[initial].classList.add('active');

  return root;
}

export function renderSidebar() {
  return h('aside', { class: 'lens-sidebar' }, [
    renderFileBox(),
    renderNav()
  ]);
}
