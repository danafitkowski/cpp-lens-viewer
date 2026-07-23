// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/compare-page.js';

describe('How Lens Compares', () => {
  it('renders without an XER (static content)', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('How Lens compares');
    expect(el.textContent).toContain('XER read');
  });

  it('renders three column headers (other / Lens free / Lens + Forensic)', () => {
    const el = render({ A: null, B: null });
    const headers = [...el.querySelectorAll('th')].map(th => th.textContent.trim());
    expect(headers).toContain('Other browser viewers');
    expect(headers).toContain('Lens (free)');
    expect(headers).toContain('Lens + Forensic Engine');
  });

  it('contains every feature row from the design spec', () => {
    const el = render({ A: null, B: null });
    const text = el.textContent;
    expect(text).toContain('XER read');
    expect(text).toContain('DCMA Lite');
    expect(text).toContain('XER writer');
    expect(text).toContain('Path Explorer');
    expect(text).toContain('Half-Step XER');
    expect(text).toContain('Monte Carlo');
    // "Daubert-grade" was deliberately softened sitewide in the 2026-07 audit pass
    // (Dana's call) — "Court-disclosure footers" is the replacement row, not a typo.
    expect(text).toContain('Court-disclosure footers');
  });

  it('does not name any specific competitor', () => {
    const el = render({ A: null, B: null });
    const text = el.textContent.toLowerCase();
    expect(text).not.toContain('aurora');
  });

  it('renders contact footer', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toMatch(/get in touch|contact/i);
  });
});
