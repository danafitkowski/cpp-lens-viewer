import { h } from '../lib/dom.js';
import { getTable, buildWbsMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

const fmtCost = (v) => '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtHrs  = (v) => v.toLocaleString();

/**
 * Compute depth from _full_path (count " > " separators).
 */
function depthFromPath(fullPath) {
  if (!fullPath) return 0;
  const parts = fullPath.split(' > ');
  return parts.length - 1;
}

/**
 * Build wbs_id → parent_wbs_id lookup from PROJWBS table rows.
 */
function buildParentMap(A) {
  const wbsRows = getTable(A, 'PROJWBS');
  const parentMap = {};
  for (const w of wbsRows) {
    parentMap[w.wbs_id] = w.parent_wbs_id || null;
  }
  return parentMap;
}

/**
 * Walk up the parent chain from wbs_id and collect all ancestor IDs (not self).
 */
function ancestors(wbsId, parentMap) {
  const result = [];
  let current = parentMap[wbsId];
  while (current) {
    result.push(current);
    current = parentMap[current];
  }
  return result;
}

function computeRollup(A) {
  const wbsMap   = buildWbsMap(A);   // wbs_id → { _full_path, wbs_id, ... }
  const parentMap = buildParentMap(A);
  const tasks    = getTable(A, 'TASK');
  const taskrsrc = getTable(A, 'TASKRSRC');

  // Build per-task cost sums from TASKRSRC
  const taskTargetCost = {};
  const taskActCost    = {};
  for (const tr of taskrsrc) {
    const id = tr.task_id || '';
    if (!id) continue;
    taskTargetCost[id] = (taskTargetCost[id] || 0) + (parseFloat(tr.target_cost)  || 0);
    taskActCost[id]    = (taskActCost[id]    || 0) + (parseFloat(tr.act_reg_cost) || 0);
  }

  // Direct metrics per WBS (activities where wbs_id exactly matches)
  const direct = {}; // wbs_id → { actCount, sumDrtn, sumTargetCost, sumActCost, sumWeightedPct, sumDrtnForPct }
  for (const wbsId of Object.keys(wbsMap)) {
    direct[wbsId] = { actCount: 0, sumDrtn: 0, sumTargetCost: 0, sumActCost: 0, sumWeightedPct: 0, sumDrtnForPct: 0 };
  }

  for (const t of tasks) {
    const wbsId = t.wbs_id || '';
    if (!wbsId || !(wbsId in direct)) continue;
    const drtn       = parseFloat(t.target_drtn_hr_cnt) || 0;
    const pct        = parseFloat(t.phys_complete_pct)  || 0;
    const tCost      = (parseFloat(t.target_cost) || 0) + (taskTargetCost[t.task_id] || 0);
    const aCost      = (parseFloat(t.act_reg_cost) || 0) + (taskActCost[t.task_id]   || 0);

    direct[wbsId].actCount++;
    direct[wbsId].sumDrtn        += drtn;
    direct[wbsId].sumTargetCost  += tCost;
    direct[wbsId].sumActCost     += aCost;
    direct[wbsId].sumWeightedPct += pct * drtn;
    direct[wbsId].sumDrtnForPct  += drtn;
  }

  // Rolled-up totals (cumulative = direct + all descendants)
  const rolled = {};
  for (const wbsId of Object.keys(wbsMap)) {
    rolled[wbsId] = { actCount: 0, sumDrtn: 0, sumTargetCost: 0, sumActCost: 0, sumWeightedPct: 0, sumDrtnForPct: 0 };
  }

  // Add direct metrics to self AND all ancestors
  for (const wbsId of Object.keys(direct)) {
    const d = direct[wbsId];
    // Accumulate on self
    const self = rolled[wbsId];
    if (self) {
      self.actCount      += d.actCount;
      self.sumDrtn       += d.sumDrtn;
      self.sumTargetCost += d.sumTargetCost;
      self.sumActCost    += d.sumActCost;
      self.sumWeightedPct += d.sumWeightedPct;
      self.sumDrtnForPct  += d.sumDrtnForPct;
    }
    // Propagate to each ancestor
    for (const ancId of ancestors(wbsId, parentMap)) {
      const anc = rolled[ancId];
      if (anc) {
        anc.actCount      += d.actCount;
        anc.sumDrtn       += d.sumDrtn;
        anc.sumTargetCost += d.sumTargetCost;
        anc.sumActCost    += d.sumActCost;
        anc.sumWeightedPct += d.sumWeightedPct;
        anc.sumDrtnForPct  += d.sumDrtnForPct;
      }
    }
  }

  // Build rows sorted by _full_path (lexicographic)
  const rows = Object.entries(wbsMap)
    .map(([wbsId, rec]) => {
      const r    = rolled[wbsId] || {};
      const drtn = r.sumDrtnForPct || 0;
      const pct  = drtn > 0 ? (r.sumWeightedPct / drtn) : 0;
      return {
        path:        rec._full_path || wbsId,
        depth:       depthFromPath(rec._full_path),
        actCount:    r.actCount     || 0,
        targetHrs:   r.sumDrtn      || 0,
        targetCost:  r.sumTargetCost || 0,
        actCost:     r.sumActCost    || 0,
        pct
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  // Grand totals (top-level only — avoid double-count by using root nodes)
  // Use sum of direct metrics across all tasks
  let totalActCount   = 0;
  let totalTargetHrs  = 0;
  let totalTargetCost = 0;
  for (const d of Object.values(direct)) {
    totalActCount   += d.actCount;
    totalTargetHrs  += d.sumDrtn;
    totalTargetCost += d.sumTargetCost;
  }

  return { rows, totalWbs: rows.length, totalActCount, totalTargetHrs, totalTargetCost };
}

const COLS = [
  { key: 'path',       label: 'WBS' },
  { key: 'depth',      label: 'Depth' },
  { key: 'actCount',   label: 'Activities' },
  { key: 'targetHrs',  label: 'Target Hrs',  render: (v) => fmtHrs(v) },
  { key: 'targetCost', label: 'Target Cost', render: (v) => fmtCost(v) },
  { key: 'actCost',    label: 'Actual Cost', render: (v) => fmtCost(v) },
  { key: 'pct',        label: '% Complete',  render: (v) => v.toFixed(1) + '%' }
];

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'WBS Roll-up'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const m = computeRollup(A);

  const kpiRow = h('div', { class: 'kpi-grid' }, [
    kpiCard({ title: 'WBS Nodes',        big: m.totalWbs,                                   sub: 'total hierarchy nodes' }),
    kpiCard({ title: 'Activities',        big: m.totalActCount,                              sub: 'total activities' }),
    kpiCard({ title: 'Total Target Hrs',  big: fmtHrs(m.totalTargetHrs),                    sub: 'sum of target durations' }),
    kpiCard({ title: 'Total Target Cost', big: fmtCost(m.totalTargetCost),                  sub: 'sum of target costs' })
  ]);

  const tableCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'WBS Roll-up by Level'),
    dataTable({ columns: COLS, rows: m.rows, limit: 500, emptyMsg: 'No WBS nodes.' })
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'WBS Roll-up'),
    kpiRow,
    tableCard
  ]);
}
