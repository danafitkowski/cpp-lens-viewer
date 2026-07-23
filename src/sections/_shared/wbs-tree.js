import { getTable } from '@criticalpathpartners/lens-parser';

/**
 * Build a wbs_id -> node map with hierarchy info (_children, _depth, _full_path,
 * _activity_count, _complete_count) plus the list of root wbs_ids.
 * Shared by WBS Organizer and Schedule Viewer's WBS-grouped view — do not fork
 * this into a second copy; both must walk the exact same tree.
 */
export function buildWbsTree(A) {
  const wbsRows = getTable(A, 'PROJWBS');
  const tasks   = getTable(A, 'TASK');

  const map = new Map();
  for (const w of wbsRows) {
    map.set(w.wbs_id, { ...w, _children: [], _activity_count: 0, _complete_count: 0, _depth: 0, _full_path: '' });
  }

  const roots = [];
  for (const [id, rec] of map) {
    const parentId = rec.parent_wbs_id;
    if (parentId && map.has(parentId)) {
      map.get(parentId)._children.push(id);
    } else {
      roots.push(id);
    }
  }

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

  for (const t of tasks) {
    const rec = map.get(t.wbs_id);
    if (!rec) continue;
    rec._activity_count++;
    const pct = parseFloat(t.phys_complete_pct);
    if (!isNaN(pct) && pct >= 100) rec._complete_count++;
  }

  return { map, roots };
}

export function maxWbsDepth(map) {
  let max = 0;
  for (const rec of map.values()) max = Math.max(max, rec._depth);
  return max;
}
