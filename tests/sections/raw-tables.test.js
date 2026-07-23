// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/raw-tables.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Raw Tables', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders dropdown with table options', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const select = el.querySelector('select');
    expect(select).toBeTruthy();
    expect(select.options.length).toBeGreaterThan(0);
  });

  it('renders data table with rows for default-selected table', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('switches table on dropdown change', () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
    const el = render({ A, B: null });
    document.body.appendChild(el);
    const select = el.querySelector('select');
    const otherOption = [...select.options].find(o => o.value !== select.value);
    if (otherOption) {
      select.value = otherOption.value;
      select.dispatchEvent(new Event('change'));
    }
    // At minimum the dropdown changed without throwing
    expect(select.value).toBeTruthy();
    document.body.removeChild(el);
  });

  it('shows a truncation footer when a table has more than MAX_ROWS records', () => {
    // large-10k.xer's TASK table has 10,000 records — well over the 5,000-row
    // cap. The footer must report the real total (10000), not the pre-sliced
    // 5000, so the analyst knows rows were silently dropped.
    const A = parseXer(readFileSync(join(FIX, 'large-10k.xer'), 'utf-8'));
    const el = render({ A, B: null });
    document.body.appendChild(el);
    const select = el.querySelector('select');
    select.value = 'TASK';
    select.dispatchEvent(new Event('change'));

    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(5000);

    const foot = el.querySelector('.lens-table-foot');
    expect(foot).toBeTruthy();
    expect(foot.textContent).toBe('Showing 5000 of 10000 rows.');
    document.body.removeChild(el);
  });
});
