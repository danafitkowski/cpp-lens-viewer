import { h } from '../lib/dom.js';
import { getTable, buildActivityCodeMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

function computeMetrics(A) {
  const actvtypes  = getTable(A, 'ACTVTYPE');
  const actvcodes  = getTable(A, 'ACTVCODE');
  const taskactvs  = getTable(A, 'TASKACTV');
  const codeMap    = buildActivityCodeMap(A);

  const totalTypes       = actvtypes.length;
  const totalValues      = actvcodes.length;
  const totalAssignments = taskactvs.length;
  const codedActivityIds = new Set(Object.keys(codeMap));
  const codedCount       = codedActivityIds.size;

  // Total activities for coverage denominator
  const tasks = getTable(A, 'TASK');
  const totalTasks = tasks.length;
  const coveragePct = totalTasks > 0 ? ((codedCount / totalTasks) * 100).toFixed(1) : '0.0';

  // Per-code-type coverage: distinct task_ids that have >=1 assignment of each type
  const typeCoverage = {};
  for (const type of actvtypes) {
    typeCoverage[type.actv_code_type || type.actv_code_type_id] = new Set();
  }
  for (const [taskId, entries] of Object.entries(codeMap)) {
    for (const entry of entries) {
      const tn = entry.type_name;
      if (!typeCoverage[tn]) typeCoverage[tn] = new Set();
      typeCoverage[tn].add(taskId);
    }
  }

  const coverageRows = Object.entries(typeCoverage).map(([typeName, ids]) => {
    const coded = ids.size;
    const pct   = totalTasks > 0 ? ((coded / totalTasks) * 100).toFixed(1) : '0.0';
    return { typeName, coded, pct: `${pct}%` };
  });

  // Assignment browser rows (limit applied in render)
  const assignmentRows = [];
  for (const [taskId, entries] of Object.entries(codeMap)) {
    for (const entry of entries) {
      assignmentRows.push({
        taskId,
        codeType: entry.type_name,
        code:     entry.code_name
      });
    }
  }

  return {
    totalTypes,
    totalValues,
    totalAssignments,
    codedCount,
    coveragePct,
    totalTasks,
    coverageRows,
    assignmentRows
  };
}

const COVERAGE_COLS = [
  { key: 'typeName', label: 'Type' },
  { key: 'coded',    label: 'Coded activities' },
  { key: 'pct',      label: 'Coverage %' }
];

const ASSIGN_COLS = [
  { key: 'taskId',   label: 'Activity ID' },
  { key: 'codeType', label: 'Code Type' },
  { key: 'code',     label: 'Code' }
];

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Activity Codes'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const m = computeMetrics(A);

  const kpis = [
    kpiCard({ title: 'Code Types',         big: m.totalTypes,       sub: 'ACTVTYPE records',              tone: 'ink' }),
    kpiCard({ title: 'Code Values',        big: m.totalValues,      sub: 'ACTVCODE records',              tone: 'ink' }),
    kpiCard({ title: 'Assignments',        big: m.totalAssignments, sub: 'TASKACTV records',              tone: 'ink' }),
    kpiCard({ title: 'Coded Activities',   big: m.codedCount,       sub: `${m.coveragePct}% of activities`, tone: m.codedCount === 0 ? 'amber' : 'green' })
  ];

  const coverageCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Code-type coverage'),
    m.coverageRows.length === 0
      ? h('p', {}, 'No code types defined.')
      : dataTable({ columns: COVERAGE_COLS, rows: m.coverageRows })
  ]);

  const assignCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Assignment browser'),
    dataTable({ columns: ASSIGN_COLS, rows: m.assignmentRows, limit: 500, emptyMsg: 'No assignments.' })
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Activity Codes'),
    h('div', { class: 'lens-kpi-grid' }, kpis),
    coverageCard,
    assignCard
  ]);
}
