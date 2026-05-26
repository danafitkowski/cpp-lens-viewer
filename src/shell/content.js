import { h, mount } from '../lib/dom.js';
import { findSection } from '../sections/_registry.js';
import { navStore } from '../state/nav.js';
import { modelStore } from '../state/model.js';

export function renderContent() {
  const root = h('main', { class: 'lens-content' });

  function rerender() {
    const { active } = navStore.get();
    const { A, B } = modelStore.get();
    const section = findSection(active);
    if (!section) {
      mount(root, h('div', {}, 'Unknown section.'));
      return;
    }
    mount(root, section.render({ A, B }));
  }

  navStore.subscribe(rerender);
  modelStore.subscribe(rerender);
  rerender();

  return root;
}
