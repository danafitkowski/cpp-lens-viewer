// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render } from '../../src/sections/xer-utilities.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('XER Utilities', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders 4 utility cards when loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelectorAll('.util-card').length).toBe(4);
  });

  it('shows POBS Cleaner with present/absent status', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/POBS/i);
    expect(el.textContent).toMatch(/present/i);
  });

  it('renders buttons for downloads', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const buttons = [...el.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    expect(buttons.some(b => /pobs/i.test(b.textContent))).toBe(true);
    expect(buttons.some(b => /anonymized/i.test(b.textContent))).toBe(true);
    expect(buttons.some(b => /calendar/i.test(b.textContent))).toBe(true);
    expect(buttons.some(b => /schema/i.test(b.textContent))).toBe(true);
  });
});
