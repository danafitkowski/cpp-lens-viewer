import { h } from '../lib/dom.js';
import { getTable, buildActivityCodeMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

/**
 * Build a canonical "code fingerprint" string for a list of code objects.
 * Sorts by type_name so order differences don't produce false flips.
 *
 * @param {Array<{type_name:string, code_name:string, code_desc:string}>} codes
 * @returns {string}
 */
function fingerprint(codes) {
  const entries = codes
    .map(c => [c.type_name, c.code_name])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify(entries);
}

/**
 * Build a Map from task_id → task_name for the TASK table in model.
 *
 * @param {object|null} model
 * @returns {Map<string, string>}
 */
function nameMap(model) {
  const m = new Map();
  for (const t of getTable(model, 'TASK')) {
    const id = t.task_id || t.task_code;
    if (id) m.set(String(id), t.task_name || '');
  }
  return m;
}

/**
 * Narrative Flip — activity-code reassignment detector (CPP differentiator).
 *
 * Compares activity-code assignments between B (baseline / prior) and A
 * (current) and flags activities whose code fingerprints changed. A changed
 * fingerprint indicates the schedule has been "rewritten" to reassign blame
 * to a different party or cause.
 *
 * @param {{ A: object|null, B: object|null }} props
 * @returns {HTMLElement}
 */
export function render({ A, B }) {
  if (!A || !B) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Narrative Flip'),
      h('div', { class: 'lens-card' }, [
        h('p', {}, 'Load two XERs — Narrative Flip detects activity-code reassignments between baseline and current.')
      ])
    ]);
  }

  const aMap = buildActivityCodeMap(A);
  const bMap = buildActivityCodeMap(B);
  const aNames = nameMap(A);
  const bNames = nameMap(B);

  /** @type {Array<{ task_id:string, task_name:string, severity:number, changes:Array<{type_name:string,was:string,now:string}> }>} */
  const flips = [];
  let unchangedCount = 0;

  // All task IDs present in either code map
  const allIds = new Set([...Object.keys(aMap), ...Object.keys(bMap)]);

  for (const id of allIds) {
    const aCodes = aMap[id] || [];
    const bCodes = bMap[id] || [];

    // Only compare activities present in both maps (or in at least one map)
    const aFp = fingerprint(aCodes);
    const bFp = fingerprint(bCodes);

    if (aFp === bFp) {
      unchangedCount++;
      continue;
    }

    // Build per-type lookup for both A and B
    /** @type {Record<string, string>} */
    const aByType = {};
    for (const c of aCodes) aByType[c.type_name] = c.code_name;

    /** @type {Record<string, string>} */
    const bByType = {};
    for (const c of bCodes) bByType[c.type_name] = c.code_name;

    // Union of type names across both
    const allTypes = new Set([...Object.keys(aByType), ...Object.keys(bByType)]);

    const changes = [];
    for (const typeName of allTypes) {
      const was = bByType[typeName] || '(none)';
      const now = aByType[typeName] || '(none)';
      if (was !== now) {
        changes.push({ type_name: typeName, was, now });
      }
    }

    if (changes.length > 0) {
      flips.push({
        task_id:   id,
        task_name: aNames.get(id) || bNames.get(id) || '',
        severity:  changes.length,
        changes
      });
    }
  }

  // Sort by severity desc, then task_id
  flips.sort((a, b) => b.severity - a.severity || a.task_id.localeCompare(b.task_id));

  const highCount   = flips.filter(f => f.severity >= 3).length;
  const mediumCount = flips.filter(f => f.severity === 2).length;
  const lowCount    = flips.filter(f => f.severity === 1).length;
  const totalFlips  = flips.length;

  // Expand each flip into one row per code-type change
  const tableRows = [];
  for (const flip of flips) {
    for (const ch of flip.changes) {
      tableRows.push({
        severity:  flip.severity,
        task_id:   flip.task_id,
        task_name: flip.task_name,
        type_name: ch.type_name,
        was:       ch.was,
        now:       ch.now
      });
    }
  }

  /** @param {number} severity @returns {HTMLElement} */
  function severityBadge(severity) {
    const label = severity >= 3 ? 'HIGH' : severity === 2 ? 'MED' : 'LOW';
    const color = severity >= 3 ? '#C8392F' : severity === 2 ? '#B45309' : '#6B7280';
    return h('span', {
      style: {
        background: color,
        color: '#ffffff',
        padding: '2px 6px',
        borderRadius: '3px',
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.05em'
      }
    }, label);
  }

  const TABLE_COLS = [
    {
      key: 'severity',
      label: 'Severity',
      render: v => severityBadge(Number(v))
    },
    { key: 'task_id',   label: 'Activity ID' },
    { key: 'task_name', label: 'Activity Name' },
    { key: 'type_name', label: 'Code Type' },
    { key: 'was',       label: 'Was (B)' },
    { key: 'now',       label: 'Now (A)' }
  ];

  const cardContent = tableRows.length > 0
    ? dataTable({ columns: TABLE_COLS, rows: tableRows, limit: 500, emptyMsg: 'No narrative flips detected between the two XERs.' })
    : h('p', { class: 'lens-empty' }, 'No narrative flips detected between the two XERs.');

  const elements = [
    h('h2', {}, 'Narrative Flip'),

    // KPI row
    h('div', { class: 'kpi-grid' }, [
      kpiCard({
        title: 'Total flips detected',
        big:   totalFlips.toLocaleString(),
        tone:  totalFlips > 0 ? 'red' : 'ink'
      }),
      kpiCard({
        title: 'High severity (≥ 3)',
        big:   highCount.toLocaleString(),
        tone:  highCount > 0 ? 'red' : 'ink'
      }),
      kpiCard({
        title: 'Medium severity (2)',
        big:   mediumCount.toLocaleString(),
        tone:  mediumCount > 0 ? 'amber' : 'ink'
      }),
      kpiCard({
        title: 'Low severity (1)',
        big:   lowCount.toLocaleString(),
        tone:  lowCount > 0 ? 'amber' : 'ink'
      }),
      kpiCard({
        title: 'Unchanged activities',
        big:   unchangedCount.toLocaleString()
      })
    ]),

    // Flip detail card
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Narrative flips'),
      cardContent
    ])
  ];

  return h('div', { class: 'lens-section-content' }, elements);
}
