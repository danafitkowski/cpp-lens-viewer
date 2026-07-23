import { h } from '../lib/dom.js';
import { getTable, getCalendarMap, durationHoursToDays } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);

// P6 constraint codes recognised in this section
const CONSTRAINT_LABELS = {
  CS_MSO:       'Start On',
  CS_MEO:       'Finish On',
  CS_MSOA:      'Start On or After',
  CS_MEOA:      'Finish On or After',
  CS_MEOB:      'Finish On or Before',
  CS_MANDSTART: 'Mandatory Start',
  CS_MANDFIN:   'Mandatory Finish',
  CS_ALAP:      'As Late As Possible',
  none:         'None'
};

// Hard constraints (constrain both start and finish network logic)
const HARD_CSTR = new Set(['CS_MSO', 'CS_MEO', 'CS_MANDSTART', 'CS_MANDFIN']);

// Float histogram bucket labels — ordered for display
const FLOAT_BUCKETS = [
  { key: 'negative', label: 'Negative' },
  { key: 'zero',     label: 'Zero (critical)' },
  { key: '1-5',      label: '1 – 5 wd' },
  { key: '6-10',     label: '6 – 10 wd' },
  { key: '11-20',    label: '11 – 20 wd' },
  { key: '21-40',    label: '21 – 40 wd' },
  { key: '41+',      label: '41+ wd' },
  { key: 'null',     label: 'Null / missing' }
];

function floatBucket(floatDays) {
  if (floatDays == null) return 'null';
  if (floatDays < 0)    return 'negative';
  if (floatDays === 0)  return 'zero';
  if (floatDays <= 5)   return '1-5';
  if (floatDays <= 10)  return '6-10';
  if (floatDays <= 20)  return '11-20';
  if (floatDays <= 40)  return '21-40';
  return '41+';
}

function computeMetrics(A) {
  const tasks  = getTable(A, 'TASK');
  const calMap = getCalendarMap(A);

  // Constraint type counts (all tasks including LOE/WBS)
  const cstrCounts = {};
  for (const code of Object.keys(CONSTRAINT_LABELS)) {
    cstrCounts[code] = 0;
  }
  for (const t of tasks) {
    const key = (t.cstr_type && t.cstr_type.trim()) ? t.cstr_type.trim() : 'none';
    if (key in cstrCounts) {
      cstrCounts[key]++;
    } else {
      // Unknown constraint code — add it
      cstrCounts[key] = (cstrCounts[key] || 0) + 1;
    }
  }
  const cstrRows = Object.entries(cstrCounts)
    .filter(([, count]) => count > 0)
    .map(([code, count]) => ({ type: CONSTRAINT_LABELS[code] || code, count }));

  // Work tasks only for float histogram and critical count
  const workTasks = tasks.filter(t => !LOE_WBS.has(t.task_type));

  const bucketCounts = {};
  for (const b of FLOAT_BUCKETS) bucketCounts[b.key] = 0;

  let criticalCount = 0;
  let nullFloatCount = 0;

  for (const t of workTasks) {
    const rawFloat = t.total_float_hr_cnt;
    const cal = calMap[t.clndr_id] || null;

    let floatDays = null;
    if (rawFloat != null && rawFloat !== '' && !isNaN(parseFloat(rawFloat))) {
      floatDays = durationHoursToDays(rawFloat, cal);
    }

    const bucket = floatBucket(floatDays);
    bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;

    if (floatDays != null && floatDays <= 0) criticalCount++;
    if (floatDays == null) nullFloatCount++;
  }

  const floatRows = FLOAT_BUCKETS.map(b => ({ bucket: b.label, count: bucketCounts[b.key] }));

  // Hard-constraint activities list
  const hardRows = tasks
    .filter(t => HARD_CSTR.has(t.cstr_type))
    .map(t => ({
      activity: t.task_name  || '',
      code:     t.task_code  || '',
      cstr:     CONSTRAINT_LABELS[t.cstr_type] || t.cstr_type || '',
      date:     (t.cstr_date || '').slice(0, 10)
    }));

  return {
    totalTasks:    tasks.length,
    workTasks:     workTasks.length,
    criticalCount,
    hardCount:     hardRows.length,
    nullFloatCount,
    cstrRows,
    floatRows,
    hardRows
  };
}

const CSTR_COLS = [
  { key: 'type',  label: 'Constraint type' },
  { key: 'count', label: 'Count' }
];

const FLOAT_COLS = [
  { key: 'bucket', label: 'Float bucket (wd)' },
  { key: 'count',  label: 'Count' }
];

const HARD_COLS = [
  { key: 'activity', label: 'Activity' },
  { key: 'code',     label: 'Code' },
  { key: 'cstr',     label: 'Constraint type' },
  { key: 'date',     label: 'Constraint date' }
];

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Constraints / Float'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const m = computeMetrics(A);

  const criticalPct = m.workTasks > 0 ? (m.criticalCount / m.workTasks) * 100 : 0;

  const kpis = [
    kpiCard({ title: 'Total Activities',     big: m.totalTasks,     sub: 'all types',            tone: 'ink'   }),
    kpiCard({ title: 'Critical Activities',  big: m.criticalCount,  sub: 'float ≤ 0 wd (work tasks)', tone: criticalPct > 25 ? 'red' : 'ink' }),
    kpiCard({ title: 'Hard Constraints',     big: m.hardCount,      sub: 'MSO / MEO / MAND',     tone: m.hardCount > 0 ? 'red' : 'green' }),
    kpiCard({ title: 'Null Float',           big: m.nullFloatCount, sub: 'no float data (work tasks)', tone: m.nullFloatCount > 0 ? 'amber' : 'green' })
  ];

  const sideBySide = h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap' } }, [
    h('div', { class: 'lens-card', style: { flex: '1', minWidth: '260px' } }, [
      h('h3', {}, 'Constraint type distribution'),
      dataTable({ columns: CSTR_COLS, rows: m.cstrRows })
    ]),
    h('div', { class: 'lens-card', style: { flex: '1', minWidth: '260px' } }, [
      h('h3', {}, 'Float buckets (working days)'),
      dataTable({ columns: FLOAT_COLS, rows: m.floatRows })
    ])
  ]);

  const hardCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Hard constraints'),
    dataTable({ columns: HARD_COLS, rows: m.hardRows, emptyMsg: 'No hard constraints.' })
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Constraints / Float'),
    h('div', { class: 'kpi-grid' }, kpis),
    sideBySide,
    hardCard
  ]);
}
