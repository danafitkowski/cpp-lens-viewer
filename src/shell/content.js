import { h, mount } from '../lib/dom.js';
import { findSection } from '../sections/_registry.js';
import { navStore } from '../state/nav.js';
import { modelStore } from '../state/model.js';

export function renderContent() {
  const root = h('main', { class: 'lens-content', id: 'lens-main', tabindex: '-1' });

  function rerender() {
    const { active } = navStore.get();
    const { A, B } = modelStore.get();
    const section = findSection(active);
    if (!section) {
      mount(root, h('div', {}, 'Unknown section.'));
      return;
    }
    // FX-009: error boundary — a throw inside any one section's render (e.g. a
    // malformed XER tripping a parser invariant such as a circular WBS) must not
    // propagate out of this store-subscribe callback and wedge the whole content
    // pane + nav. Catch it and mount a recoverable error card instead.
    try {
      mount(root, section.render({ A, B }));
    } catch (err) {
      mount(root, h('div', { class: 'lens-section-content' }, [
        h('div', { class: 'lens-card' }, [
          h('h3', {}, 'This section could not render'),
          h('p', {}, (err && err.message) ? String(err.message) : 'An unexpected error occurred rendering this section.'),
          h('p', { class: 'lens-section-stub' }, 'Other sections are unaffected — pick another from the sidebar, or reload the schedule.')
        ])
      ]));
    }
  }

  navStore.subscribe(rerender);
  modelStore.subscribe(rerender);
  rerender();

  return root;
}
