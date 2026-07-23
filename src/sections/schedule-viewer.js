import { h, on } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { buildWbsTree } from './_shared/wbs-tree.js';

const STATUS_LABELS = {
  TK_NotStart: 'Not Started',
  TK_Active: 'In Progress',
  TK_Complete: 'Complete'
};

const UNASSIGNED_ID = '__unassigned__';

const COLUMNS = [
  { key: 'task_id',   label: 'ID' },
  { key: 'task_code', label: 'Code' },
  { key: 'task_name', label: 'Name' },
  { key: 'status_code', label: 'Status', render: v => STATUS_LABELS[v] || v },
  { key: 'task_type', label: 'Type' },
  { key: 'target_drtn_hr_cnt', label: 'Duration (hr)' },
  { key: 'target_start_date', label: 'Start', render: v => (v || '').slice(0, 10) },
  { key: 'target_end_date',   label: 'Finish', render: v => (v || '').slice(0, 10) },
  { key: 'total_float_hr_cnt', label: 'Float (hr)' }
];

function matchesQuery(t, q) {
  return Object.values(t).some(v => String(v ?? '').toLowerCase().includes(q));
}

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Schedule Viewer'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const { map, roots } = buildWbsTree(A);
  const allTasks = getTable(A, 'TASK');

  // Bucket activities by their direct WBS node. Anything whose wbs_id doesn't
  // resolve to a real node (blank, or a dangling reference) goes to a synthetic
  // "Unassigned" bucket at the end — never silently dropped.
  const tasksByWbs = new Map();
  const unassigned = [];
  const byCode = (a, b) => String(a.task_code || '').localeCompare(String(b.task_code || ''));
  for (const t of allTasks) {
    if (t.wbs_id && map.has(t.wbs_id)) {
      if (!tasksByWbs.has(t.wbs_id)) tasksByWbs.set(t.wbs_id, []);
      tasksByWbs.get(t.wbs_id).push(t);
    } else {
      unassigned.push(t);
    }
  }
  for (const arr of tasksByWbs.values()) arr.sort(byCode);
  unassigned.sort(byCode);

  // Default: every WBS band starts expanded — this is a viewer, the point is to see
  // the schedule, not to have to click every branch open first.
  const expanded = new Set([...map.keys(), UNASSIGNED_ID]);
  let query = '';
  const tableSlot = h('div');

  function activityRow(t, depth) {
    return h('tr', { class: 'lens-activity-row' }, COLUMNS.map((c, i) => {
      const v = t[c.key];
      const rendered = c.render ? c.render(v, t) : (v == null ? '' : String(v));
      const style = i === 0 ? { paddingLeft: `${14 + depth * 20}px` } : undefined;
      return h('td', style ? { style } : {}, rendered instanceof Node ? rendered : String(rendered));
    }));
  }

  function bandRow({ id, name, depth, activityCount, isOpen, hasContent, searching }) {
    const row = h('tr', { class: 'wbs-band-row', 'data-wbs-id': id }, [
      h('td', { colspan: String(COLUMNS.length), style: { paddingLeft: `${14 + depth * 20}px` } }, [
        h('span', { class: 'chev' }, hasContent ? (isOpen ? '▼' : '▶') : '·'),
        h('span', { class: 'wbs-band-name' }, name),
        h('span', { class: 'wbs-band-meta' }, `${activityCount} act`)
      ])
    ]);
    // While a search is active, matching bands are force-opened for the duration of
    // the search — don't let a click fight that; only wire up toggling when idle.
    if (hasContent && !searching) {
      on(row, 'click', () => {
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        rerenderTable();
      });
    }
    return row;
  }

  function nodeHasMatch(id, q) {
    const node = map.get(id);
    if (!node) return false;
    if ((tasksByWbs.get(id) || []).some(t => matchesQuery(t, q))) return true;
    return node._children.some(childId => nodeHasMatch(childId, q));
  }

  function rerenderTable() {
    const q = query.trim().toLowerCase();
    const rows = [];

    function walk(id) {
      const node = map.get(id);
      if (!node) return;
      const activities = (tasksByWbs.get(id) || []).filter(t => !q || matchesQuery(t, q));
      const childIds = q ? node._children.filter(childId => nodeHasMatch(childId, q)) : node._children;
      const hasContent = activities.length > 0 || childIds.length > 0;
      if (q && !hasContent) return; // nothing under this branch matches — drop it entirely
      const isOpen = q ? true : expanded.has(id);
      rows.push(bandRow({
        id, name: node.wbs_name || id, depth: node._depth,
        activityCount: node._activity_count, isOpen, hasContent, searching: !!q
      }));
      if (isOpen) {
        for (const t of activities) rows.push(activityRow(t, node._depth + 1));
        for (const childId of childIds) walk(childId);
      }
    }

    for (const rootId of roots) walk(rootId);

    const unassignedMatches = unassigned.filter(t => !q || matchesQuery(t, q));
    if (unassignedMatches.length > 0) {
      const isOpen = q ? true : expanded.has(UNASSIGNED_ID);
      rows.push(bandRow({
        id: UNASSIGNED_ID, name: 'Unassigned', depth: 0,
        activityCount: unassigned.length, isOpen, hasContent: true, searching: !!q
      }));
      if (isOpen) for (const t of unassignedMatches) rows.push(activityRow(t, 1));
    }

    while (tableSlot.firstChild) tableSlot.removeChild(tableSlot.firstChild);
    if (rows.length === 0) {
      tableSlot.appendChild(h('div', { class: 'lens-empty' }, 'No activities.'));
      return;
    }
    tableSlot.appendChild(h('div', { class: 'lens-table-wrap' }, [
      h('table', { class: 'lens-table lens-wbs-outline-table' }, [
        h('thead', {}, h('tr', {}, COLUMNS.map(c => h('th', {}, c.label)))),
        h('tbody', {}, rows)
      ])
    ]));
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
