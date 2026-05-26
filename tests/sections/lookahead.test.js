// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/lookahead.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('3-Week Lookahead', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders KPI cards when loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(5);
  });

  it('renders three week-cards', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/Week 1/i);
    expect(el.textContent).toMatch(/Week 2/i);
    expect(el.textContent).toMatch(/Week 3/i);
  });
});
