import { h, clear } from '../lib/dom.js';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';
import { download } from '../lib/download.js';

const MAX_ROWS = 5000;

/**
 * Escape a single field value for CSV output.
 *
 * Two layers:
 *  1. CSV formula-injection guard (OWASP). XER field text is untrusted; a cell
 *     beginning with = @ + - (or a tab/CR formula-lead) is executed as a
 *     formula when the CSV is opened in Excel / Sheets / LibreOffice — e.g.
 *     =HYPERLINK / =cmd|'…' — a data-exfil / command-exec vector on the
 *     analyst's machine. CSV quoting does NOT prevent it (the app evaluates
 *     after unquoting). We neutralize with a leading apostrophe, which those
 *     apps render as inert text without showing the quote. Plain numbers
 *     (incl. negatives like "-40" total float) are left intact so numeric
 *     columns still sort/sum.
 *  2. RFC 4180 quoting for comma / quote / CR / LF.
 */
function csvEscape(value) {
  let s = value == null ? '' : String(value);
  if (s.length > 0) {
    const c = s[0];
    const isFormulaLead =
      c === '=' || c === '@' || c === '\t' || c === '\r' ||
      ((c === '+' || c === '-') && !/^[+-]?\d+(?:\.\d+)?$/.test(s));
    if (isFormulaLead) s = "'" + s;
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCsv(fields, records) {
  const header = fields.map(csvEscape).join(',');
  const dataRows = records.map(r =>
    fields.map(f => csvEscape(r[f])).join(',')
  );
  return [header, ...dataRows].join('\r\n');
}

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
  const shown = records.slice(0, MAX_ROWS);

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
      dataTable({ columns, rows: shown, limit: 0, emptyMsg: 'No records.' })
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
