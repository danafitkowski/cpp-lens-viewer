// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/data-dictionary.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Data Dictionary', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders KPI row when loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(3);
  });

  it('shows present tables from fixture', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toContain('TASK');
    expect(el.textContent).toContain('PROJECT');
  });

  it('applies a real color-coded background to Lens-reads badges (not unstyled text)', () => {
    const cssPath = join(__dirname, '..', '..', 'src', 'shell', 'shell.css');
    const style = document.createElement('style');
    style.textContent = readFileSync(cssPath, 'utf-8');
    document.head.appendChild(style);

    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    document.body.appendChild(el);

    const badge = el.querySelector('.lens-badge-full');
    expect(badge).not.toBeNull();

    const bg = getComputedStyle(badge).backgroundColor;
    expect(bg).not.toBe('');
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('transparent');
  });
});
