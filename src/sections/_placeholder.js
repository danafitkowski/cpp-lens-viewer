import { h } from '../lib/dom.js';

export function renderPlaceholder({ title, groupLabel }) {
  return h('div', { class: 'lens-section-placeholder' }, [
    h('h2', {}, title),
    h('p', { class: 'lens-section-group' }, groupLabel),
    h('div', { class: 'lens-section-stub' }, 'Coming soon. This section is part of a later Plan 2 sub-plan.')
  ]);
}
