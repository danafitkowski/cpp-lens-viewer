import { h } from '../lib/dom.js';
import { buildActivityCodeMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';
import {
  indexTasks, resolveTaskKey, remapBySurrogate, keyDisplay,
  resolveComparisonAmbiguity
} from './_shared/identity.js';

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
 * Narrative Flip — activity-code reassignment detector (CPP differentiator).
 *
 * Compares activity-code assignments between B (baseline / prior) and A
 * (current) and flags activities whose code fingerprints changed. A changed
 * fingerprint indicates the schedule has been "rewritten" to reassign blame
 * to a different party or cause.
 *
 * IDENTITY — see _shared/identity.js.
 * buildActivityCodeMap() is keyed by the internal surrogate task_id, which P6
 * reassigns on every export. Unioning A's and B's keys straight out of it
 * compared two incompatible ID spaces, so every activity read as a flip
 * (410 flips / 0 unchanged on a pair that is really 313 / 5). Both code maps
 * are re-keyed onto the stable Activity ID first.
 *
 * The comparison runs over SHARED activities only — those present in BOTH
 * TASK tables. An activity that exists in one file and not the other is a
 * scope change, not a reassignment; counting it as a flip inflates the number
 * that matters most here. Those are counted and reported separately.
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

  // ONE ambiguity ledger for the pair, applied to both sides. Activity IDs are
  // matched UNSCOPED — there is no project scope to get wrong — and a code
  // repeated in either file is excluded from both. See _shared/identity.js.
  const ambiguity = resolveComparisonAmbiguity(A, B);

  // Re-key both code maps from surrogate task_id onto the stable Activity ID.
  const aRemap = remapBySurrogate(buildActivityCodeMap(A), A, ambiguity.keys);
  const bRemap = remapBySurrogate(buildActivityCodeMap(B), B, ambiguity.keys);
  const aMap = aRemap.map;
  const bMap = bRemap.map;

  // The activity universe of each file, keyed the same way.
  const aIdx = indexTasks(A, ambiguity.keys);
  const bIdx = indexTasks(B, ambiguity.keys);
  const aTasks = aIdx.index;
  const bTasks = bIdx.index;

  // Shared activities — the only population on which "reassigned" is meaningful.
  // If either TASK table is missing (a stripped export profile), identity cannot
  // be established from it; fall back to the code maps and say the result is
  // degraded rather than reporting nothing.
  const identityDegraded = aTasks.size === 0 || bTasks.size === 0;
  // Rows excluded because their Activity ID is repeated in one of the files.
  // Reported on the face of the output, never absorbed.
  const ambiguousIdentities = aIdx.ambiguous + bIdx.ambiguous;
  const ambiguousAssignments = aRemap.ambiguous + bRemap.ambiguous;
  const aUniverse = identityDegraded ? new Set(aMap.keys()) : new Set(aTasks.keys());
  const bUniverse = identityDegraded ? new Set(bMap.keys()) : new Set(bTasks.keys());

  const sharedIds = [];
  for (const k of aUniverse) if (bUniverse.has(k)) sharedIds.push(k);

  let aOnlyCount = 0;
  for (const k of aUniverse) if (!bUniverse.has(k)) aOnlyCount++;
  let bOnlyCount = 0;
  for (const k of bUniverse) if (!aUniverse.has(k)) bOnlyCount++;

  /** @type {Array<{ activity_id:string, matched_on:string, task_name:string, severity:number, changes:Array<{type_name:string,was:string,now:string}> }>} */
  const flips = [];
  let unchangedCount = 0;

  for (const id of sharedIds) {
    const aCodes = aMap.get(id) || [];
    const bCodes = bMap.get(id) || [];

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
      const ident = resolveTaskKey(aTasks.get(id) || bTasks.get(id));
      flips.push({
        // Never leak an internal match key into the table — strip it if the
        // TASK row behind the key was unavailable (degraded / orphan cases).
        activity_id: ident.display || keyDisplay(id),
        matched_on:  ident.matched_on,
        task_name:   (aTasks.get(id) || bTasks.get(id) || {}).task_name || '',
        severity:    changes.length,
        changes
      });
    } else {
      // Fingerprints differed only in the ORDER of same-type assignments, so
      // no code type actually changed hands. That is not a flip — and it must
      // still land somewhere, or flips + unchanged would not sum to shared.
      unchangedCount++;
    }
  }

  // Sort by severity desc, then Activity ID
  flips.sort((a, b) => b.severity - a.severity || a.activity_id.localeCompare(b.activity_id));

  const highCount   = flips.filter(f => f.severity >= 3).length;
  const mediumCount = flips.filter(f => f.severity === 2).length;
  const lowCount    = flips.filter(f => f.severity === 1).length;
  const totalFlips  = flips.length;

  // Expand each flip into one row per code-type change
  const tableRows = [];
  for (const flip of flips) {
    for (const ch of flip.changes) {
      tableRows.push({
        severity:    flip.severity,
        activity_id: flip.activity_id,
        matched_on:  flip.matched_on,
        task_name:   flip.task_name,
        type_name:   ch.type_name,
        was:         ch.was,
        now:         ch.now
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
    {
      key: 'activity_id',
      label: 'Activity ID',
      // Honest degradation: an activity with no task_code was matched on the
      // export-specific surrogate. Say so rather than passing it off as an
      // Activity ID that would survive the next export.
      render: (v, r) => r.matched_on === 'task_id'
        ? `${v} (internal ID — no Activity ID)`
        : String(v == null ? '' : v)
    },
    { key: 'task_name', label: 'Activity Name' },
    { key: 'type_name', label: 'Code Type' },
    { key: 'was',       label: 'Was (B)' },
    { key: 'now',       label: 'Now (A)' }
  ];

  const cardContent = tableRows.length > 0
    ? dataTable({ columns: TABLE_COLS, rows: tableRows, limit: 500, emptyMsg: 'No narrative flips detected between the two XERs.' })
    : h('p', { class: 'lens-empty' }, 'No narrative flips detected between the two XERs.');

  /**
   * Join project labels for disclosure, or say plainly that the file does not
   * name them. A label never keys a match.
   *
   * @param {string[]} projects
   * @returns {string}
   */
  function projectClause(projects) {
    const named = (projects || []).filter(p => p !== '');
    return named.length === 0 ? 'the export does not name the projects involved' : named.join(', ');
  }

  // Ambiguity disclosure, ABOVE the numbers.
  const ambiguityNotices = [];
  if (ambiguity.a.codeCount > 0) {
    ambiguityNotices.push(
      `${ambiguity.a.codeCount.toLocaleString()} Activity ID${ambiguity.a.codeCount === 1 ? ' is' : 's are'} ` +
      'repeated in the current export, so those rows are excluded from the comparison and the totals below ' +
      `cover only the unambiguous remainder. Repeated across: ${projectClause(ambiguity.a.projects)}.`
    );
  }
  if (ambiguity.b.codeCount > 0) {
    ambiguityNotices.push(
      `${ambiguity.b.codeCount.toLocaleString()} Activity ID${ambiguity.b.codeCount === 1 ? ' is' : 's are'} ` +
      'repeated in the baseline export, so those rows are excluded from the comparison and the totals below ' +
      `cover only the unambiguous remainder. Repeated across: ${projectClause(ambiguity.b.projects)}.`
    );
  }
  if (ambiguity.any) {
    ambiguityNotices.push(
      `${ambiguousIdentities.toLocaleString()} activity row(s) are excluded on that basis ` +
      `(current ${aIdx.ambiguous.toLocaleString()}, baseline ${bIdx.ambiguous.toLocaleString()})` +
      (ambiguousAssignments > 0
        ? `, carrying ${ambiguousAssignments.toLocaleString()} activity-code assignment(s) with them`
        : '') +
      '. Nothing was merged and nothing was dropped — a repeated Activity ID cannot be matched one-to-one ' +
      'across two exports, and this section will not guess which row is which.'
    );
  }

  const ambiguityCard = ambiguityNotices.length === 0 ? null : h('div', {
    class: 'lens-card',
    style: { border: '2px solid #B45309', background: '#FFFBEB' }
  }, [
    h('h3', { style: { color: '#B45309' } }, 'Read this before the numbers'),
    ...ambiguityNotices.map(t => h('p', { style: { color: '#0F2540' } }, t))
  ]);

  const elements = [
    h('h2', {}, 'Narrative Flip'),
    ...(ambiguityCard ? [ambiguityCard] : []),

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
        big:   unchangedCount.toLocaleString(),
        sub:   'shared activities whose codes did not move'
      }),
      kpiCard({
        title: 'Shared activities compared',
        big:   sharedIds.length.toLocaleString(),
        sub:   `denominator: flips + unchanged · A-only ${aOnlyCount.toLocaleString()} · B-only ${bOnlyCount.toLocaleString()}`
      })
    ]),

    // Scope note — A-only / B-only activities are scope changes, not flips.
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'What was compared'),
      h('p', {},
        `${sharedIds.length.toLocaleString()} activities appear in both files and were compared by Activity ID. ` +
        `${aOnlyCount.toLocaleString()} appear only in A and ${bOnlyCount.toLocaleString()} only in B; those are scope ` +
        'changes, not code reassignments, so they are excluded from the flip count rather than inflating it.'
      ),
      ...(identityDegraded ? [h('p', { style: { color: '#C8392F', fontWeight: '700' } },
        'Degraded: one or both files carry no TASK table, so activities were matched on the ' +
        'activity-code assignments alone. Treat the counts as indicative, not forensic.'
      )] : []),
      ...((aRemap.unresolved + bRemap.unresolved) > 0 ? [h('p', { style: { color: '#B45309' } },
        `${(aRemap.unresolved + bRemap.unresolved).toLocaleString()} code assignments reference a task_id with no ` +
        'TASK row in its own file. They are kept and keyed on the raw internal ID, so they will not match across files.'
      )] : []),
      // The reconciliation is printed, not asserted.
      h('p', {},
        `Reconciliation — current export: ${sharedIds.length.toLocaleString()} compared + ` +
        `${aOnlyCount.toLocaleString()} current-only + ${aIdx.ambiguous.toLocaleString()} excluded as ambiguous + ` +
        `${aIdx.noIdentity.toLocaleString()} with no Activity ID = ${aIdx.total.toLocaleString()} activity rows.`
      ),
      h('p', {},
        `Reconciliation — baseline export: ${sharedIds.length.toLocaleString()} compared + ` +
        `${bOnlyCount.toLocaleString()} baseline-only + ${bIdx.ambiguous.toLocaleString()} excluded as ambiguous + ` +
        `${bIdx.noIdentity.toLocaleString()} with no Activity ID = ${bIdx.total.toLocaleString()} activity rows.`
      ),
      ...(identityDegraded ? [h('p', { style: { color: '#B45309' } },
        'The reconciliation above counts TASK rows. With a TASK table missing, the comparison ran over the ' +
        'activity-code assignments instead, so the compared population is not drawn from those rows.'
      )] : [])
    ]),

    // Flip detail card
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Narrative flips'),
      cardContent
    ])
  ];

  return h('div', { class: 'lens-section-content' }, elements);
}
