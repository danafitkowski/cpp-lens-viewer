import {
  resolveTaskKey,
  indexTasks,
  indexRelsByCode,
  resolveComparisonAmbiguity
} from './identity.js';

// Activity identity lives in ONE place — ./identity.js. Re-exported so any
// existing importer of diff-models keeps working while there stays exactly
// one implementation of "same activity across two exports".
export { resolveTaskKey };

/**
 * Diff two parsed XER models. Single source of truth for all Compare-group
 * sections (XER Comparison, Period Reporting, Narrative Flip).
 *
 * Returns: {
 *   tasks:         { added: [task...], deleted: [task...],
 *                    changed: [{ key, matched_on, task_code, task_id, task_name, field, before, after, daysDelta? }],
 *                    changedActivityKeys: [key...],
 *                    ambiguous: {...}, matched: n },
 *   relationships: { added: [rel...], deleted: [rel...], retained: [rel...],
 *                    lagChanged: [...], unresolved: { a, b }, malformed: { a, b },
 *                    ambiguous: { a, b }, duplicates: { a, b } },
 *   counts:        { tasksMatched, tasksAdded, tasksDeleted, activitiesChanged, fieldChanges,
 *                    tasksAmbiguousA, tasksAmbiguousB, ambiguousCodesA, ambiguousCodesB,
 *                    tasksNoIdentityA, tasksNoIdentityB, tasksTotalA, tasksTotalB,
 *                    relsAdded, relsDeleted, relsRetained, relsLagChanged,
 *                    relsAmbiguousA, relsAmbiguousB,
 *                    relsUnresolvedA, relsUnresolvedB, relsMalformedA, relsMalformedB,
 *                    relsDuplicateA, relsDuplicateB, relsLagMissingA, relsLagMissingB }
 * }
 *
 * ACTIVITY IDENTITY — see ./identity.js for the rule.
 * Cross-export identity is the Activity ID (task_code) alone, on every pair,
 * always. There is no automatic project scope and no strategy list; three
 * attempts at one each produced a new way to be confidently wrong on real
 * files (732/327/0/0, then 405 added on a pair with 316 changed activities,
 * then 405 added AND 405 deleted on a pair whose answer is zero of each).
 *
 * REPEATED ACTIVITY IDs ARE EXCLUDED AND DISCLOSED, NEVER RESOLVED BY GUESSING.
 * A code repeated in either file is ambiguous for both sides: every row
 * carrying it is kept out of the added / deleted / changed verdict, counted in
 * counts.tasksAmbiguousA/B, and listed in tasks.ambiguous with the projects it
 * spans. Nothing is merged and nothing is dropped.
 *
 * THE TOTALS RECONCILE, AND SECTIONS PRINT THE RECONCILIATION:
 *   tasksMatched + tasksAdded   + tasksAmbiguousA + tasksNoIdentityA === tasksTotalA
 *   tasksMatched + tasksDeleted + tasksAmbiguousB + tasksNoIdentityB === tasksTotalB
 *
 * RELATIONSHIP IDENTITY — see ./identity.js for the rule.
 * TASKPRED.task_id / .pred_task_id are export-specific surrogates. Keying the
 * relationship diff on them raw matched nothing between two real exports:
 * every current relationship read "added" and every baseline one "deleted"
 * (655 added / 535 deleted on a pair that actually shares 472). Both endpoints
 * are now resolved through their OWN model's TASK table into Activity codes
 * first, and the key is predCode::succCode::type::lag. Rows whose endpoints
 * cannot be resolved are kept, keyed on the surrogate, and COUNTED in
 * counts.relsUnresolvedA/B. Rows touching an AMBIGUOUS activity are excluded
 * from the verdict and counted in counts.relsAmbiguousA/B — keying them on the
 * surrogate would manufacture one false addition and one false deletion each.
 *
 * LAG IS PART OF THE KEY — and relsAdded/relsDeleted overlap because of it.
 * Re-lagging existing logic moves a schedule without touching any activity. On
 * a key of pred/succ/type alone that edit reads as "retained" — no change
 * reported on exactly the edit a forensic reader is hunting. With the lag in
 * the key it reads as one deletion plus one addition, which is arithmetically
 * right but overstates the churn: it says two links changed when one was
 * re-lagged.
 *
 * So both are reported. counts.relsAdded / relsDeleted are the honest
 * lag-inclusive figures, and counts.relsLagChanged says how many pred/succ/type
 * pairs are present in BOTH files with a different lag. Those pairs are counted
 * once in relsAdded AND once in relsDeleted; the rows carry `lag_changed: true`
 * so a table can label them instead of leaving the reader to notice that an
 * addition and a deletion are the same link. Measured on the real QA pair:
 * 183 added / 63 deleted / 472 retained, of which 4 are lag-only changes —
 * matching QA exactly. The lag-blind key returned 179 / 59 / 476.
 *
 * COUNT SEMANTICS — read before rendering either number.
 * `tasks.changed` holds ONE ENTRY PER CHANGED FIELD, so changed.length is a
 * count of FIELDS, not of activities. A single activity that shifted start,
 * finish and float contributes three entries. The two counts are therefore
 * kept separate and must be labelled for what they are:
 *   counts.activitiesChanged — distinct activities with at least one field change
 *   counts.fieldChanges      — total field-level changes across those activities
 * There is deliberately NO `counts.tasksChanged`: that ambiguous name was
 * rendered as "Activities changed" while holding the field total (1,429 on a
 * 405-activity schedule). A stale consumer now renders `undefined` loudly
 * instead of a wrong number quietly.
 *
 * Date deltas (when field ends in `_date`) report CALENDAR-day deltas at v1.
 * Working-day deltas are deferred to v1.1 — they require per-activity calendar
 * resolution which adds complexity not yet warranted. UI columns rendering
 * daysDelta SHOULD label headers as "Δ (cal days)" honestly (not "Δ (wd)").
 * To upgrade to working days: import getWorkDaysBetween + getCalendarMap and
 * compute per-activity, then update the header label to "Δ (wd)".
 *
 * Locked sign convention: deltas are A − B (current minus baseline).
 * A later finish in A = positive daysDelta = the schedule slipped.
 * Lag deltas follow the same convention: lagDeltaHr = A lag − B lag.
 *
 * @param {object|null} A - Current / updated model (the "after")
 * @param {object|null} B - Baseline / prior model (the "before")
 * @returns {DiffResult}
 */

