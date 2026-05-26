// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { dataTable } from '../../src/sections/_shared/data-table.js';

describe('dataTable', () => {
  it('renders headers + rows', () => {
    const el = dataTable({
      columns: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }],
      rows: [{ id: '1', name: 'Alpha' }, { id: '2', name: 'Beta' }]
    });
    expect(el.querySelectorAll('thead th')).toHaveLength(2);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.textContent).toContain('Alpha');
  });

  it('shows empty-state when rows is []', () => {
    const el = dataTable({ columns: [{ key: 'x', label: 'X' }], rows: [] });
    expect(el.textContent).toMatch(/no rows|no data/i);
  });

  it('cell renderer overrides default text', () => {
    const el = dataTable({
      columns: [{ key: 'n', label: 'N', render: (v) => v + '!' }],
      rows: [{ n: 'hi' }]
    });
    expect(el.textContent).toContain('hi!');
  });

  it('limit caps row count and shows truncation footer', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ x: String(i) }));
    const el = dataTable({ columns: [{ key: 'x', label: 'X' }], rows, limit: 50 });
    expect(el.querySelectorAll('tbody tr')).toHaveLength(50);
    expect(el.textContent).toMatch(/showing 50 of 100/i);
  });

  it('uses custom emptyMsg when provided', () => {
    const el = dataTable({ columns: [{ key: 'x', label: 'X' }], rows: [], emptyMsg: 'No activities.' });
    expect(el.textContent).toContain('No activities.');
  });
});
