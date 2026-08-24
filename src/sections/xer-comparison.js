import { h } from '../lib/dom.js';
import { diffModels } from './_shared/diff-models.js';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

/**
 * Join a list of project labels into a readable clause, or say plainly that the
 * file does not name its projects. Never invents one.
 *
 * @param {string[]} projects
 * @returns {string}
 */
function projectClause(projects) {
  const named = (projects || []).filter(p => p !== '');
  if (named.length === 0) return 'the export does not name the projects involved';
  return named.join(', ');
}

/**
 * One reconciliation sentence for a file. Every total this section prints has
 * to add up to the rows that were actually read, and the reader gets to see the
 * addition rather than take it on trust.
 *
 * @param {string} label - 'Current export' / 'Baseline export'
 * @param {{matched:number, unmatched:number, unmatchedLabel:string, ambiguous:number, noIdentity:number, total:number}} r
 * @returns {string}
 */
function reconciliationLine(label, r) {
  return `${label}: ${r.matched.toLocaleString()} matched + ${r.unmatched.toLocaleString()} ${r.unmatchedLabel} + ` +
    `${r.ambiguous.toLocaleString()} excluded as ambiguous + ${r.noIdentity.toLocaleString()} with no Activity ID = ` +
    `${r.total.toLocaleString()} activity rows.`;
}

