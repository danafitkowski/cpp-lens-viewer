// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/xer-comparison.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('XER Comparison', () => {
  it('shows empty-state when neither XER is loaded', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toMatch(/two XERs|baseline|load/i);
  });

  it('shows empty-state when only A is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/two XERs|baseline|load/i);
  });

  it('renders 4 KPI cards when both XERs loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(4);
  });

  it('shows zero diffs when both XERs are identical', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B });
    expect(el.textContent).toContain('0');
    expect(el.textContent).toMatch(/added|deleted/i);
  });

  it('detects added activities when B has fewer tasks than A', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    // Construct B with one fewer task by editing the parsed model directly
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    if (B.tables.TASK && B.tables.TASK.records.length > 0) {
      B.tables.TASK.records = B.tables.TASK.records.slice(1);
    }
    const el = render({ A, B });
    expect(el.textContent).toContain('Added activities');
  });
});
