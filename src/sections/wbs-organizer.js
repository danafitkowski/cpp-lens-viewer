import { h, on } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';

/**
 * Build a wbs_id → record map with _full_path, _depth, _children, _activity_count, _pct_complete.
 */
function buildWbsMap(A) {
  const wbsRows = getTable(A, 'PROJWBS');
  const tasks   = getTable(A, 'TASK');

  // Map wbs_id → record (shallow copy with augmented fields)
  const map = new Map();
  for (const w of wbsRows) {
    map.set(w.wbs_id, { ...w, _children: [], _activity_count: 0, _complete_count: 0, _depth: 0, _full_path: '' });
  }

  // Build parent → children links
  const roots = [];
  for (const [id, rec] of map) {
    const parentId = rec.parent_wbs_id;
    if (parentId && map.has(parentId)) {
      map.get(parentId)._children.push(id);
    } else {
      roots.push(id);
    }
  }

  // Assign depth and full_path via BFS
  const queue = roots.map(id => ({ id, depth: 0, path: '' }));
  while (queue.length) {
    const { id, depth, path } = queue.shift();
    const rec = map.get(id);
    if (!rec) continue;
    rec._depth = depth;
    rec._full_path = path ? `${path} > ${rec.wbs_name}` : (rec.wbs_name || id);
    for (const childId of rec._children) {
      queue.push({ id: childId, depth: depth + 1, path: rec._full_path });
    }
  }

  // Count activities per WBS
  for (const t of tasks) {
    const rec = map.get(t.wbs_id);
    if (!rec) continue;
    rec._activity_count++;
    const pct = parseFloat(t.phys_complete_pct);
    if (!isNaN(pct) && pct >= 100) rec._complete_count++;
  }

  return { map, roots };
}

function maxDepth(map) {
  let max = 0;
  for (const rec of map.values()) max = Math.max(max, rec._depth);
  return max;
}

function totalActivities(map) {
  let n = 0;
  for (const rec of map.values()) n += rec._activity_count;
  return n;
}

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'WBS Organizer'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const { map, roots } = buildWbsMap(A);
  const depth   = maxDepth(map);
  const actTotal = totalActivities(map);

  // Expanded state: roots start expanded, deeper nodes collapsed
  const expanded = new Set(roots);

  const treeContainer = h('div', { class: 'lens-wbs-tree' });

  function renderTree() {
    while (treeContainer.firstChild) treeContainer.removeChild(treeContainer.firstChild);

    function renderNode(id, visible) {
      const rec = map.get(id);
      if (!rec) return;

      const isExpanded  = expanded.has(id);
      const hasChildren = rec._children.length > 0;
      const pct = rec._activity_count > 0
        ? Math.round(rec._complete_count / rec._activity_count * 100)
        : 0;

      const row = h('div', {
        class: 'lens-wbs-row',
        style: { paddingLeft: `${12 + rec._depth * 20}px`, display: visible ? 'flex' : 'none' },
        'data-wbs-id': id,
        'data-expanded': isExpanded ? 'true' : 'false'
      }, [
        h('span', { class: 'chev' }, hasChildren ? (isExpanded ? '▼' : '▶') : '·'),
        h('span', { class: 'name' }, `${rec.wbs_name || id}${rec.wbs_short_name && rec.wbs_short_name !== rec.wbs_name ? ` (${rec.wbs_short_name})` : ''}`),
        h('span', { class: 'meta' }, `${rec._activity_count} act`),
        h('span', { class: 'pct' }, `${pct}%`)
      ]);

      if (hasChildren) {
        on(row, 'click', () => {
          if (expanded.has(id)) expanded.delete(id);
          else expanded.add(id);
          renderTree();
        });
      }

      treeContainer.appendChild(row);

      // Recurse into children — visible only if this node is expanded and itself visible
      for (const childId of rec._children) {
        renderNode(childId, visible && isExpanded);
      }
    }

    for (const rootId of roots) {
      renderNode(rootId, true);
    }
  }

  renderTree();

  const kpiRow = h('div', { class: 'lens-kpi-grid' }, [
    kpiCard({ title: 'WBS Nodes',   big: map.size,   sub: 'total nodes in hierarchy' }),
    kpiCard({ title: 'Max Depth',   big: depth,      sub: 'levels deep' }),
    kpiCard({ title: 'Activities',  big: actTotal,   sub: 'across all WBS nodes' })
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'WBS Organizer'),
    kpiRow,
    treeContainer
  ]);
}
