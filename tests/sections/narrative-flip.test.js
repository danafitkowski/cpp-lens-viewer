// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/narrative-flip.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Narrative Flip', () => {
  it('shows empty-state when only A is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.textContent).toMatch(/two XERs|load|baseline/i);
  });

  it('renders KPI cards when both XERs loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B });
    expect(el.querySelectorAll('.kpi').length).toBeGreaterThanOrEqual(4);
  });

  it('shows zero flips when codes are identical', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const B = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B });
    expect(el.textContent).toContain('0');
  });
});
