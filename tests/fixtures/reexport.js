/**
 * reexport.js — simulate a SEPARATE P6 export of the same project.
 *
 * THE REAL-WORLD CONDITION THE OLD FIXTURES MISSED
 * ------------------------------------------------
 * P6 reassigns the internal surrogate task_id on every export. The user-facing
 * task_code (Activity ID) is stable. Fixtures that hand both sides of a
 * comparison the SAME task_id values therefore test a condition that never
 * occurs in production, which is how a fully green suite shipped a viewer whose
 * comparison sections matched 0 of 318 activities.
 *
 * Any fixture used to test A-vs-B behaviour must run one side through this.
 *
 * Renumbering is applied CONSISTENTLY across every table that carries a
 * surrogate reference — TASK, TASKPRED (both endpoints), TASKACTV, TASKRSRC and
 * anything else with a `task_id` / `pred_task_id` column. The earlier helper
 * renumbered TASK only, leaving TASKPRED pointing at ids that no longer existed;
 * that is a dangling-reference file, not a re-export, and it is why the
 * relationship bug survived a test that was aimed straight at it.
 *
 * THIS MODULE IS THE ONE SANCTIONED WAY TO BUILD A TWO-MODEL FIXTURE.
 * `tests/unit/two-model-fixture-guard.test.js` enforces that every test file
 * comparing two models proves its pair with assertDivergentSurrogates(), so a
 * fixture whose two sides share task_id values can no longer sit green.
 */

/** Columns that hold a surrogate reference to TASK.task_id. */
const TASK_REF_COLUMNS = ['task_id', 'pred_task_id', 'succ_task_id'];

/**
 * Deep-clone a parsed model and renumber every surrogate task_id.
 *
 * task_code is left untouched — that is the whole point. Record order in TASK
 * is also reversed, so a section that accidentally matches by array position
 * cannot pass either.
 *
 * @param {object} model - a parsed XER model
 * @param {number} [offset=100000] - added to every numeric task_id
 * @returns {object} a new model; the input is not mutated
 */
export function reexport(model, offset = 100000) {
  const out = JSON.parse(JSON.stringify(model));

  // old task_id → new task_id, built from the TASK table.
  const remap = new Map();
  const taskRecords = out.tables?.TASK?.records || [];
  for (const t of taskRecords) {
    if (t.task_id == null || String(t.task_id).trim() === '') continue;
    const oldId = String(t.task_id).trim();
    const n = Number(oldId);
    const newId = Number.isFinite(n) ? String(n + offset) : `${oldId}_rx`;
    remap.set(oldId, newId);
  }

  // Rewrite every surrogate reference in every table, TASK included.
  for (const table of Object.values(out.tables || {})) {
    for (const rec of table.records || []) {
      for (const col of TASK_REF_COLUMNS) {
        if (!(col in rec)) continue;
        const cur = rec[col] == null ? '' : String(rec[col]).trim();
        if (cur === '') continue;
        const mapped = remap.get(cur);
        if (mapped != null) rec[col] = mapped;
      }
    }
  }

  // Reverse TASK order so positional coincidence cannot stand in for matching.
  if (out.tables?.TASK?.records) out.tables.TASK.records.reverse();

  return out;
}

/**
 * Assert-friendly check that a pair really is the condition under test:
 * every task_id differs while every task_code matches.
 *
 * @param {object} A
 * @param {object} B
 * @returns {{ sharedCodes: number, sharedTaskIds: number }}
 */
export function identityOverlap(A, B) {
  const codes = m => new Set((m.tables?.TASK?.records || [])
    .map(t => String(t.task_code ?? '').trim()).filter(Boolean));
  const ids = m => new Set((m.tables?.TASK?.records || [])
    .map(t => String(t.task_id ?? '').trim()).filter(Boolean));

  const aCodes = codes(A), bCodes = codes(B);
  const aIds = ids(A), bIds = ids(B);

  let sharedCodes = 0;
  for (const c of aCodes) if (bCodes.has(c)) sharedCodes++;
  let sharedTaskIds = 0;
  for (const i of aIds) if (bIds.has(i)) sharedTaskIds++;

  return { sharedCodes, sharedTaskIds };
}

/**
 * Refuse a two-model fixture that is not what production actually hands the
 * viewer: A and B must share NO task_id and must share at least one task_code.
 *
 * This is the runtime half of the guard. A test that calls it cannot quietly
 * regress to a pair of identical exports — the fixture itself fails first, with
 * the numbers in the message, before any assertion about the product runs.
 *
 * Throws rather than returning a boolean so it reads as a precondition at the
 * top of a suite, and so the failure names the fixture, not the feature.
 *
 * @param {object} A - current / updated model
 * @param {object} B - baseline / prior model
 * @param {{ minSharedCodes?: number }} [opts]
 * @returns {{ sharedCodes: number, sharedTaskIds: number }}
 */
export function assertDivergentSurrogates(A, B, { minSharedCodes = 1 } = {}) {
  const { sharedCodes, sharedTaskIds } = identityOverlap(A, B);

  if (sharedTaskIds !== 0) {
    throw new Error(
      `two-model fixture is not a real export pair: A and B share ${sharedTaskIds} task_id value(s). ` +
      'P6 renumbers every surrogate on export, so a matcher keyed on task_id passes against this ' +
      'fixture and still matches nothing in production. Build B with reexport(A) — or with its own ' +
      'disjoint surrogate range — and keep task_code stable.'
    );
  }

  if (sharedCodes < minSharedCodes) {
    throw new Error(
      `two-model fixture shares only ${sharedCodes} task_code value(s), needs at least ${minSharedCodes}. ` +
      'With no Activity ID in common there is nothing for a correct matcher to match, so the test ' +
      'cannot tell a working matcher from a broken one.'
    );
  }

  return { sharedCodes, sharedTaskIds };
}