/** Fields compared on each matched task pair. */
const TASK_FIELDS_TO_DIFF = [
  'task_name',
  'target_start_date', 'target_end_date',
  'act_start_date', 'act_end_date',
  'target_drtn_hr_cnt', 'remain_drtn_hr_cnt',
  'total_float_hr_cnt',
  'status_code', 'task_type',
  'phys_complete_pct',
  'cstr_type', 'cstr_date'
];

/**
 * Compute A − B in calendar days for two date strings.
 * Returns null when either value cannot be parsed.
 * v1: calendar days only. v1.1 target: upgrade to working days.
 *
 * @param {string} after  - Date string from model A
 * @param {string} before - Date string from model B
 * @returns {number|null}
 */
function dayDelta(after, before) {
  if (!after || !before) return null;
  const da = new Date(String(after).slice(0, 10));
  const db = new Date(String(before).slice(0, 10));
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Diff two parsed XER models and return a structured delta object.
 *
 * @param {object|null} A - Current / updated model
 * @param {object|null} B - Baseline / prior model
 * @returns {{ tasks: object, relationships: object, counts: object }}
 */
export function diffModels(A, B) {
  // ONE ambiguity ledger for the pair, applied to both sides. A code repeated
  // in either file is excluded from both, so neither side can report an
  // addition or a deletion about an activity the other side plainly holds.
  const ambiguity = resolveComparisonAmbiguity(A, B);
  const aIdx = indexTasks(A, ambiguity.keys);
  const bIdx = indexTasks(B, ambiguity.keys);
  const aTasks = aIdx.index;
  const bTasks = bIdx.index;

  const added = [];
  const deleted = [];
  const changed = [];
  let matched = 0;

  // Activities present in A but absent in B are "added" (new scope)
  for (const [id, t] of aTasks) {
    if (bTasks.has(id)) matched++;
    else added.push(t);
  }

  // Activities present in B but absent in A are "deleted" (removed scope)
  for (const [id, t] of bTasks) {
    if (!aTasks.has(id)) deleted.push(t);
  }

  // Field-level diff for activities present in both.
  // NOTE: this pushes ONE ENTRY PER CHANGED FIELD. changed.length is a field
  // count. The distinct-activity count is tracked separately below — the two
  // must never be rendered under the same label.
  const changedActivityKeys = [];
  for (const [id, t] of aTasks) {
    const prev = bTasks.get(id);
    if (!prev) continue;
    // Identity comes from the shared resolver so the rendered Activity ID and
    // the match key can never drift apart (and a whitespace-only task_code is
    // not passed off as an Activity ID).
    const ident = resolveTaskKey(t);
    const prevIdent = resolveTaskKey(prev);
    let activityHasChange = false;
    for (const f of TASK_FIELDS_TO_DIFF) {
      const av = t[f] != null ? t[f] : '';
      const bv = prev[f] != null ? prev[f] : '';
      if (String(av) !== String(bv)) {
        const entry = {
          key: id,
          matched_on: ident.matched_on,
          task_code: ident.code || prevIdent.code || '',
          task_id: ident.id || prevIdent.id || '',
          task_name: t.task_name || prev.task_name || '',
          field: f,
          before: bv,
          after: av
        };
        if (f.endsWith('_date')) {
          // v1: calendar days. v1.1: swap in getWorkDaysBetween per activity calendar.
          // Column headers must display "Δ (cal days)" — do NOT label as "Δ (wd)".
          entry.daysDelta = dayDelta(av, bv);
        }
        changed.push(entry);
        activityHasChange = true;
      }
    }
    if (activityHasChange) changedActivityKeys.push(id);
  }

  // Relationships are keyed on RESOLVED ENDPOINT CODES plus the LAG. Endpoint
  // keys inherit the activity keys, so both sides get the SAME ambiguity ledger
  // — a link touching a repeated Activity ID is excluded on both sides at once.
  const aRels = indexRelsByCode(A, ambiguity.keys);
  const bRels = indexRelsByCode(B, ambiguity.keys);
  const relsAdded = [];
  const relsDeleted = [];
  const relsRetained = [];

  // A pred/succ/type pair present in BOTH files whose lag set differs is a
  // RE-LAGGED link, not an unrelated addition plus an unrelated deletion. It is
  // still counted in both relsAdded and relsDeleted (the key carries the lag,
  // and that is the arithmetic); this names it for what it is.
  const lagChanged = [];
  const lagChangedPairs = new Set();
  for (const [pairKey, aLags] of aRels.byPair) {
    const bLags = bRels.byPair.get(pairKey);
    if (!bLags) continue;
    const aLagList = [...aLags.keys()];
    const bLagList = [...bLags.keys()];
    const sameLags = aLagList.length === bLagList.length && aLagList.every(l => bLags.has(l));
    if (sameLags) continue;

    lagChangedPairs.add(pairKey);
    const aRow = aLags.get(aLagList.find(l => !bLags.has(l))) ?? aLags.get(aLagList[0]);
    const info = aRels.meta.get(aRow) || {};
    const beforeHr = bLagList.length === 1 ? Number(bLagList[0]) : NaN;
    const afterHr  = aLagList.length === 1 ? Number(aLagList[0]) : NaN;
    lagChanged.push({
      pairKey,
      pred_code: info.predCode || '',
      succ_code: info.succCode || '',
      pred_type: info.type || '',
      endpoints_resolved: info.resolved === true,
      lag_before_hr: bLagList.join(', '),
      lag_after_hr: aLagList.join(', '),
      lagDeltaHr: (Number.isFinite(beforeHr) && Number.isFinite(afterHr)) ? afterHr - beforeHr : null
    });
  }

  /**
   * Present a relationship row with its endpoints resolved to Activity IDs.
   * Returns a shallow copy — the parsed model is never mutated. When an
   * endpoint could not be resolved, `pred_code`/`succ_code` carry the raw
   * surrogate and `endpoints_resolved` is false, so the UI can say so.
   *
   * `lag_changed` marks a row whose pred/succ/type pair exists on the other
   * side too with a different lag — an added/deleted row that is really one
   * half of a re-lag.
   *
   * @param {object} r
   * @param {{ meta: Map<object, object> }} idx
   * @param {boolean} markLag - only added/deleted rows carry the lag marker
   * @returns {object}
   */
  function present(r, idx, markLag) {
    const info = idx.meta.get(r) || {};
    return {
      ...r,
      pred_code: info.predCode || '',
      succ_code: info.succCode || '',
      lag_hr_cnt: info.lag != null ? info.lag : (r.lag_hr_cnt != null ? r.lag_hr_cnt : ''),
      endpoints_resolved: info.resolved === true,
      lag_changed: markLag === true && info.pairKey != null && lagChangedPairs.has(info.pairKey)
    };
  }

  for (const [k, r] of aRels.index) {
    if (bRels.index.has(k)) relsRetained.push(present(r, aRels, false));
    else relsAdded.push(present(r, aRels, true));
  }
  for (const [k, r] of bRels.index) {
    if (!aRels.index.has(k)) relsDeleted.push(present(r, bRels, true));
  }

  return {
    tasks: {
      added, deleted, changed, changedActivityKeys,
      // Activities present, unambiguously, in BOTH files.
      matched,
      // Rows excluded from the verdict because their Activity ID is repeated in
      // one of the two files. Counted, kept and listed — never merged into the
      // matched set, never dropped, never separated by an invented scope.
      ambiguous: {
        any: ambiguity.any,
        a: ambiguity.a,
        b: ambiguity.b
      },
      // Per-file reconciliation, so a section can print it rather than assert it.
      reconciliation: {
        a: {
          matched,
          unmatched: added.length,
          unmatchedLabel: 'added',
          ambiguous: aIdx.ambiguous,
          noIdentity: aIdx.noIdentity,
          total: aIdx.total,
          reconciles: matched + added.length + aIdx.ambiguous + aIdx.noIdentity === aIdx.total
        },
        b: {
          matched,
          unmatched: deleted.length,
          unmatchedLabel: 'deleted',
          ambiguous: bIdx.ambiguous,
          noIdentity: bIdx.noIdentity,
          total: bIdx.total,
          reconciles: matched + deleted.length + bIdx.ambiguous + bIdx.noIdentity === bIdx.total
        }
      }
    },
    relationships: {
      added: relsAdded,
      deleted: relsDeleted,
      retained: relsRetained,
      // Pairs present in both files with a different lag. Each is also counted
      // once in `added` and once in `deleted` — see the header comment.
      lagChanged,
      // Endpoints that could not be resolved to a TASK row in their own file.
      // These rows are STILL in the diff above, keyed on the surrogate; the
      // count exists so a reader knows how much of the answer is degraded.
      unresolved: { a: aRels.unresolved, b: bRels.unresolved },
      // Rows naming no predecessor or no successor at all — nothing to key on.
      malformed: { a: aRels.malformed, b: bRels.malformed },
      // Rows touching an activity whose Activity ID is repeated. Excluded from
      // the verdict above and counted here, never guessed at.
      ambiguous: { a: aRels.ambiguous, b: bRels.ambiguous },
      // A second row with an identical pred/succ/type/lag; only one is indexed.
      duplicates: { a: aRels.duplicates, b: bRels.duplicates },
      // Rows with no lag_hr_cnt field at all, read as zero per P6 semantics.
      lagMissing: { a: aRels.lagMissing, b: bRels.lagMissing }
    },
    counts: {
      // Activities present, unambiguously, in both files.
      tasksMatched: matched,
      tasksAdded: added.length,
      tasksDeleted: deleted.length,
      // Distinct activities carrying at least one field change.
      activitiesChanged: changedActivityKeys.length,
      // Total field-level changes across those activities (>= activitiesChanged).
      fieldChanges: changed.length,
      // Rows excluded because their Activity ID is repeated in one of the files.
      tasksAmbiguousA: aIdx.ambiguous,
      tasksAmbiguousB: bIdx.ambiguous,
      // How many distinct Activity IDs repeat within each file.
      ambiguousCodesA: ambiguity.a.codeCount,
      ambiguousCodesB: ambiguity.b.codeCount,
      // Rows carrying neither a task_code nor a task_id.
      tasksNoIdentityA: aIdx.noIdentity,
      tasksNoIdentityB: bIdx.noIdentity,
      // Every TASK row read, so the reconciliation can be printed.
      tasksTotalA: aIdx.total,
      tasksTotalB: bIdx.total,
      relsAdded: relsAdded.length,
      relsDeleted: relsDeleted.length,
      relsRetained: relsRetained.length,
      // Pairs re-lagged; counted once in relsAdded and once in relsDeleted.
      relsLagChanged: lagChanged.length,
      relsAmbiguousA: aRels.ambiguous,
      relsAmbiguousB: bRels.ambiguous,
      relsUnresolvedA: aRels.unresolved,
      relsUnresolvedB: bRels.unresolved,
      relsMalformedA: aRels.malformed,
      relsMalformedB: bRels.malformed,
      relsDuplicateA: aRels.duplicates,
      relsDuplicateB: bRels.duplicates,
      relsLagMissingA: aRels.lagMissing,
      relsLagMissingB: bRels.lagMissing,
      relsTotalA: aRels.total,
      relsTotalB: bRels.total
    }
  };
}
