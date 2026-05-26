// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/dashboard.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Executive Dashboard', () => {
  it('renders empty state when A is null', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('Drop an XER');
  });

  it('renders KPI grid when A is loaded', () => {
    const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
    const A = parseXer(text, { filename: 'minimal-3-task.xer' });
    const el = render({ A, B: null });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(5);
    expect(el.textContent).toMatch(/Activities/i);
  });

  it('shows status banner with color tone', () => {
    const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
    const A = parseXer(text);
    const el = render({ A, B: null });
    const banner = el.querySelector('.lens-status-banner');
    expect(banner).toBeTruthy();
    expect(['green', 'amber', 'red']).toContain(banner.getAttribute('data-tone'));
  });

  it('shows half-step warning when ermhdr flag set', () => {
    const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
    const A = parseXer(text);
    A.ermhdr.isHalfStep = true;
    const el = render({ A, B: null });
    expect(el.textContent).toContain('Half-Step');
  });
});
