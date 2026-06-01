import { h } from '../lib/dom.js';
import { getTable, getTableAliased, buildPredecessorMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

const REL_TYPES = ['PR_FS', 'PR_SS', 'PR_FF', 'PR_SF'];

function computeRelDist(rels) {
  const counts = { PR_FS: 0, PR_SS: 0, PR_FF: 0, PR_SF: 0, other: 0 };
  for (const r of rels) {
    const t = r.pred_type;
    if (REL_TYPES.includes(t)) counts[t]++;
    else counts.other++;
  }
  const total = rels.length;
  const rows = [
    ...REL_TYPES.map(t => ({
      type:  t,
      count: counts[t],
      pct:   total > 0 ? ((counts[t] / total) * 100).toFixed(1) + '%' : '—'
    })),
    {
      type:  'Other',
      count: counts.other,
      pct:   total > 0 ? ((counts.other / total) * 100).toFixed(1) + '%' : '—'
    }
  ];
  return { rows, total, fsPct: total > 0 ? (counts.PR_FS / total * 100) : 0 };
}

function computeLagBuckets(rels) {
  const buckets = { negative: 0, zero: 0, low: 0, mid: 0, high: 0 };
  for (const r of rels) {
    const lag = parseFloat(r.lag_hr_cnt);
    if (isNaN(lag) || lag === 0) { buckets.zero++; continue; }
    if (lag < 0)        buckets.negative++;
    else if (lag <= 8)  buckets.low++;
    else if (lag <= 40) buckets.mid++;
    else                buckets.high++;
  }
  return buckets;
}

function computeTopLinked(A, rels) {
  const tasks = getTable(A, 'TASK');
  const taskMap = {};
  for (const t of tasks) taskMap[t.task_id] = t;

  const { predecessors, successors } = buildPredecessorMap(A);

  // collect all task IDs mentioned in either direction
  const allIds = new Set([
    ...Object.keys(predecessors),
    ...Object.keys(successors)
  ]);

  const scored = [];
  for (const id of allIds) {
    const predCount = (predecessors[id] || []).length;
    const succCount = (successors[id]   || []).length;
    const total     = predCount + succCount;
    const t         = taskMap[id] || {};
    scored.push({
      id,
      code:  t.task_code || id,
      name:  t.task_name || '',
      preds: predCount,
      succs: succCount,
      total
    });
  }

  // FX-022: sort descending by link count and return ALL rows — never a "top N"
  // truncation (forensic "enumerate every item" rule). The table wrapper scrolls.
  scored.sort((a, b) => b.total - a.total);
  return scored;
}

const REL_DIST_COLUMNS = [
  { key: 'type',  label: 'Type' },
  { key: 'count', label: 'Count' },
  { key: 'pct',   label: '%' }
];

const TOP_LINKED_COLUMNS = [
  { key: 'code',  label: 'Activity ID' },
  { key: 'name',  label: 'Activity' },
  { key: 'preds', label: 'Pred count' },
  { key: 'succs', label: 'Succ count' },
  { key: 'total', label: 'Total' }
];

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Logic Network'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const rels = getTableAliased(A, 'REL');

  const { rows: distRows, total: relTotal, fsPct } = computeRelDist(rels);
  const lagBuckets = computeLagBuckets(rels);
  const topLinked  = computeTopLinked(A, rels);

  const kpiRow = h('div', { class: 'lens-kpi-grid' }, [
    kpiCard({ title: 'Total Relationships', big: relTotal.toLocaleString(),          sub: 'all types'           }),
    kpiCard({ title: 'FS%',                 big: fsPct.toFixed(1) + '%',             sub: 'finish-to-start'     }),
    kpiCard({ title: 'Leads',               big: lagBuckets.negative.toLocaleString(), sub: 'negative lag',     tone: lagBuckets.negative > 0 ? 'red' : 'green' }),
    kpiCard({ title: 'Lags',                big: (lagBuckets.low + lagBuckets.mid + lagBuckets.high).toLocaleString(), sub: 'positive lag', tone: (lagBuckets.low + lagBuckets.mid + lagBuckets.high) > 0 ? 'amber' : 'green' })
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Logic Network'),
    kpiRow,
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Relationship distribution'),
      dataTable({ columns: REL_DIST_COLUMNS, rows: distRows })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Most-linked activities'),
      topLinked.length > 0
        ? dataTable({ columns: TOP_LINKED_COLUMNS, rows: topLinked })
        : h('p', { class: 'lens-section-stub' }, 'No logic relationships found.')
    ])
  ]);
}
