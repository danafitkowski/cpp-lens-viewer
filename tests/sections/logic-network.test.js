// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/logic-network.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Logic Network', () => {
  it('renders empty-state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders relationship distribution table when XER is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // Distribution table has 5 rows (PR_FS, PR_SS, PR_FF, PR_SF, Other)
    const tables = el.querySelectorAll('tbody');
    expect(tables.length).toBeGreaterThan(0);
    const firstTableRows = tables[0].querySelectorAll('tr');
    expect(firstTableRows.length).toBe(5);
  });
});
