import { getTable, getTableAliased, getFirstField } from '@criticalpathpartners/lens-parser';

/**
 * Diff two parsed XER models. Single source of truth for all Compare-group
 * sections (XER Comparison, Period Reporting, Narrative Flip).
 *
 * Returns: {
 *   tasks:         { added: [task...], deleted: [task...], changed: [{ task_id, task_name, field, before, after, daysDelta? }] },
 *   relationships: { added: [rel...], deleted: [rel...] },
 *   counts:        { tasksAdded, tasksDeleted, tasksChanged, relsAdded, relsDeleted }
 * }
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
 * Build a Map from task_id → task row for every task in the model.
 * Falls back to task_code when task_id is absent.
 *
 * @param {object|null} model
 * @returns {Map<string, object>}
 */
function indexTasks(model) {
  const idx = new Map();
  for (const t of getTable(model, 'TASK')) {
    const id = getFirstField(t, ['task_id', 'task_code']);
    if (id) idx.set(String(id), t);
  }
  return idx;
}

/**
 * Build a Map from composite key (pred::succ::type) → relationship row.
 * Uses the REL alias which resolves TASKPRED in P6 XER.
 *
 * @param {object|null} model
 * @returns {Map<string, object>}
 */
function indexRels(model) {
  const idx = new Map();
  for (const r of getTableAliased(model, 'REL')) {
    const succ = getFirstField(r, ['task_id', 'succ_task_id']);
    const pred = getFirstField(r, ['pred_task_id']);
    const type = r.pred_type || 'PR_FS';
    if (!succ || !pred) continue;
    const key = `${pred}::${succ}::${type}`;
    idx.set(key, r);
  }
  return idx;
}

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
  const aTasks = indexTasks(A);
  const bTasks = indexTasks(B);

  const added = [];
  const deleted = [];
  const changed = [];

  // Activities present in A but absent in B are "added" (new scope)
  for (const [id, t] of aTasks) {
    if (!bTasks.has(id)) added.push(t);
  }

  // Activities present in B but absent in A are "deleted" (removed scope)
  for (const [id, t] of bTasks) {
    if (!aTasks.has(id)) deleted.push(t);
  }

  // Field-level diff for activities present in both
  for (const [id, t] of aTasks) {
    const prev = bTasks.get(id);
    if (!prev) continue;
    for (const f of TASK_FIELDS_TO_DIFF) {
      const av = t[f] != null ? t[f] : '';
      const bv = prev[f] != null ? prev[f] : '';
      if (String(av) !== String(bv)) {
        const entry = {
          task_id: id,
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
      }
    }
  }

  const aRels = indexRels(A);
  const bRels = indexRels(B);
  const relsAdded = [];
  const relsDeleted = [];

  for (const [k, r] of aRels) {
    if (!bRels.has(k)) relsAdded.push(r);
  }
  for (const [k, r] of bRels) {
    if (!aRels.has(k)) relsDeleted.push(r);
  }

  return {
    tasks: { added, deleted, changed },
    relationships: { added: relsAdded, deleted: relsDeleted },
    counts: {
      tasksAdded: added.length,
      tasksDeleted: deleted.length,
      tasksChanged: changed.length,
      relsAdded: relsAdded.length,
      relsDeleted: relsDeleted.length
    }
  };
}
