import { h, on } from '../lib/dom.js';
import { getTable, buildWbsMap } from '@criticalpathpartners/lens-parser';
import { dataTable } from './_shared/data-table.js';

const STATUS_LABELS = {
  TK_NotStart: 'Not Started',
  TK_Active: 'In Progress',
  TK_Complete: 'Complete'
};

const COLUMNS = [
  { key: 'task_id',   label: 'ID' },
  { key: 'task_code', label: 'Code' },
  { key: '_wbsPath',  label: 'WBS' },
  { key: 'task_name', label: 'Name' },
  { key: 'status_code', label: 'Status', render: v => STATUS_LABELS[v] || v },
  { key: 'task_type', label: 'Type' },
  { key: 'target_drtn_hr_cnt', label: 'Duration (hr)' },
  { key: 'target_start_date', label: 'Start', render: v => (v || '').slice(0, 10) },
  { key: 'target_end_date',   label: 'Finish', render: v => (v || '').slice(0, 10) },
  { key: 'total_float_hr_cnt', label: 'Float (hr)' }
];

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Schedule Viewer'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }
  const wbsMap = buildWbsMap(A); // wbs_id -> { _full_path, ... }
  // Default read order should follow the schedule's WBS structure (like P6's own
  // WBS-grouped view), not raw XER row order — a flat activity dump is hard to scan
  // on anything but a trivial schedule. Same path-sort convention as WBS Roll-up.
  const allTasks = getTable(A, 'TASK')
    .map(t => ({ ...t, _wbsPath: wbsMap[t.wbs_id]?._full_path || '' }))
    .sort((a, b) => a._wbsPath.localeCompare(b._wbsPath) || String(a.task_code || '').localeCompare(String(b.task_code || '')));
  let query = '';
  const tableSlot = h('div');

  function rerenderTable() {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? allTasks.filter(t => Object.values(t).some(v => String(v ?? '').toLowerCase().includes(q)))
      : allTasks;
    while (tableSlot.firstChild) tableSlot.removeChild(tableSlot.firstChild);
    tableSlot.appendChild(dataTable({ columns: COLUMNS, rows: filtered, limit: 500 }));
  }

  const searchInput = h('input', { type: 'search', placeholder: 'Filter activities (any field)', class: 'lens-search' });
  on(searchInput, 'input', (e) => { query = e.target.value; rerenderTable(); });

  rerenderTable();

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Schedule Viewer'),
    h('div', { class: 'lens-toolbar' }, [
      searchInput,
      h('span', { class: 'lens-count' }, `${allTasks.length.toLocaleString()} activities`)
    ]),
    tableSlot
  ]);
}
