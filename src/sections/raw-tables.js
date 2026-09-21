import { h, clear } from '../lib/dom.js';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';
import { download } from '../lib/download.js';
// The CSV writer, formula-injection guard included, lives in lib/csv.js so the
// comparison registers export through the same one.
import { buildCsv } from '../lib/csv.js';

const MAX_ROWS = 5000;

function renderTableContent(container, A, tableName) {
  clear(container);

  const tableData = A.tables[tableName];
  if (!tableData) {
    container.appendChild(h('div', { class: 'lens-card' }, [
      h('p', {}, `Table "${tableName}" not found.`)
    ]));
    return;
  }

  const { fields, records } = tableData;

  // KPI: row count
  container.appendChild(
    h('div', { class: 'kpi-grid' }, [
      kpiCard({ title: 'Rows', big: records.length, sub: tableName, tone: 'ink' })
    ])
  );

  // Download button
  const dlBtn = h('button', {
    class: 'lens-btn',
    style: { marginBottom: '12px' }
  }, `Download ${tableName}.csv`);
  dlBtn.addEventListener('click', () => {
    const csv = buildCsv(fields, records);
    download(csv, `${tableName}.csv`, 'text/csv');
  });
  container.appendChild(dlBtn);

  // Data table
  const columns = fields.map(f => ({ key: f, label: f }));
  container.appendChild(
    h('div', { class: 'lens-card' }, [
      dataTable({ columns, rows: records, limit: MAX_ROWS, emptyMsg: 'No records.' })
    ])
  );
}

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Raw Tables'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const tableNames = Object.keys(A.tables).sort();
  const defaultTable = tableNames[0] || '';

  // Dropdown
  const select = h('select', { class: 'lens-select', style: { marginBottom: '16px' } });
  for (const name of tableNames) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  select.value = defaultTable;

  // Content container — re-rendered on dropdown change
  const contentWrap = h('div', {});
  renderTableContent(contentWrap, A, defaultTable);

  select.addEventListener('change', () => {
    renderTableContent(contentWrap, A, select.value);
  });

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Raw Tables'),
    select,
    contentWrap
  ]);
}
