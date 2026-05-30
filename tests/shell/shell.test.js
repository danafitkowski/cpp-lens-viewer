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

  // ── upload error handling (hardening) ─────────────────────────────────────
  // A bad upload must surface a visible message, not silently white-screen.
  const VALID_XER =
    'ERMHDR\t24.12\t2026-01-01\tProject\tadmin\tDemo\tdb\tProject Management\tUSD\n' +
    '%T\tPROJECT\n%F\tproj_id\tproj_short_name\n%R\t1\tDEMO\n' +
    '%T\tTASK\n%F\ttask_id\ttask_code\ttask_name\n%R\t1000\tA1\tMobilize\n%E\n';

  function setFiles(input, file) {
    Object.defineProperty(input, 'files', { value: file ? [file] : [], configurable: true });
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('shows an error (not silent failure) when Analyze clicked with no file', async () => {
    const el = renderSidebar();
    document.body.appendChild(el);
    el.querySelector('button').textContent; // ensure rendered
    const analyze = [...el.querySelectorAll('button')].find((b) => /analyze/i.test(b.textContent));
    analyze.click();
    await flush();
    expect(el.textContent.toLowerCase()).toContain('pick a current');
    expect(modelStore.get().A).toBeNull();
    document.body.removeChild(el);
  });

  it('loads a valid XER and reports activity count', async () => {
    const el = renderSidebar();
    document.body.appendChild(el);
    const fileA = el.querySelector('#lens-file-a');
    const analyze = [...el.querySelectorAll('button')].find((b) => /analyze/i.test(b.textContent));
    setFiles(fileA, new File([VALID_XER], 'demo.xer', { type: 'text/plain' }));
    analyze.click();
    await flush(); await flush();
    expect(modelStore.get().A).not.toBeNull();
    expect(el.textContent).toMatch(/Loaded\s+1\s+activit/i);
    document.body.removeChild(el);
  });

  it('rejects a non-XER file with a clear message and does not load it', async () => {
    const el = renderSidebar();
    document.body.appendChild(el);
    const fileA = el.querySelector('#lens-file-a');
    const analyze = [...el.querySelectorAll('button')].find((b) => /analyze/i.test(b.textContent));
    setFiles(fileA, new File(['just some notes, not a schedule'], 'notes.txt', { type: 'text/plain' }));
    analyze.click();
    await flush(); await flush();
    expect(modelStore.get().A).toBeNull();
    expect(el.textContent.toLowerCase()).toContain('no project or task');
    document.body.removeChild(el);
  });

  it('surfaces a parse error for malformed XML instead of crashing', async () => {
    const el = renderSidebar();
    document.body.appendChild(el);
    const fileA = el.querySelector('#lens-file-a');
    const analyze = [...el.querySelectorAll('button')].find((b) => /analyze/i.test(b.textContent));
    setFiles(fileA, new File(['<?xml version="1.0"?><APIBusinessObjects><unclosed>'], 'bad.xml', { type: 'text/xml' }));
    analyze.click();
    await flush(); await flush();
    // Either a parse error or a no-content message — both are graceful, neither crashes.
    expect(modelStore.get().A).toBeNull();
    expect(el.textContent.toLowerCase()).toMatch(/couldn.t read|no project or task/);
    document.body.removeChild(el);
  });
});
