// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHeader } from '../../src/shell/header.js';
import { renderSidebar } from '../../src/shell/sidebar.js';
import { renderContent } from '../../src/shell/content.js';
import { navStore } from '../../src/state/nav.js';
import { modelStore } from '../../src/state/model.js';

describe('shell', () => {
  beforeEach(() => {
    navStore.set({ active: 'dashboard' });
    modelStore.set({ A: null, B: null });
  });

  it('renders header with the no-XER status', () => {
    const el = renderHeader();
    expect(el.tagName).toBe('HEADER');
    expect(el.textContent).toContain('CPP Lens');
    expect(el.textContent).toContain('No XER loaded');
  });

  it('header status updates when modelStore changes', () => {
    const el = renderHeader();
    document.body.appendChild(el);
    modelStore.set({ A: { filename: 'demo.xer' }, B: null });
    expect(el.textContent).toContain('demo.xer loaded');
    document.body.removeChild(el);
  });

  it('sidebar renders 29 section buttons + 6 group headers', () => {
    const el = renderSidebar();
    expect(el.querySelectorAll('nav button')).toHaveLength(29);
    expect(el.querySelectorAll('nav .group')).toHaveLength(6);
  });

  it('clicking a sidebar button updates navStore', () => {
    const el = renderSidebar();
    document.body.appendChild(el);
    const ganttBtn = el.querySelector('button[data-id="gantt"]');
    ganttBtn.click();
    expect(navStore.get().active).toBe('gantt');
    document.body.removeChild(el);
  });

  it('content area renders the active section', () => {
    const el = renderContent();
    expect(el.textContent).toContain('Executive Dashboard');
    // dashboard now renders real empty-state when no XER is loaded
    expect(el.textContent).toContain('Drop an XER');
  });

  it('content swaps when navStore changes', () => {
    const el = renderContent();
    navStore.set({ active: 'gantt' });
    expect(el.textContent).toContain('Gantt Chart');
  });
});
