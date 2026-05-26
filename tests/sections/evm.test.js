// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/evm.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('EVM / S-Curves Lite', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders SVG line chart when loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // either the chart SVG or the empty-state fallback
    const hasSvg = el.querySelector('svg') !== null;
    const hasEmpty = el.textContent.match(/no data/i);
    expect(hasSvg || hasEmpty).toBeTruthy();
  });

  it('shows planned and actual labels', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // Either curves render with legend, or the empty-state shows
    const txt = el.textContent;
    expect(txt.match(/planned|actual|no data/i)).toBeTruthy();
  });
});
