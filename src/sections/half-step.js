/**
 * Half-Step XER Generator — AACE 29R-03 MIP 3.4 (CPP industry first)
 *
 * Produces a third XER by applying ONLY progress fields from an updated
 * schedule (A) onto a deep copy of a base schedule (B), leaving all
 * planned/structural fields from B intact.
 *
 * This isolates "what changed in terms of progress?" from "what changed
 * in terms of plan?" — the canonical MIP 3.4 construct.
 */

import { h } from '../lib/dom.js';
import { getTable, writeXer } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { taskKey, resolveTaskKey, indexTasks, resolveComparisonAmbiguity } from './_shared/identity.js';

// ─────────────────────────────────────────────────────────────────────────────
// HALF-STEP LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Progress fields that are ALLOWED to be copied from A onto the B copy.
 * ALL other fields remain from B.
 */
const PROGRESS_FIELDS = [
  'phys_complete_pct',
  'act_start_date',
  'act_end_date',
  'remain_drtn_hr_cnt',
  'status_code'
];

/**
 * status_code may only be copied forward from A when A's value indicates
 * work has started or completed.  Never regress an activity back to not-started.
 */
const COPYABLE_STATUS = new Set(['TK_Active', 'TK_Complete']);

/**
 * Floor for a believable A↔B overlap, as a fraction of the smaller TASK count.
 *
 * A Half-Step built from few or no matches is not a Half-Step — it is the base
 * schedule wearing a different name, and it renders as a confident answer. Two
 * updates of the same project overlap almost completely; anything under half is
 * either a broken identity resolution or two unrelated schedules, and in both
 * cases the correct output is a refusal, not a file.
 */
export const MIN_MATCH_RATIO = 0.5;

/**
 * Why a Half-Step was withheld. `null` means it was not.
 *
 * The ratio test alone could not see the worst input. `comparable` is
 * min(aCount, bCount), so a model with ZERO TASK rows makes comparable 0, the
 * old `comparable > 0 && ...` guard switched itself OFF, and the emptiest
 * possible pair rendered a confident Half-Step. Probed: with B's TASK table
 * absent the meta read { matched: 0, aCount: 6, bCount: 0, comparable: 0,
 * implausible: false } and the download button stayed live.
 *
 * A missing input is not a small overlap — it is a degenerate input, and a
 * forensic tool must refuse it on the face of the output rather than
 * substitute the base schedule for an answer. Both cases now refuse.
 */
export const REFUSAL_REASONS = {
  NO_ACTIVITIES_EITHER:  'no-activities-in-either',
  NO_ACTIVITIES_UPDATED: 'no-activities-in-updated',
  NO_ACTIVITIES_BASE:    'no-activities-in-base',
  MATCH_BELOW_FLOOR:     'match-below-floor'
};

/**
 * Decide whether a Half-Step may be presented at all.
 *
 * @param {number} aCount - TASK rows in the updated schedule
 * @param {number} bCount - TASK rows in the base schedule
 * @param {number} matched - activities matched on the stable Activity ID
 * @returns {{ comparable: number, matchRatio: number|null, implausible: boolean, refusalReason: string|null }}
 */
export function assessMatch(aCount, bCount, matched) {
  const comparable = Math.min(aCount, bCount);
  const matchRatio = comparable > 0 ? matched / comparable : null;

  let refusalReason = null;
  if (aCount === 0 && bCount === 0)      refusalReason = REFUSAL_REASONS.NO_ACTIVITIES_EITHER;
  else if (aCount === 0)                 refusalReason = REFUSAL_REASONS.NO_ACTIVITIES_UPDATED;
  else if (bCount === 0)                 refusalReason = REFUSAL_REASONS.NO_ACTIVITIES_BASE;
  else if (matchRatio < MIN_MATCH_RATIO) refusalReason = REFUSAL_REASONS.MATCH_BELOW_FLOOR;

  return { comparable, matchRatio, implausible: refusalReason !== null, refusalReason };
}

