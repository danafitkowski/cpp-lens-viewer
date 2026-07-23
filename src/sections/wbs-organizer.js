import { h, on } from '../lib/dom.js';
import { kpiCard } from './_shared/kpi-card.js';
import { buildWbsTree, maxWbsDepth } from './_shared/wbs-tree.js';

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

  const { map, roots } = buildWbsTree(A);
  const depth   = maxWbsDepth(map);
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

  const kpiRow = h('div', { class: 'kpi-grid' }, [
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
