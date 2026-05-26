import { h } from '../lib/dom.js';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

/**
 * Curated map of tables Lens reads from a P6 XER.
 * Values: 'full' | 'partial' | 'utility-only' | 'no'
 */
const LENS_READS = {
  PROJECT:  'full',
  CALENDAR: 'full',
  PROJWBS:  'full',
  TASK:     'full',
  TASKPRED: 'full',
  TASKRSRC: 'full',
  RSRC:     'full',
  ACTVTYPE: 'full',
  ACTVCODE: 'full',
  TASKACTV: 'full',
  UDFTYPE:  'partial',
  UDFVALUE: 'partial',
  MEMOTYPE: 'partial',
  TASKMEMO: 'partial',
  POBS:     'utility-only',
  RSRCRATE: 'no',
  ROLE:     'no',
  ROLES:    'no',
  RSRCROLE: 'no',
  OBS:      'no'
};

const BADGE_CLASS = {
  'full':         'lens-badge lens-badge-full',
  'partial':      'lens-badge lens-badge-partial',
  'utility-only': 'lens-badge lens-badge-utility',
  'no':           'lens-badge lens-badge-no'
};

function badgeEl(value) {
  const cls = BADGE_CLASS[value] || 'lens-badge';
  return h('span', { class: cls }, value);
}

function computeMetrics(A) {
  const tableNames = Object.keys(A.tables);

  // Build per-table stats
  const tableStats = {};
  for (const name of tableNames) {
    const t = A.tables[name];
    tableStats[name] = {
      records: t.records ? t.records.length : 0,
      fields:  t.fields  ? t.fields.length  : 0
    };
  }

  const curatedNames = Object.keys(LENS_READS);

  // Present (curated): in both A.tables and LENS_READS
  const present = tableNames.filter(n => LENS_READS[n] !== undefined);

  // Absent (curated): in LENS_READS but not in A.tables
  const absent = curatedNames.filter(n => !A.tables[n]);

  // Unknown: in A.tables but not in LENS_READS
  const unknown = tableNames.filter(n => LENS_READS[n] === undefined);

  // KPI totals
  const recordsTotal = tableNames.reduce((s, n) => s + tableStats[n].records, 0);
  const fieldsTotal  = tableNames.reduce((s, n) => s + tableStats[n].fields,  0);

  return { tableStats, present, absent, unknown, recordsTotal, fieldsTotal, tableCount: tableNames.length };
}

const PRESENT_COLS = [
  { key: 'table',   label: 'Table' },
  { key: 'records', label: 'Records' },
  { key: 'fields',  label: 'Fields' },
  { key: 'lens',    label: 'Lens reads', render: (v) => badgeEl(v) }
];

const UNKNOWN_COLS = [
  { key: 'table',   label: 'Table' },
  { key: 'records', label: 'Records' },
  { key: 'fields',  label: 'Fields' }
];

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Data Dictionary'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const m = computeMetrics(A);

  const kpis = [
    kpiCard({ title: 'Tables present',  big: m.tableCount,     sub: 'in this XER',         tone: 'ink' }),
    kpiCard({ title: 'Records total',   big: m.recordsTotal,   sub: 'across all tables',   tone: 'ink' }),
    kpiCard({ title: 'Fields total',    big: m.fieldsTotal,    sub: 'across all tables',   tone: 'ink' })
  ];

  // Present tables card
  const presentRows = m.present.map(n => ({
    table:   n,
    records: m.tableStats[n].records,
    fields:  m.tableStats[n].fields,
    lens:    LENS_READS[n]
  }));

  const presentCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Present tables'),
    dataTable({ columns: PRESENT_COLS, rows: presentRows, emptyMsg: 'No curated tables found in XER.' })
  ]);

  const children = [
    h('h2', {}, 'Data Dictionary'),
    h('div', { class: 'lens-kpi-grid' }, kpis),
    presentCard
  ];

  // Absent tables card — only show when there are absent tables
  if (m.absent.length > 0) {
    const absentList = h('ul', { style: { margin: '8px 0 0 0', paddingLeft: '20px' } },
      m.absent.map(n => h('li', {}, n))
    );
    children.push(h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Curated tables not in your XER'),
      absentList
    ]));
  }

  // Unknown tables card — only show when there are unknown tables
  if (m.unknown.length > 0) {
    const unknownRows = m.unknown.map(n => ({
      table:   n,
      records: m.tableStats[n].records,
      fields:  m.tableStats[n].fields
    }));
    children.push(h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Unknown tables'),
      dataTable({ columns: UNKNOWN_COLS, rows: unknownRows, emptyMsg: 'None.' })
    ]));
  }

  return h('div', { class: 'lens-section-content' }, children);
}
