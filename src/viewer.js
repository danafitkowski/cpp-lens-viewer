import { renderHeader } from './shell/header.js';
import { renderSidebar } from './shell/sidebar.js';
import { renderContent } from './shell/content.js';
import { h } from './lib/dom.js';
import './shell/shell.css';

export function mountViewer(rootEl) {
  rootEl.appendChild(renderHeader());
  rootEl.appendChild(h('div', { class: 'lens-app' }, [
    renderSidebar(),
    renderContent()
  ]));
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('lens-root') || document.body;
    mountViewer(root);
  });
}