export function render({ A, B }) {
  if (!A || !B) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'XER Comparison'),
      h('div', { class: 'lens-card' }, [
        h('p', {}, 'Load two XERs (current + previous/baseline) to compare. The diff appears here.')
      ])
    ]);
  }

  const d = diffModels(A, B);
  const { counts } = d;
  const ambiguous = d.tasks.ambiguous;
  const recon = d.tasks.reconciliation;

  // Disclosures that must be on the face of the output, ABOVE the numbers, not
  // buried in a tooltip. A repeated Activity ID means the export itself cannot
  // say which activity a row in the other file refers to. Those rows are
  // excluded from the verdict rather than resolved by guessing, and the reader
  // has to see how many and which projects they span.
  const ambiguousRows = counts.tasksAmbiguousA + counts.tasksAmbiguousB;
  const noIdentityRows = counts.tasksNoIdentityA + counts.tasksNoIdentityB;
  const ambiguousRels = counts.relsAmbiguousA + counts.relsAmbiguousB;

  const notices = [];

  if (counts.ambiguousCodesA > 0) {
    notices.push(
      `${counts.ambiguousCodesA.toLocaleString()} Activity ID${counts.ambiguousCodesA === 1 ? ' is' : 's are'} ` +
      'repeated in the current export, so those rows are excluded from the comparison and the totals below ' +
      'cover only the unambiguous remainder. ' +
      `${counts.tasksAmbiguousA.toLocaleString()} current activity row(s) are excluded. ` +
      `Repeated across: ${projectClause(ambiguous.a.projects)}.`
    );
  }
  if (counts.ambiguousCodesB > 0) {
    notices.push(
      `${counts.ambiguousCodesB.toLocaleString()} Activity ID${counts.ambiguousCodesB === 1 ? ' is' : 's are'} ` +
      'repeated in the baseline export, so those rows are excluded from the comparison and the totals below ' +
      'cover only the unambiguous remainder. ' +
      `${counts.tasksAmbiguousB.toLocaleString()} baseline activity row(s) are excluded. ` +
      `Repeated across: ${projectClause(ambiguous.b.projects)}.`
    );
  }
  if (ambiguous.any) {
    notices.push(
      'An Activity ID repeated in one file is excluded from BOTH files, so neither side reports an addition ' +
      'or a deletion about an activity the other side plainly holds. The rows are listed in full at the foot ' +
      'of this page — none of them is merged, dropped, or assigned to a project by guesswork.'
    );
  }
  if (ambiguousRels > 0) {
    notices.push(
      `${ambiguousRels.toLocaleString()} relationship row(s) run to or from an activity with a repeated ` +
      `Activity ID (current ${counts.relsAmbiguousA.toLocaleString()}, baseline ${counts.relsAmbiguousB.toLocaleString()}) ` +
      'and are excluded from the relationship totals for the same reason.'
    );
  }
  if (noIdentityRows > 0) {
    notices.push(
      `${noIdentityRows.toLocaleString()} activity row(s) carry neither an Activity ID nor an internal ID ` +
      `(current ${counts.tasksNoIdentityA}, baseline ${counts.tasksNoIdentityB}) and could not be matched at all.`
    );
  }
  if ((counts.relsLagMissingA + counts.relsLagMissingB) > 0) {
    notices.push(
      `${(counts.relsLagMissingA + counts.relsLagMissingB).toLocaleString()} relationship row(s) carry no lag value; ` +
      'they were read as zero lag, which is P6 semantics for an unstated lag.'
    );
  }

  const noticeCard = notices.length === 0 ? null : h('div', {
    class: 'lens-card',
    style: { border: '2px solid #B45309', background: '#FFFBEB' }
  }, [
    h('h3', { style: { color: '#B45309' } }, 'Read this before the numbers'),
    ...notices.map(t => h('p', { style: { color: '#0F2540' } }, t))
  ]);

  const elements = [
    h('h2', {}, 'XER Comparison'),
    ...(noticeCard ? [noticeCard] : []),
    h('div', { class: 'kpi-grid' }, [
      kpiCard({
        title: 'Activities matched',
        big: counts.tasksMatched.toLocaleString(),
        sub: 'same Activity ID in both files',
        tone: 'ink'
      }),
      kpiCard({
        title: 'Activities added',
        big: counts.tasksAdded.toLocaleString(),
        tone: counts.tasksAdded > 0 ? 'green' : 'ink'
      }),
      kpiCard({
        title: 'Activities deleted',
        big: counts.tasksDeleted.toLocaleString(),
        tone: counts.tasksDeleted > 0 ? 'red' : 'ink'
      }),
      kpiCard({
        title: 'Activities changed',
        big: counts.activitiesChanged.toLocaleString(),
        sub: 'distinct activities with ≥1 field change',
        tone: counts.activitiesChanged > 0 ? 'amber' : 'ink'
      }),
      kpiCard({
        title: 'Field changes',
        big: counts.fieldChanges.toLocaleString(),
        sub: 'total changed fields across those activities',
        tone: counts.fieldChanges > 0 ? 'amber' : 'ink'
      }),
      kpiCard({
        title: 'Relationships +/−',
        big: `+${counts.relsAdded} / −${counts.relsDeleted}`,
        sub: `${counts.relsRetained.toLocaleString()} retained` +
             // A re-lagged link is one edit, but the key carries the lag so it
             // lands in both +/− columns. Say so instead of overstating churn.
             (counts.relsLagChanged > 0
               ? ` · ${counts.relsLagChanged.toLocaleString()} lag-only change${counts.relsLagChanged === 1 ? '' : 's'} (counted in both + and −)`
               : '') +
             (ambiguousRels > 0
               ? ` · ${ambiguousRels.toLocaleString()} excluded as ambiguous`
               : '') +
             ((counts.relsUnresolvedA + counts.relsUnresolvedB) > 0
               ? ` · ${(counts.relsUnresolvedA + counts.relsUnresolvedB).toLocaleString()} endpoints unresolved`
               : '') +
             ((counts.relsMalformedA + counts.relsMalformedB) > 0
               ? ` · ${(counts.relsMalformedA + counts.relsMalformedB).toLocaleString()} malformed`
               : '') +
             ((counts.relsDuplicateA + counts.relsDuplicateB) > 0
               ? ` · ${(counts.relsDuplicateA + counts.relsDuplicateB).toLocaleString()} duplicated`
               : '')
      }),
      kpiCard({
        title: 'Repeated Activity IDs',
        big: (counts.ambiguousCodesA + counts.ambiguousCodesB).toLocaleString(),
        sub: ambiguous.any
          ? `${ambiguousRows.toLocaleString()} row(s) excluded from every total above ` +
            `(current ${counts.tasksAmbiguousA}, baseline ${counts.tasksAmbiguousB})`
          : 'every Activity ID is unique within its file',
        tone: ambiguous.any ? 'red' : 'ink'
      })
    ]),
    // The reconciliation is printed, not asserted. Every row of both files
    // lands in exactly one column, and the reader can check the addition.
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Reconciliation — every row accounted for'),
      h('p', {}, reconciliationLine('Current export', recon.a)),
      h('p', {}, reconciliationLine('Baseline export', recon.b)),
      h('p', {},
        `Current relationships: ${counts.relsAdded.toLocaleString()} added + ${counts.relsRetained.toLocaleString()} retained + ` +
        `${counts.relsAmbiguousA.toLocaleString()} excluded as ambiguous + ${counts.relsMalformedA.toLocaleString()} malformed + ` +
        `${counts.relsDuplicateA.toLocaleString()} duplicated = ${counts.relsTotalA.toLocaleString()} rows.`
      ),
      h('p', {},
        `Baseline relationships: ${counts.relsDeleted.toLocaleString()} deleted + ${counts.relsRetained.toLocaleString()} retained + ` +
        `${counts.relsAmbiguousB.toLocaleString()} excluded as ambiguous + ${counts.relsMalformedB.toLocaleString()} malformed + ` +
        `${counts.relsDuplicateB.toLocaleString()} duplicated = ${counts.relsTotalB.toLocaleString()} rows.`
      )
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Added activities'),
      dataTable({
        columns: [
          { key: 'task_code', label: 'Activity ID' },
          { key: 'task_id', label: 'Internal ID' },
          { key: 'task_name', label: 'Name' }
        ],
        rows: d.tasks.added.map(t => ({
          task_id: t.task_id || '',
          task_code: t.task_code || '',
          task_name: t.task_name || ''
        })),
        limit: 200,
        emptyMsg: 'No added activities.'
      })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Deleted activities'),
      dataTable({
        columns: [
          { key: 'task_code', label: 'Activity ID' },
          { key: 'task_id', label: 'Internal ID' },
          { key: 'task_name', label: 'Name' }
        ],
        rows: d.tasks.deleted.map(t => ({
          task_id: t.task_id || '',
          task_code: t.task_code || '',
          task_name: t.task_name || ''
        })),
        limit: 200,
        emptyMsg: 'No deleted activities.'
      })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Field changes — one row per changed field'),
      dataTable({
        columns: [
          {
            key: 'task_code',
            label: 'Activity ID',
            // Honest degradation: a row with no Activity ID was matched on the
            // internal surrogate task_id — say so rather than passing the
            // surrogate off as an Activity ID.
            render: (v, r) => (v ? String(v) : `${r.task_id} (internal ID — no Activity ID)`)
          },
          { key: 'task_name', label: 'Name' },
          { key: 'field',     label: 'Field' },
          { key: 'before',    label: 'Before', render: v => (typeof v === 'string' ? v.slice(0, 16) : String(v == null ? '' : v)) },
          { key: 'after',     label: 'After',  render: v => (typeof v === 'string' ? v.slice(0, 16) : String(v == null ? '' : v)) },
          { key: 'daysDelta', label: 'Δ (cal days)', render: v => v == null ? '' : (v > 0 ? '+' : '') + v }
        ],
        rows: d.tasks.changed,
        limit: 500,
        emptyMsg: 'No field changes.'
      })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Relationship changes'),
      dataTable({
        columns: [
          // Endpoints are shown as ACTIVITY IDs, resolved through each file's
          // own TASK table. The raw pred_task_id / task_id are export-specific
          // surrogates: printing them here put two different numbers on the
          // same activity depending on which file the row came from.
          {
            key: 'pred_code',
            label: 'Predecessor',
            render: (v, r) => r.endpoints_resolved ? String(v) : `${v} (unresolved internal ID)`
          },
          {
            key: 'succ_code',
            label: 'Successor',
            render: (v, r) => r.endpoints_resolved ? String(v) : `${v} (unresolved internal ID)`
          },
          { key: 'pred_type',    label: 'Type' },
          { key: 'lag_hr_cnt',   label: 'Lag (hr)' },
          { key: 'change',       label: 'Change' }
        ],
        rows: [
          // A row flagged lag_changed is one half of a re-lag: the same
          // pred/succ/type exists on the other side with a different lag. It is
          // counted in the +/− totals, and labelled so the reader does not read
          // it as a link that appeared or vanished.
          ...d.relationships.added.map(r => ({ ...r, change: r.lag_changed ? 'added (lag changed)' : 'added' })),
          ...d.relationships.deleted.map(r => ({ ...r, change: r.lag_changed ? 'deleted (lag changed)' : 'deleted' }))
        ],
        limit: 200,
        emptyMsg: 'No relationship changes.'
      })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Relationship lag changes — same predecessor, successor and type'),
      h('p', {},
        'Re-lagging existing logic moves a schedule without touching a single activity. ' +
        'Each row below is ONE link whose lag moved; it is also counted once in ' +
        '"Relationships +" and once in "Relationships −" above, because the lag is part of ' +
        'what identifies a relationship.'
      ),
      dataTable({
        columns: [
          {
            key: 'pred_code',
            label: 'Predecessor',
            render: (v, r) => r.endpoints_resolved ? String(v) : `${v} (unresolved internal ID)`
          },
          {
            key: 'succ_code',
            label: 'Successor',
            render: (v, r) => r.endpoints_resolved ? String(v) : `${v} (unresolved internal ID)`
          },
          { key: 'pred_type',     label: 'Type' },
          { key: 'lag_before_hr', label: 'Lag before (hr)' },
          { key: 'lag_after_hr',  label: 'Lag after (hr)' },
          { key: 'lagDeltaHr',    label: 'Δ lag (hr)', render: v => v == null ? '' : (v > 0 ? '+' : '') + v }
        ],
        rows: d.relationships.lagChanged,
        limit: 200,
        emptyMsg: 'No relationship lag changes.'
      })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Activity rows excluded — repeated Activity ID'),
      h('p', {},
        'An Activity ID is unique per project, not per file. Each row below shares its Activity ID with ' +
        'another row, so no comparison can say which of them the other file means. They take no part in ' +
        'the added / deleted / changed counts above — they are listed here, with the project each one ' +
        'belongs to, rather than merged, dropped, or separated by a guess.'
      ),
      dataTable({
        columns: [
          { key: 'file',      label: 'File' },
          { key: 'project',   label: 'Project' },
          { key: 'display',   label: 'Activity ID' },
          { key: 'task_id',   label: 'Internal ID' },
          { key: 'task_name', label: 'Name' }
        ],
        rows: [
          ...ambiguous.a.excludedRows.map(r => ({
            file: 'current', project: r.project || '(unnamed project)', display: r.display,
            task_id: r.task_id, task_name: r.task_name
          })),
          ...ambiguous.b.excludedRows.map(r => ({
            file: 'baseline', project: r.project || '(unnamed project)', display: r.display,
            task_id: r.task_id, task_name: r.task_name
          }))
        ],
        // No limit, deliberately. These rows are the evidence for why the
        // totals above exclude what they exclude, and the notice above says
        // they are listed in full. A capped register would make that sentence
        // false and would hide the very rows a reader needs to check.
        limit: 0,
        emptyMsg: 'No repeated Activity IDs — every activity in both files has a unique identity.'
      })
    ])
  ];

  return h('div', { class: 'lens-section-content' }, elements);
}
