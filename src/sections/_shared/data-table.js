import { h } from '../../lib/dom.js';

export function dataTable({ columns, rows, limit = 0, emptyMsg = 'No rows.' }) {
  if (!rows || rows.length === 0) {
    return h('div', { class: 'lens-empty' }, emptyMsg);
  }
  const shown = limit > 0 ? rows.slice(0, limit) : rows;
  const truncated = shown.length < rows.length;
  const wrap = h('div', { class: 'lens-table-wrap' });
  const table = h('table', { class: 'lens-table' }, [
    h('thead', {}, h('tr', {}, columns.map(c => h('th', {}, c.label)))),
    h('tbody', {}, shown.map(r => h('tr', {}, columns.map(c => {
      const v = r[c.key];
      return h('td', {}, c.render ? String(c.render(v, r)) : (v == null ? '' : String(v)));
    }))))
  ]);
  wrap.appendChild(table);
  if (truncated) {
    wrap.appendChild(h('div', { class: 'lens-table-foot' }, `Showing ${shown.length} of ${rows.length} rows.`));
  }
  return wrap;
}
