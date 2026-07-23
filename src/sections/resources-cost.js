import { h } from '../lib/dom.js';
import { getTable, buildResourceMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

const RSRC_TYPES = ['RT_Labor', 'RT_Mat', 'RT_Equip', 'RT_Role'];

function computeMetrics(A) {
  const rsrc     = getTable(A, 'RSRC');
  const taskrsrc = getTable(A, 'TASKRSRC');
  buildResourceMap(A); // ensure consistency; result consumed below via getTable

  // --- Totals ---
  const totalRsrc       = rsrc.length;
  const totalAssignments = taskrsrc.length;

  // --- By-type breakdown ---
  const typeCounts = {};
  for (const t of RSRC_TYPES) typeCounts[t] = 0;
  typeCounts.other = 0;

  for (const r of rsrc) {
    const t = r.rsrc_type || '';
    if (RSRC_TYPES.includes(t)) {
      typeCounts[t]++;
    } else {
      typeCounts.other++;
    }
  }

  // --- TASKRSRC sums ---
  let totalTargetQty  = 0;
  let totalRemainQty  = 0;
  let totalActRegQty  = 0;
  let totalTargetCost = 0;
  let totalActRegCost = 0;

  for (const tr of taskrsrc) {
    totalTargetQty  += parseFloat(tr.target_qty)   || 0;
    totalRemainQty  += parseFloat(tr.remain_qty)   || 0;
    totalActRegQty  += parseFloat(tr.act_reg_qty)  || 0;
    totalTargetCost += parseFloat(tr.target_cost)  || 0;
    totalActRegCost += parseFloat(tr.act_reg_cost) || 0;
  }

  // --- Top resources by assignment count ---
  // Group TASKRSRC by rsrc_id
  const assignCountByRsrcId = {};
  const targetQtyByRsrcId   = {};
  for (const tr of taskrsrc) {
    const id = tr.rsrc_id || '';
    if (!id) continue;
    assignCountByRsrcId[id] = (assignCountByRsrcId[id] || 0) + 1;
    targetQtyByRsrcId[id]   = (targetQtyByRsrcId[id]   || 0) + (parseFloat(tr.target_qty) || 0);
  }

  // Build RSRC lookup
  const rsrcLookup = {};
  for (const r of rsrc) {
    rsrcLookup[r.rsrc_id || ''] = r;
  }

  // FX-023: sort by assignment count descending and keep ALL resources — no
  // "top N" truncation (forensic "enumerate every item" rule). Table scrolls.
  const topRows = Object.entries(assignCountByRsrcId)
    .sort(([, a], [, b]) => b - a)
    .map(([id, count]) => {
      const rec = rsrcLookup[id] || {};
      return {
        code:  rec.rsrc_short_name || id,
        name:  rec.rsrc_name       || id,
        type:  rec.rsrc_type       || '',
        count,
        qty:   targetQtyByRsrcId[id] || 0
      };
    });

  return {
    totalRsrc,
    totalAssignments,
    totalTargetQty,
    totalTargetCost,
    totalActRegCost,
    typeCounts,
    topRows
  };
}

const TOP_COLS = [
  { key: 'code',  label: 'Resource code' },
  { key: 'name',  label: 'Resource name' },
  { key: 'type',  label: 'Type' },
  { key: 'count', label: 'Assignment count' },
  { key: 'qty',   label: 'Target qty', render: (v) => v.toLocaleString() }
];

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Resources / Cost'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const m = computeMetrics(A);

  const fmtCost = (v) => '$' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const kpis1 = [
    kpiCard({ title: 'Total Resources',    big: m.totalRsrc,        sub: 'RSRC records',             tone: 'ink' }),
    kpiCard({ title: 'Total Assignments',  big: m.totalAssignments, sub: 'TASKRSRC records',          tone: 'ink' }),
    kpiCard({ title: 'Total Target Qty',   big: m.totalTargetQty.toLocaleString(), sub: 'sum of target_qty', tone: 'ink' }),
    kpiCard({ title: 'Total Target Cost',  big: fmtCost(m.totalTargetCost), sub: 'sum of target_cost', tone: 'ink' })
  ];

  // By-type KPI row
  const typeLabels = {
    RT_Labor: 'Labor',
    RT_Mat:   'Material',
    RT_Equip: 'Equipment',
    RT_Role:  'Role',
    other:    'Other'
  };
  const kpis2 = [...RSRC_TYPES, 'other']
    .filter(t => m.typeCounts[t] > 0 || true) // show all types always
    .map(t => kpiCard({
      title: typeLabels[t] || t,
      big:   m.typeCounts[t],
      sub:   t,
      tone:  m.typeCounts[t] > 0 ? 'ink' : 'ink'
    }));

  const topCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Resources by assignment count'),
    dataTable({ columns: TOP_COLS, rows: m.topRows, emptyMsg: 'No resource assignments.' })
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Resources / Cost'),
    h('div', { class: 'kpi-grid' }, kpis1),
    h('div', { class: 'kpi-grid' }, kpis2),
    topCard
  ]);
}
