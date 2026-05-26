// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/schedule-viewer.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Schedule Viewer', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders activity table from fixture', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('shows activity count in toolbar', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelector('.lens-count').textContent).toMatch(/\d+ activities/);
  });

  it('search input filters rows in real time', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    document.body.appendChild(el);
    const search = el.querySelector('input[type="search"]');
    const before = el.querySelectorAll('tbody tr').length;
    search.value = 'nonexistent-search-term-zzzzz';
    search.dispatchEvent(new Event('input'));
    expect(el.querySelectorAll('tbody tr').length).toBe(0);
    expect(before).toBeGreaterThan(0);
    document.body.removeChild(el);
  });
});
