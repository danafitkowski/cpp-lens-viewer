import { h } from '../lib/dom.js';
import { getTable, buildUdfMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

const ORPHAN_TYPE_ID = '__unknown_orphaned__';

function computeMetrics(A) {
  const udftypes  = getTable(A, 'UDFTYPE');
  const udfvalues = getTable(A, 'UDFVALUE');
  buildUdfMap(A); // ensure side-effects are consistent (unused result is intentional)

  const totalTypes  = udftypes.length;
  const totalValues = udfvalues.length;

  const taskUdfs = udftypes.filter(u => (u.table_name || '').toUpperCase() === 'TASK').length;
  const rsrcUdfs = udftypes.filter(u => (u.table_name || '').toUpperCase() === 'RSRC').length;

  const knownTypeIds = new Set(udftypes.map(u => u.udf_type_id));

  // Build coverage: udf_type_id → count of UDFVALUE rows. Any UDFVALUE whose
  // udf_type_id doesn't resolve to a real UDFTYPE row (dangling FK, realistic
  // after enterprise dictionary cleanup) is bucketed under a synthetic
  // "Unknown / Orphaned UDF Type" id — never silently dropped.
  const valueCounts = {};
  for (const uv of udfvalues) {
    const id = knownTypeIds.has(uv.udf_type_id) ? uv.udf_type_id : ORPHAN_TYPE_ID;
    valueCounts[id] = (valueCounts[id] || 0) + 1;
  }

  // Per-UDFTYPE: up to 10 sample values
  const samplesByTypeId = {};
  for (const uv of udfvalues) {
    const id = knownTypeIds.has(uv.udf_type_id) ? uv.udf_type_id : ORPHAN_TYPE_ID;
    if (!samplesByTypeId[id]) samplesByTypeId[id] = [];
    if (samplesByTypeId[id].length < 10) {
      const val = uv.udf_text || uv.udf_number || uv.udf_date || '';
      samplesByTypeId[id].push({ fk: uv.fk_id || '', value: val });
    }
  }

  const typeRows = udftypes.map(u => ({
    typeName:  u.udf_type_name  || '',
    table:     u.table_name     || '',
    dataType:  u.logical_data_type || '',
    count:     valueCounts[u.udf_type_id] || 0,
    typeId:    u.udf_type_id    || '',
    typeLabel: u.udf_type_label || u.udf_type_name || ''
  }));

  // Orphaned UDFVALUE rows (dangling udf_type_id) get their own row in the
  // type table and their own sample card, so the "Total UDF Values" KPI
  // always reconciles with the sum of the type table's Value-count column.
  if (valueCounts[ORPHAN_TYPE_ID] > 0) {
    typeRows.push({
      typeName:  '',
      table:     '',
      dataType:  '',
      count:     valueCounts[ORPHAN_TYPE_ID],
      typeId:    ORPHAN_TYPE_ID,
      typeLabel: 'Unknown / Orphaned UDF Type'
    });
  }

  return {
    totalTypes,
    totalValues,
    taskUdfs,
    rsrcUdfs,
    typeRows,
    samplesByTypeId
  };
}

const TYPE_COLS = [
  { key: 'typeName',  label: 'Type name' },
  { key: 'table',     label: 'Table' },
  { key: 'dataType',  label: 'Data type' },
  { key: 'count',     label: 'Value count' }
];

const SAMPLE_COLS = [
  { key: 'fk',    label: 'FK ID' },
  { key: 'value', label: 'Value' }
];

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'UDF Explorer'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const m = computeMetrics(A);

  const kpis = [
    kpiCard({ title: 'Total UDF Types',    big: m.totalTypes,  sub: 'UDFTYPE records',             tone: 'ink'   }),
    kpiCard({ title: 'Total UDF Values',   big: m.totalValues, sub: 'UDFVALUE records',            tone: 'ink'   }),
    kpiCard({ title: 'Task-scope UDFs',    big: m.taskUdfs,    sub: 'table = TASK',                tone: m.taskUdfs > 0 ? 'green' : 'ink' }),
    kpiCard({ title: 'Resource-scope UDFs', big: m.rsrcUdfs,   sub: 'table = RSRC',                tone: m.rsrcUdfs > 0 ? 'green' : 'ink' })
  ];

  const typeCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'UDFTYPE list'),
    dataTable({ columns: TYPE_COLS, rows: m.typeRows, emptyMsg: 'No UDF types defined.' })
  ]);

  // Sample values per UDF — one sub-card per type that has values
  const sampleChildren = [];
  for (const row of m.typeRows) {
    const samples = m.samplesByTypeId[row.typeId] || [];
    const label = row.table ? `${row.typeLabel} (${row.table})` : row.typeLabel;
    const headerText = row.count > 10 ? `${label} (showing 10 of ${row.count})` : label;
    sampleChildren.push(
      h('div', { style: { marginBottom: '16px' } }, [
        h('h4', { style: { marginBottom: '4px', fontWeight: '700' } }, headerText),
        samples.length === 0
          ? h('p', { style: { fontSize: '13px', color: '#666' } }, 'No values.')
          : dataTable({ columns: SAMPLE_COLS, rows: samples })
      ])
    );
  }

  const samplesCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Sample values per UDF'),
    sampleChildren.length === 0
      ? h('p', {}, 'No UDF types defined.')
      : h('div', {}, sampleChildren)
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'UDF Explorer'),
    h('div', { class: 'kpi-grid' }, kpis),
    typeCard,
    samplesCard
  ]);
}
