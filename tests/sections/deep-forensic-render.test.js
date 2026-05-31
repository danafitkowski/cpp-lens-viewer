import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/deep-forensic.js';

describe('deep-forensic render', () => {
  it('shows a load prompt when no model is present', () => {
    const node = render({ A: null, B: null });
    expect(node.textContent).toMatch(/Load an XER/i);
  });
  it('renders the run button + an (empty) result-panel slot when a model is present', () => {
    const fakeModel = { tables: {}, ermhdr: {} };
    const node = render({ A: fakeModel, B: null });
    const runBtn = [...node.querySelectorAll('button')].find(b => /run deep forensic/i.test(b.textContent));
    expect(runBtn).toBeTruthy();
    // No analysis has run, so there must be NO iframe yet (and thus no live network fetch).
    expect(node.querySelector('iframe')).toBeNull();
  });
});