/**
 * Generate a Half-Step XER model.
 *
 * The result model is a deep copy of B with A's progress fields overlaid
 * for matched activities.  B's structure (planned dates, durations,
 * task names, WBS, calendars, logic) is preserved verbatim.
 *
 * A↔B matching keys on the STABLE Activity ID (task_code) via
 * _shared/identity.js — NOT on task_id, which P6 reassigns on every export.
 * Matching on task_id matched 0 of 318 shared activities on real exports and
 * silently produced a "Half-Step" identical to the base schedule.
 *
 * The Activity ID is matched UNSCOPED, always. There is no automatic project
 * scope: every project-level field is free to move between two exports of the
 * same project, and each attempt at guessing one produced a new confidently
 * wrong answer — see identity.js. An Activity ID repeated in either file is
 * AMBIGUOUS: the row is left verbatim, counted, and disclosed, because there is
 * no way to know which of the repeats the other file's progress belongs to.
 *
 * @param {object} A - parsed XER model for the updated / period-end schedule
 * @param {object} B - parsed XER model for the base / period-start schedule
 * @returns {object} merged model with ermhdr.isHalfStep = true
 */
export function generateHalfStep(A, B) {
  // Deep-copy B so we never mutate the original
  const result = JSON.parse(JSON.stringify(B));

  // ONE ambiguity ledger for the pair. A code repeated in either file is
  // excluded from both, so no row takes an overlay meant for another activity.
  const ambiguity = resolveComparisonAmbiguity(A, result);

  const aTasks = getTable(A, 'TASK') || [];
  const aIdx = indexTasks(A, ambiguity.keys);
  const aByKey = aIdx.index;
  let matchedOnSurrogate = 0;

  const bTasks = result.tables?.TASK?.records || [];
  const bIdx = indexTasks(result, ambiguity.keys);
  let matched = 0;
  let unmatchedInBase = 0;

  // Base rows whose Activity ID is repeated in one of the two files. There is
  // no way to know which of the repeats A's progress belongs to, so the row is
  // left verbatim and counted rather than overlaid on a guess.
  const ambiguousKeys = ambiguity.keys;
  let ambiguousIdentitiesBase = 0;

  for (const bTask of bTasks) {
    const bKey = taskKey(bTask);
    if (bKey && ambiguousKeys.has(bKey)) {
      ambiguousIdentitiesBase++;
      continue;
    }
    const aTask = bKey ? aByKey.get(bKey) : undefined;
    if (!aTask) {
      // Activity exists in B but not A — preserve as-is
      unmatchedInBase++;
      continue;
    }

    matched++;
    // Honest degradation: a row with no task_code was matched on the
    // export-specific surrogate, which is only meaningful if both files
    // happen to number it the same. Counted so the UI can say so.
    if (resolveTaskKey(bTask).matched_on === 'task_id') matchedOnSurrogate++;

    // Copy progress fields from A onto the B-copy row
    for (const field of PROGRESS_FIELDS) {
      if (!(field in aTask)) continue;

      if (field === 'status_code') {
        // Only copy forward — never regress to TK_NotStart
        if (COPYABLE_STATUS.has(aTask.status_code)) {
          bTask.status_code = aTask.status_code;
        }
      } else {
        bTask[field] = aTask[field];
      }
    }
  }

  // A-only rows, on the same unscoped Activity ID as the base side and under the
  // same ambiguity ledger. Rows excluded for a repeated Activity ID are NOT
  // counted here: they are not "absent from the base schedule", they are
  // unidentifiable, and aIdx.ambiguous reports them under their own name.
  const bKeys = new Set(bIdx.index.keys());
  const unmatchedInUpdated = aTasks.filter(t => {
    const k = taskKey(t);
    if (k && ambiguousKeys.has(k)) return false;
    return !k || !bKeys.has(k);
  }).length;

  // Count TASKPRED rows preserved from B
  const logicPreserved = result.tables?.TASKPRED?.records?.length ?? 0;

  // Plausibility gate — see REFUSAL_REASONS. Refuses both an implausibly small
  // overlap AND a degenerate input (either side with no TASK rows at all),
  // which the old `comparable > 0 && ratio < floor` test switched itself off on.
  const aCount = aTasks.length;
  const bCount = bTasks.length;
  const { comparable, matchRatio, implausible, refusalReason } = assessMatch(aCount, bCount, matched);

  // Mark the model as a Half-Step (AACE 29R-03 MIP 3.4)
  result.ermhdr = result.ermhdr || {};
  result.ermhdr.isHalfStep = true;

  // Attach summary metadata (non-XER, consumed by render / tests)
  result._halfStepMeta = {
    matched,
    matchedOnSurrogate,
    // Updated-schedule rows excluded because their Activity ID is repeated.
    ambiguousIdentities: aIdx.ambiguous,
    // Base rows left verbatim because their Activity ID is repeated.
    ambiguousIdentitiesBase,
    // Distinct Activity IDs repeated in each file — what the reader is told.
    ambiguousCodesA: ambiguity.a.codeCount,
    ambiguousCodesB: ambiguity.b.codeCount,
    // The projects those repeats span, for disclosure only. Never a match key.
    ambiguousProjectsA: ambiguity.a.projects,
    ambiguousProjectsB: ambiguity.b.projects,
    unmatchedInUpdated,
    unmatchedInBase,
    logicPreserved,
    aCount,
    bCount,
    comparable,
    matchRatio,
    implausible,
    refusalReason
  };

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD HELPER
// ─────────────────────────────────────────────────────────────────────────────

function triggerDownload(text, filename, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────────

export function render({ A, B }) {
  if (!A || !B) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Half-Step XER (AACE 29R-03 MIP 3.4)'),
      h('div', { class: 'lens-card' }, [
        h('p', {},
          'Load two XERs (baseline + updated) to generate a Half-Step XER.  ' +
          'AACE 29R-03 MIP 3.4.'
        )
      ])
    ]);
  }

  // Compute the half-step model eagerly so KPIs are available
  const model = generateHalfStep(A, B);
  const meta  = model._halfStepMeta;

  // Explainer card
  const explainerCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'What is a Half-Step XER?'),
    h('p', {},
      'A Half-Step XER starts from the BASE schedule (B) and overlays only ' +
      'progress fields (actual dates, remaining duration, % complete, status) ' +
      'from the UPDATED schedule (A).  Planned dates, durations, logic, names, ' +
      'and WBS remain exactly as B defined them.  This isolates pure progress ' +
      'impact from plan changes: the canonical AACE 29R-03 MIP 3.4 construct ' +
      'for forensic period analysis.'
    )
  ]);

  // KPI row. The match KPI names the key that was actually used — Activity ID
  // (task_code) — not the internal surrogate the old build matched on.
  const matchSub = meta.matchedOnSurrogate > 0
    ? `Activity ID (task_code) found in both B and A · ${meta.matchedOnSurrogate} matched on internal task_id (no Activity ID)`
    : 'Activity ID (task_code) found in both B and A';

  const kpiRow = h('div', { class: 'kpi-grid' }, [
    kpiCard({ title: 'Matched activities',       big: meta.matched,              sub: matchSub, tone: meta.implausible ? 'red' : 'ink' }),
    kpiCard({ title: 'Unmatched in updated',     big: meta.unmatchedInUpdated,   sub: 'A-only: dropped (not added to output)' }),
    kpiCard({ title: 'Unmatched in base',        big: meta.unmatchedInBase,      sub: 'B-only: preserved verbatim' }),
    kpiCard({ title: 'Ambiguous: not overlaid',  big: meta.ambiguousIdentitiesBase, sub: 'base rows with a repeated Activity ID, left verbatim',
              tone: meta.ambiguousIdentitiesBase > 0 ? 'red' : 'ink' }),
    kpiCard({ title: 'Logic preserved',          big: meta.logicPreserved,       sub: 'TASKPRED rows from B' })
  ]);

  /**
   * Join project labels for disclosure, or say plainly that the file does not
   * name them. Never invents one, and never uses one as a match key.
   *
   * @param {string[]} projects
   * @returns {string}
   */
  function projectClause(projects) {
    const named = (projects || []).filter(p => p !== '');
    return named.length === 0 ? 'the export does not name the projects involved' : named.join(', ');
  }

  // Ambiguity disclosure, ABOVE the numbers. A repeated Activity ID means the
  // export cannot say which row the other file's progress belongs to. The rows
  // are left verbatim and counted, never overlaid on a guess.
  const ambiguityNotices = [];
  if (meta.ambiguousCodesA > 0) {
    ambiguityNotices.push(
      `${meta.ambiguousCodesA} Activity ID${meta.ambiguousCodesA === 1 ? ' is' : 's are'} repeated in the ` +
      'updated export, so those rows are excluded from the comparison and the totals below cover only the ' +
      `unambiguous remainder. Repeated across: ${projectClause(meta.ambiguousProjectsA)}.`
    );
  }
  if (meta.ambiguousCodesB > 0) {
    ambiguityNotices.push(
      `${meta.ambiguousCodesB} Activity ID${meta.ambiguousCodesB === 1 ? ' is' : 's are'} repeated in the ` +
      'base export, so those rows are excluded from the comparison and the totals below cover only the ' +
      `unambiguous remainder. Repeated across: ${projectClause(meta.ambiguousProjectsB)}.`
    );
  }
  if (ambiguityNotices.length > 0) {
    ambiguityNotices.push(
      `${meta.ambiguousIdentitiesBase} base row(s) kept their original progress verbatim because there is no ` +
      'way to tell which of the repeated Activity IDs the updated progress belongs to. Nothing was merged and ' +
      'nothing was dropped.'
    );
  }

  const ambiguityCard = ambiguityNotices.length === 0 ? null : h('div', {
    class: 'lens-card',
    style: { border: '2px solid #B45309', background: '#FFFBEB' }
  }, [
    h('h3', { style: { color: '#B45309' } }, 'Read this before the numbers'),
    ...ambiguityNotices.map(t => h('p', { style: { color: '#0F2540' } }, t))
  ]);

  // The reconciliation is printed, not asserted: every base row lands in
  // exactly one column and the reader can check the addition.
  const reconciliationCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Reconciliation: every base row accounted for'),
    h('p', {},
      `Base export: ${meta.matched} overlaid + ${meta.unmatchedInBase} preserved (no counterpart in the updated ` +
      `export) + ${meta.ambiguousIdentitiesBase} excluded as ambiguous = ${meta.bCount} activity rows.`
    ),
    h('p', {},
      `Updated export: ${meta.matched} overlaid + ${meta.unmatchedInUpdated} with no counterpart in the base ` +
      `export + ${meta.ambiguousIdentities} excluded as ambiguous = ${meta.aCount} activity rows.`
    )
  ]);

  // Refusal gate. A Half-Step built from an implausibly small overlap is the
  // base schedule wearing a different name; one built from an EMPTY side is
  // not a Half-Step at all. Say which it is and withhold the file rather than
  // handing over a confident answer. matchRatio is null on the degenerate
  // cases — never format it there, it would print a confident "0.0%".
  const refusalHeadline = {
    [REFUSAL_REASONS.NO_ACTIVITIES_EITHER]:  'Half-Step withheld: neither schedule has any activities',
    [REFUSAL_REASONS.NO_ACTIVITIES_UPDATED]: 'Half-Step withheld: the updated schedule has no activities',
    [REFUSAL_REASONS.NO_ACTIVITIES_BASE]:    'Half-Step withheld: the base schedule has no activities'
  }[meta.refusalReason] || 'Half-Step withheld: the two schedules barely match';

  const refusalDetail = meta.matchRatio === null
    ? `A (updated) holds ${meta.aCount} activities and B (base) holds ${meta.bCount}. ` +
      'There is nothing to compare, so there is no overlap to measure.'
    : `Only ${meta.matched} of a possible ${meta.comparable} activities matched ` +
      `(${(meta.matchRatio * 100).toFixed(1)}%, floor is ${(MIN_MATCH_RATIO * 100).toFixed(0)}%). ` +
      `A (updated) holds ${meta.aCount} activities and B (base) holds ${meta.bCount}.`;

  const refusalAdvice = meta.matchRatio === null
    ? 'A Half-Step is the base schedule with the updated schedule\'s progress overlaid. With one ' +
      'side empty the output would just be the other file: a valid-looking XER that proves nothing. ' +
      'Check that both uploads are complete P6 exports and that the TASK table survived the export profile.'
    : 'With this little overlap the output would be the base schedule with almost no ' +
      'progress overlaid: indistinguishable from a real Half-Step, and wrong. Check that ' +
      'both files are exports of the SAME project and that their Activity IDs (task_code) ' +
      'were not renumbered between updates.';

  const refusalCard = !meta.implausible ? null : h('div', {
    class: 'lens-card',
    style: { border: '2px solid #C8392F', background: '#FFF5F4' }
  }, [
    h('h3', { style: { color: '#C8392F' } }, refusalHeadline),
    h('p', { style: { color: '#0F2540' } }, refusalDetail),
    h('p', { style: { color: '#0F2540' } }, refusalAdvice)
  ]);

  // Preview state container
  let previewVisible = false;
  const previewContainer = h('div', { class: 'lens-card', style: { display: 'none' } });

  function buildPreview() {
    const taskCount  = model.tables?.TASK?.records?.length ?? 0;
    const isHalfStep = model.ermhdr?.isHalfStep ?? false;
    previewContainer.innerHTML = '';
    previewContainer.appendChild(h('h3', {}, 'Half-Step Model Preview'));
    previewContainer.appendChild(h('p', {}, `TASK rows: ${taskCount}`));
    previewContainer.appendChild(h('p', {}, `ermhdr.isHalfStep: ${isHalfStep}`));
    previewContainer.appendChild(h('p', {}, `TASKPRED rows: ${meta.logicPreserved}`));
    previewContainer.appendChild(h('p', {}, `Matched activities: ${meta.matched}`));
    previewContainer.appendChild(h('p', {}, `Unmatched in updated (dropped): ${meta.unmatchedInUpdated}`));
    previewContainer.appendChild(h('p', {}, `Unmatched in base (preserved): ${meta.unmatchedInBase}`));
    previewContainer.appendChild(h('p', {}, `Matched on Activity ID (task_code): ${meta.matched - meta.matchedOnSurrogate}`));
    if (meta.matchedOnSurrogate > 0) {
      previewContainer.appendChild(h('p', { style: { color: '#B45309' } },
        `Matched on internal task_id (no Activity ID): ${meta.matchedOnSurrogate}. Those matches only hold ` +
        'if both exports happen to number the activity the same way.'
      ));
    }
    if (meta.ambiguousIdentities > 0) {
      previewContainer.appendChild(h('p', { style: { color: '#B45309' } },
        `Rows excluded in the updated schedule (repeated Activity ID): ${meta.ambiguousIdentities}. No row of ` +
        'a repeat was used as an overlay source, because either one would be a guess.'
      ));
    }
    if (meta.ambiguousIdentitiesBase > 0) {
      previewContainer.appendChild(h('p', { style: { color: '#B45309' } },
        `Rows excluded in the base schedule (repeated Activity ID): ${meta.ambiguousIdentitiesBase}. Those rows were left ` +
        'verbatim, because there is no way to tell which of them the updated progress belongs to.'
      ));
    }
    previewContainer.appendChild(
      meta.implausible
        ? h('p', { style: { color: '#C8392F', fontWeight: '700' } },
            `Half-Step WITHHELD: only ${meta.matched} of a possible ${meta.comparable} activities matched.`)
        : h('p', { style: { color: '#15803D', fontWeight: '700' } },
            'AACE 29R-03 MIP 3.4 Half-Step flag is set.')
    );
  }

  // Derive a sensible filename from A's first PROJECT row
  function buildFilename() {
    const projects = getTable(A, 'PROJECT') || [];
    const shortName = (projects[0]?.proj_short_name || 'schedule').replace(/\s+/g, '-').toLowerCase();
    return `${shortName}-half-step.xer`;
  }

  // "Generate + Download" button. Withheld entirely when the match is
  // implausible — an unusable file should not be one click away.
  const downloadBtn = meta.implausible
    ? h('button', {
        class: 'lens-btn-primary',
        disabled: true,
        style: { background: '#9CA3AF', color: '#fff', padding: '10px 20px', border: 'none',
                 borderRadius: '4px', cursor: 'not-allowed', fontWeight: '700', marginRight: '12px' }
      }, 'Half-Step XER withheld: match too low')
    : h('button', {
        class: 'lens-btn-primary',
        style: { background: '#0F2540', color: '#fff', padding: '10px 20px', border: 'none',
                 borderRadius: '4px', cursor: 'pointer', fontWeight: '700', marginRight: '12px' },
        onclick() {
          const xerText  = writeXer(model);
          const filename = buildFilename();
          triggerDownload(xerText, filename, 'text/plain');
        }
      }, 'Generate + Download Half-Step XER');

  // "Show preview" toggle button
  const toggleBtn = h('button', {
    class: 'lens-btn-secondary',
    style: { padding: '10px 20px', border: '1px solid #0F2540', borderRadius: '4px',
             cursor: 'pointer', fontWeight: '700' },
    onclick() {
      previewVisible = !previewVisible;
      if (previewVisible) {
        buildPreview();
        previewContainer.style.display = '';
        toggleBtn.textContent = 'Hide preview';
      } else {
        previewContainer.style.display = 'none';
        toggleBtn.textContent = 'Show preview';
      }
    }
  }, 'Show preview');

  const buttonRow = h('div', { style: { margin: '16px 0' } }, [downloadBtn, toggleBtn]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Half-Step XER (AACE 29R-03 MIP 3.4)'),
    ...(refusalCard ? [refusalCard] : []),
    ...(ambiguityCard ? [ambiguityCard] : []),
    explainerCard,
    kpiRow,
    reconciliationCard,
    buttonRow,
    previewContainer
  ]);
}
