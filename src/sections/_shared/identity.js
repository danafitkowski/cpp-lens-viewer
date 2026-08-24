import { getTable, getTableAliased, getFirstField } from '@criticalpathpartners/lens-parser';

/**
 * identity.js — cross-schedule ACTIVITY IDENTITY. The single place any
 * comparison section is allowed to decide "is this row in A the same activity
 * as that row in B?".
 *
 * THE RULE
 * --------
 * P6 reassigns the internal surrogate `task_id` on EVERY export. Two exports
 * of the same project therefore share the user-facing `task_code` (the
 * Activity ID the scheduler types and reads) but NOT `task_id`. Any A-vs-B
 * match keyed on `task_id` matches NOTHING between two real exports: the same
 * activity reads added-in-A and deleted-in-B at the same time, and the section
 * renders a confident, well-formatted, meaningless answer.
 *
 * So: match on `task_code`, and on nothing else. Fall back to `task_id` ONLY
 * when a row genuinely has no code, and record that fallback in `matched_on` so
 * the degradation is visible instead of silent. Never drop a row for lacking an
 * identity.
 *
 * WHY THE KEYS CARRY A PREFIX
 * ---------------------------
 * `code:` / `id:` keeps a numeric task_code (e.g. "1010") from colliding with
 * a fallback numeric task_id (e.g. 1010) in the same Map. Keys are internal —
 * never render a key. Render `display` (or `code`) instead.
 *
 * THERE IS NO AUTOMATIC PROJECT SCOPE. THIS IS THE DESIGN, NOT AN OMISSION.
 * ------------------------------------------------------------------------
 * `task_code` is unique per PROJECT, not per FILE, so a multi-project export
 * really can repeat an Activity ID. Three successive attempts to solve that by
 * auto-detecting a project scope each produced a NEW way to be confidently
 * wrong, because every project-level field is free to move between two exports
 * of the same project. Measured on the two real Georgian College exports:
 *
 *   proj_id          4795                                        vs 4799
 *   proj_short_name  "Georgian College"                          vs "Georgian College - B2"
 *   WBS root name    "Georgian College Building F Expansion (CURRENT - FIXED)"
 *                                                                vs "Georgian College - baseline - FOR ANALYSIS"
 *
 * NOT ONE project-level discriminator survives. Scoping that pair on any of
 * them matches 0 of 318 shared Activity IDs. Renaming a project between the
 * baseline and the current update is ordinary working practice, not an edge
 * case, so a heuristic cannot tell "renamed" from "different".
 *
 * What the heuristics actually shipped, each on real files:
 *   - per-model scope selection  → 732 added / 327 deleted / 0 changed / 0 retained
 *   - pair-level scope selection → 405 added / 0 deleted / 0 changed on a pair
 *                                  whose live project shares 318 codes with the
 *                                  baseline and changed 316 of them
 *   - the same, with the live project renamed between exports
 *                                → 405 added AND 405 deleted on a pair whose
 *                                  truthful answer is zero of each
 *
 * So cross-export identity is the Activity ID alone, always, for every pair.
 * That makes the common case — single-project files, which is nearly all real
 * use — exactly right: 318 matched on the real pair.
 *
 * REPEATED ACTIVITY IDs ARE DISCLOSED, NEVER GUESSED
 * --------------------------------------------------
 * When a file repeats an Activity ID across its projects, those rows are
 * AMBIGUOUS for cross-file comparison: nothing in either export says which of
 * them the other file's row means. They are not merged, not dropped, and not
 * separated by an invented scope. They are excluded from the verdict, counted,
 * listed, and the projects involved are named. A code repeated in EITHER file
 * makes that code ambiguous for BOTH sides of the comparison — otherwise the
 * unambiguous side reads "deleted" about an activity that plainly exists.
 *
 * The counts reconcile, and every section prints the reconciliation:
 *   matched + added/deleted + ambiguous-excluded + no-identity === rows in file
 *
 * A user who genuinely needs a project-scoped comparison of a multi-project
 * file needs to NAME the project. That is a future feature with a human in it.
 * Nothing here guesses at it.
 *
 * NOTHING IN THIS MODULE THROWS ON WELL-FORMED INPUT
 * -------------------------------------------------
 * An earlier build guarded the (now deleted) scope machinery with a runtime
 * assertion that threw on a legitimate project name and took down all four
 * Compare sections at once. A guard that crashes the product on valid data is
 * worse than the defect it guards. Invariants about keys live in the test
 * suite, where a violation fails a build instead of a customer's screen.
 *
 * RELATIONSHIPS
 * -------------
 * TASKPRED.task_id / .pred_task_id are surrogates too, pointing at TASK rows
 * in the SAME file. A relationship's stable identity is therefore
 * `predCode::succCode::type::lag`, obtained by resolving both endpoints through
 * that model's OWN TASK table first. Endpoints that cannot be resolved (a
 * dangling reference, a cross-project link, a TASK table stripped by the
 * export profile) are keyed on the raw surrogate and COUNTED as unresolved —
 * they stay in the diff and are reported, never dropped. Endpoints that land on
 * an AMBIGUOUS activity are excluded from the verdict and counted separately:
 * keying them on the surrogate would guarantee one confident false addition and
 * one confident false deletion per link.
 *
 * WHY LAG IS IN THE KEY
 * ---------------------
 * A lag is part of what the relationship DOES. `A → B FS+10d` and `A → B FS+0d`
 * drive completion differently, and re-lagging existing logic is a standard way
 * a schedule moves without any activity being touched. Keyed on pred/succ/type
 * alone, that edit reads as "retained" — the diff reports no change at all on
 * the exact edit a forensic reader is looking for. On the real QA pair the
 * lag-blind key returned 179 added / 59 deleted / 476 retained against a
 * QA-confirmed 183 / 63 / 472; the four missing links are four relationships
 * whose lag moved and nothing else.
 *
 * Including lag makes such an edit read as one deletion plus one addition,
 * which is arithmetically right but tells the reader two links changed when one
 * was re-lagged. So the pair identity is ALSO exposed as `pairKey`
 * (predCode::succCode::type, no lag). diffModels uses it to name those rows as
 * a lag change explicitly, on top of the +/− counts, instead of leaving the
 * reader to spot that an addition and a deletion are the same link.
 */

/** Prefix for a key derived from the stable task_code (Activity ID). */
export const CODE_PREFIX = 'code:';

/** Prefix for a key that fell back to the export-specific surrogate task_id. */
export const ID_PREFIX = 'id:';

/**
 * Prefix for a relationship endpoint that could not be resolved to a TASK row
 * in its own model. Such a key is export-specific and will not match across
 * files — that is honest, and the count is surfaced so the reader knows.
 */
export const UNRESOLVED_PREFIX = 'unresolved:';

/**
 * Prefix for a relationship endpoint that resolved to an activity whose
 * Activity ID is repeated. The endpoint is real; which of the repeated rows it
 * means, across two files, is not knowable. Counted and excluded, never guessed.
 */
export const AMBIGUOUS_PREFIX = 'ambiguous:';

/**
 * Resolve one TASK row's cross-schedule identity.
 *
 * Takes ONE argument. There is no scope parameter, because there is no scope:
 * see the module header for the three heuristics that were tried and the real
 * numbers each of them got wrong.
 *
 * @param {object|null|undefined} task
 * @returns {{ key: string, matched_on: 'task_code'|'task_id'|'none', code: string, id: string, display: string }}
 *   `key` is prefixed and for matching only. `display` is the Activity ID to
 *   put in front of a human: task_code when there is one, else task_id.
 */
export function resolveTaskKey(task) {
  if (!task) return { key: '', matched_on: 'none', code: '', id: '', display: '' };
  const code = task.task_code == null ? '' : String(task.task_code).trim();
  const id   = task.task_id   == null ? '' : String(task.task_id).trim();
  if (code !== '') return { key: CODE_PREFIX + code, matched_on: 'task_code', code, id, display: code };
  if (id !== '')   return { key: ID_PREFIX + id,     matched_on: 'task_id',   code, id, display: id };
  return { key: '', matched_on: 'none', code, id, display: '' };
}

/**
 * The match key for a TASK row, or null when the row carries no identity at
 * all. Shorthand for `resolveTaskKey(task).key`.
 *
 * @param {object|null|undefined} task
 * @returns {string|null}
 */
export function taskKey(task) {
  const { key } = resolveTaskKey(task);
  return key === '' ? null : key;
}

/**
 * The Activity ID to display for a TASK row (task_code, else task_id).
 *
 * @param {object|null|undefined} task
 * @returns {string}
 */
export function taskDisplayId(task) {
  return resolveTaskKey(task).display;
}

/**
 * Strip the internal prefix off a key so it can be shown to a human. Only for
 * the case where the TASK row behind a key is not available — prefer
 * taskDisplayId(row) whenever you still have the row.
 *
 * @param {string|null|undefined} key
 * @returns {string}
 */
export function keyDisplay(key) {
  if (key == null) return '';
  let s = String(key);
  for (const p of [CODE_PREFIX, ID_PREFIX, UNRESOLVED_PREFIX, AMBIGUOUS_PREFIX]) {
    if (s.startsWith(p)) return s.slice(p.length);
  }
  return s;
}

/**
 * proj_id → a human label for that project, for DISCLOSURE ONLY.
 *
 * This label never enters a key and never influences a match. It exists so a
 * section can say WHICH projects a repeated Activity ID spans. proj_short_name
 * first, then the WBS project-node name, then the bare proj_id — because when a
 * file names its projects nothing at all, "project 4795" is still more useful
 * to a reader than a blank cell, and a label cannot corrupt a comparison the
 * way a key can.
 *
 * @param {object|null} model
 * @returns {Map<string,string>}
 */
export function projectLabels(model) {
  const out = new Map();
  for (const p of getTable(model, 'PROJECT')) {
    const pid = p.proj_id == null ? '' : String(p.proj_id).trim();
    if (pid === '' || out.has(pid)) continue;
    const sn = p.proj_short_name == null ? '' : String(p.proj_short_name).trim();
    if (sn !== '') out.set(pid, sn);
  }
  for (const w of getTable(model, 'PROJWBS')) {
    const pid = w.proj_id == null ? '' : String(w.proj_id).trim();
    if (pid === '' || out.has(pid)) continue;
    if (String(w.proj_node_flag == null ? '' : w.proj_node_flag).trim() !== 'Y') continue;
    const name = w.wbs_name == null ? '' : String(w.wbs_name).trim();
    if (name !== '') out.set(pid, name);
  }
  return out;
}

/**
 * The project label for one TASK row, for disclosure only.
 *
 * @param {object} task
 * @param {Map<string,string>} labels - from projectLabels(sameModel)
 * @returns {string}
 */
function projectOf(task, labels) {
  const pid = task && task.proj_id != null ? String(task.proj_id).trim() : '';
  if (pid === '') return '';
  return labels.get(pid) || `project ${pid}`;
}

/**
 * Every identity that occurs more than once in ONE model.
 *
 * @param {object|null} model
 * @returns {Map<string, object[]>} key → every TASK row carrying it (length ≥ 2)
 */
export function repeatedTaskKeys(model) {
  /** @type {Map<string, object[]>} */
  const byKey = new Map();
  for (const t of getTable(model, 'TASK')) {
    const key = taskKey(t);
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(t);
    else byKey.set(key, [t]);
  }
  const repeated = new Map();
  for (const [key, rows] of byKey) if (rows.length > 1) repeated.set(key, rows);
  return repeated;
}

/**
 * Describe one model's repeated Activity IDs in reader-facing terms.
 *
 * @param {object|null} model
 * @returns {Array<{ key: string, display: string, rowCount: number, projects: string[] }>}
 */
function describeRepeats(model) {
  const labels = projectLabels(model);
  const out = [];
  for (const [key, rows] of repeatedTaskKeys(model)) {
    const projects = [];
    for (const r of rows) {
      const label = projectOf(r, labels);
      if (label !== '' && !projects.includes(label)) projects.push(label);
    }
    out.push({ key, display: keyDisplay(key), rowCount: rows.length, projects });
  }
  out.sort((a, b) => a.display.localeCompare(b.display));
  return out;
}

/**
 * The ambiguity ledger for ONE comparison.
 *
 * A code repeated in EITHER file is ambiguous for BOTH sides. Excluding it on
 * the repeating side only would leave the other side's row unmatched, and an
 * unmatched row is reported as added or deleted — a confident claim about an
 * activity that demonstrably exists. So the exclusion is symmetric.
 *
 * @param {object|null} A - current / updated model
 * @param {object|null} B - baseline / prior model
 * @returns {{
 *   keys: Set<string>,
 *   any: boolean,
 *   codeCount: number,
 *   a: { repeats: object[], codeCount: number, excludedRows: object[], rowCount: number, projects: string[] },
 *   b: { repeats: object[], codeCount: number, excludedRows: object[], rowCount: number, projects: string[] }
 * }}
 *   `repeats` are the codes repeated in THAT file. `excludedRows` are every row
 *   in that file kept out of the comparison by the ledger — which includes rows
 *   whose code repeats only in the other file. `rowCount` is what reconciles.
 */
export function resolveComparisonAmbiguity(A, B) {
  const aRepeats = describeRepeats(A);
  const bRepeats = describeRepeats(B);

  const keys = new Set();
  for (const r of aRepeats) keys.add(r.key);
  for (const r of bRepeats) keys.add(r.key);

  /**
   * @param {object|null} model
   * @param {object[]} repeats
   */
  function side(model, repeats) {
    const labels = projectLabels(model);
    const excludedRows = [];
    for (const t of getTable(model, 'TASK')) {
      const key = taskKey(t);
      if (!key || !keys.has(key)) continue;
      const ident = resolveTaskKey(t);
      excludedRows.push({
        key,
        display: ident.display,
        task_id: ident.id,
        task_name: t.task_name == null ? '' : String(t.task_name),
        project: projectOf(t, labels),
        row: t
      });
    }
    const projects = [];
    for (const r of repeats) for (const p of r.projects) if (!projects.includes(p)) projects.push(p);
    return {
      repeats,
      codeCount: repeats.length,
      excludedRows,
      rowCount: excludedRows.length,
      projects
    };
  }

  return {
    keys,
    any: keys.size > 0,
    codeCount: keys.size,
    a: side(A, aRepeats),
    b: side(B, bRepeats)
  };
}

/**
 * Index a model's TASK rows by stable key and report everything that did NOT
 * make it into the index rather than losing it.
 *
 * NOTHING IS DISPLACED. A key that occurs more than once in this model — or
 * that the caller's ambiguity ledger marks ambiguous — puts EVERY row carrying
 * it into `ambiguousRows`, including the first. There is no "first row wins":
 * picking one of two identical Activity IDs to represent both is a guess, and a
 * guess is what this module exists to refuse. The index therefore holds only
 * identities that are unambiguous for this comparison.
 *
 * The three reconcile: index.size + ambiguous + noIdentity === total.
 *
 * @param {object|null} model
 * @param {Set<string>|null} [ambiguousKeys] - from resolveComparisonAmbiguity().keys.
 *   Omit to use this model's own repeats only, which is what a single-model
 *   caller wants. The model's own repeats are ALWAYS excluded, whether or not
 *   the caller passes a set, so the index can never hold a collision.
 * @returns {{
 *   index: Map<string, object>,
 *   ambiguousRows: Array<{key:string, display:string, task_id:string, task_name:string, project:string, row:object}>,
 *   ambiguous: number,
 *   noIdentity: number,
 *   total: number
 * }}
 */
export function indexTasks(model, ambiguousKeys = null) {
  const own = repeatedTaskKeys(model);
  const labels = projectLabels(model);
  const index = new Map();
  const ambiguousRows = [];
  let noIdentity = 0;
  let total = 0;

  for (const t of getTable(model, 'TASK')) {
    total++;
    const ident = resolveTaskKey(t);
    if (ident.key === '') { noIdentity++; continue; }
    if (own.has(ident.key) || (ambiguousKeys && ambiguousKeys.has(ident.key))) {
      ambiguousRows.push({
        key: ident.key,
        display: ident.display,
        task_id: ident.id,
        task_name: t.task_name == null ? '' : String(t.task_name),
        project: projectOf(t, labels),
        row: t
      });
      continue;
    }
    index.set(ident.key, t);
  }

  return { index, ambiguousRows, ambiguous: ambiguousRows.length, noIdentity, total };
}

/**
 * Index a model's TASK rows by stable key.
 *
 * Convenience wrapper over indexTasks() for callers that only need the Map.
 * Use indexTasks() when the section has to disclose ambiguous identities —
 * which every comparison section must.
 *
 * @param {object|null} model
 * @param {Set<string>|null} [ambiguousKeys]
 * @returns {Map<string, object>} stable key → TASK row
 */
export function indexTasksByCode(model, ambiguousKeys = null) {
  return indexTasks(model, ambiguousKeys).index;
}

/**
 * How many TASK rows are excluded from a comparison because their Activity ID
 * is repeated. Zero on a healthy single-project export. On a multi-project file
 * this is the AMBIGUITY COUNT — the number of rows no comparison can speak for
 * — and it must reach the screen rather than being absorbed.
 *
 * @param {object|null} model
 * @param {Set<string>|null} [ambiguousKeys]
 * @returns {number}
 */
export function ambiguousTaskRows(model, ambiguousKeys = null) {
  return indexTasks(model, ambiguousKeys).ambiguous;
}

/**
 * How many distinct activity identities appear in BOTH models, counting only
 * identities that are unambiguous on both sides.
 *
 * @param {object|null} A
 * @param {object|null} B
 * @returns {number}
 */
export function matchedIdentityCount(A, B) {
  const ambiguity = resolveComparisonAmbiguity(A, B);
  const aKeys = indexTasks(A, ambiguity.keys).index;
  const bKeys = indexTasks(B, ambiguity.keys).index;
  let matched = 0;
  for (const k of aKeys.keys()) if (bKeys.has(k)) matched++;
  return matched;
}

/**
 * Build the within-file bridge: surrogate task_id → stable key.
 *
 * This is what turns a relationship endpoint (a surrogate) into something
 * comparable across exports. It is ALWAYS built from the model that owns the
 * relationship row — never from the other side of the comparison.
 *
 * An endpoint landing on an ambiguous activity is mapped to an AMBIGUOUS_PREFIX
 * key rather than to the activity: the endpoint is real, but which of the
 * repeated rows it means across two files is not knowable, and keying it on the
 * bare code would match the wrong activity's links.
 *
 * @param {object|null} model
 * @param {Set<string>|null} [ambiguousKeys] - from resolveComparisonAmbiguity().keys
 * @returns {Map<string, string>} String(task_id) → stable key
 */
export function buildSurrogateKeyIndex(model, ambiguousKeys = null) {
  const own = repeatedTaskKeys(model);
  const idx = new Map();
  for (const t of getTable(model, 'TASK')) {
    const rawId = t.task_id == null ? '' : String(t.task_id).trim();
    if (rawId === '') continue;
    const key = taskKey(t);
    if (!key) continue;
    if (own.has(key) || (ambiguousKeys && ambiguousKeys.has(key))) {
      idx.set(rawId, AMBIGUOUS_PREFIX + keyDisplay(key));
      continue;
    }
    idx.set(rawId, key);
  }
  return idx;
}

/**
 * Resolve one surrogate reference through a surrogate index.
 *
 * @param {any} rawId
 * @param {Map<string,string>} surrogateIndex
 * @returns {{ key: string, resolved: boolean, ambiguous: boolean, display: string }}
 */
function resolveSurrogate(rawId, surrogateIndex) {
  const raw = rawId == null ? '' : String(rawId).trim();
  if (raw === '') return { key: '', resolved: false, ambiguous: false, display: '' };
  const key = surrogateIndex.get(raw);
  if (key) {
    const ambiguous = key.startsWith(AMBIGUOUS_PREFIX);
    return { key, resolved: !ambiguous, ambiguous, display: keyDisplay(key) };
  }
  return { key: UNRESOLVED_PREFIX + raw, resolved: false, ambiguous: false, display: raw };
}

/**
 * Normalise a relationship lag so that '0', '0.0' and '0.00' are one value and
 * not three.
 *
 * A blank or absent `lag_hr_cnt` is read as zero: P6 defines an unstated lag as
 * no lag, and treating blank as its own value would report a lag change every
 * time one export omits the column. The substitution is NOT silent — every row
 * it applies to is counted in `lagMissing` by indexRelsByCode() so the caller
 * can put it on the face of the output.
 *
 * @param {any} raw
 * @returns {{ lag: string, hr: number|null, missing: boolean }}
 */
export function normalizeLag(raw) {
  const s = raw == null ? '' : String(raw).trim();
  if (s === '') return { lag: '0', hr: 0, missing: true };
  const n = Number(s);
  if (Number.isFinite(n)) return { lag: String(n), hr: n, missing: false };
  // Unparseable text: keep it verbatim rather than pretending it is zero.
  return { lag: s, hr: null, missing: false };
}

/**
 * Resolve both endpoints of a relationship row through its own model's TASK
 * table and build the stable composite key.
 *
 * @param {object} rel - a TASKPRED / REL row
 * @param {Map<string,string>} surrogateIndex - from buildSurrogateKeyIndex(sameModel)
 * @returns {{
 *   key: string|null, pairKey: string|null,
 *   predKey: string, succKey: string,
 *   predCode: string, succCode: string, type: string,
 *   lag: string, lagHr: number|null, lagMissing: boolean,
 *   resolved: boolean, ambiguous: boolean, malformed: boolean
 * }}
 *   `key` includes the lag and is what added/deleted/retained is decided on.
 *   `pairKey` omits the lag, so the same link re-lagged can be named as a lag
 *   change instead of an unrelated addition plus an unrelated deletion.
 *   Both are null only when the row names no endpoint at all (malformed).
 */
export function resolveRelEndpoints(rel, surrogateIndex) {
  const succRaw = getFirstField(rel, ['task_id', 'succ_task_id']);
  const predRaw = getFirstField(rel, ['pred_task_id']);
  const type = getFirstField(rel, ['pred_type', 'rel_type']) || 'PR_FS';
  const { lag, hr, missing } = normalizeLag(getFirstField(rel, ['lag_hr_cnt', 'lag_hr', 'lag']));

  const malformed = (succRaw === '' || succRaw == null) || (predRaw === '' || predRaw == null);

  const pred = resolveSurrogate(predRaw, surrogateIndex);
  const succ = resolveSurrogate(succRaw, surrogateIndex);

  const pairKey = malformed ? null : `${pred.key}::${succ.key}::${type}`;

  return {
    key: pairKey === null ? null : `${pairKey}::lag=${lag}`,
    pairKey,
    predKey: pred.key,
    succKey: succ.key,
    predCode: pred.display,
    succCode: succ.display,
    type,
    lag,
    lagHr: hr,
    lagMissing: missing,
    resolved: pred.resolved && succ.resolved,
    ambiguous: pred.ambiguous || succ.ambiguous,
    malformed
  };
}

/**
 * Index a model's relationships by stable endpoint-code key, lag included.
 *
 * Nothing is dropped. Rows whose endpoints resolve are keyed on Activity
 * codes and will match across exports; rows that do not resolve are keyed on
 * the raw surrogate and counted in `unresolved`; rows naming no endpoint at
 * all are counted in `malformed`; a second row with an identical
 * pred/succ/type/lag is counted in `duplicates` and kept in `duplicateRows`;
 * rows touching an AMBIGUOUS activity are counted in `ambiguous` and kept out
 * of the index entirely, because a link whose endpoint could be either of two
 * activities cannot be called added, deleted or retained without guessing.
 *
 * Callers MUST surface those counts. They reconcile:
 * index.size + malformed + duplicates + ambiguous === total.
 *
 * `byPair` groups the indexed rows by pred/succ/type with the lag stripped, so
 * diffModels can tell "this link was re-lagged" from "this link is new".
 *
 * @param {object|null} model
 * @param {Set<string>|null} [ambiguousKeys] - from resolveComparisonAmbiguity().keys
 * @returns {{
 *   index: Map<string, object>,
 *   byPair: Map<string, Map<string, object>>,
 *   meta: Map<object, object>,
 *   unresolved: number,
 *   malformed: number,
 *   ambiguous: number,
 *   ambiguousRows: object[],
 *   duplicates: number,
 *   duplicateRows: object[],
 *   lagMissing: number,
 *   total: number
 * }}
 */
export function indexRelsByCode(model, ambiguousKeys = null) {
  const surrogateIndex = buildSurrogateKeyIndex(model, ambiguousKeys);
  const index = new Map();
  const byPair = new Map();
  const meta = new Map();
  const duplicateRows = [];
  const ambiguousRows = [];
  let unresolved = 0;
  let malformed = 0;
  let lagMissing = 0;
  let total = 0;

  for (const r of getTableAliased(model, 'REL')) {
    total++;
    const info = resolveRelEndpoints(r, surrogateIndex);
    meta.set(r, info);
    if (info.lagMissing) lagMissing++;
    if (info.malformed) {
      malformed++;
      continue; // no endpoint pair exists to key on; counted, never hidden
    }
    if (info.ambiguous) {
      ambiguousRows.push(r);
      continue; // counted below, and disclosed; never guessed at
    }
    if (!info.resolved) unresolved++;
    if (index.has(info.key)) {
      // First row keeps the slot; the repeat is recorded, never overwritten.
      duplicateRows.push(r);
      continue;
    }
    index.set(info.key, r);

    let lagsForPair = byPair.get(info.pairKey);
    if (!lagsForPair) { lagsForPair = new Map(); byPair.set(info.pairKey, lagsForPair); }
    if (!lagsForPair.has(info.lag)) lagsForPair.set(info.lag, r);
  }

  return {
    index, byPair, meta,
    unresolved, malformed,
    ambiguous: ambiguousRows.length, ambiguousRows,
    duplicates: duplicateRows.length, duplicateRows,
    lagMissing, total
  };
}

/**
 * Re-key a task_id-keyed derived map onto stable keys.
 *
 * `buildActivityCodeMap()` in the parser is keyed by the surrogate task_id
 * (it joins TASKACTV.task_id). Unioning A's and B's keys straight out of that
 * function compares two incompatible ID spaces, so every activity reads as
 * changed. Run it through here first.
 *
 * @param {Record<string, any>} byTaskId - surrogate-keyed map from the parser
 * @param {object|null} model - the model that map was built from
 * @param {Set<string>|null} [ambiguousKeys] - from resolveComparisonAmbiguity().keys
 * @returns {{ map: Map<string, any>, unresolved: number, ambiguous: number }}
 *   `unresolved` counts entries whose task_id has no TASK row in this model.
 *   `ambiguous` counts entries whose activity carries a repeated Activity ID;
 *   they are kept under an ambiguous key so they cannot match across files, and
 *   the count is surfaced rather than the assignments being lost quietly.
 */
export function remapBySurrogate(byTaskId, model, ambiguousKeys = null) {
  const surrogateIndex = buildSurrogateKeyIndex(model, ambiguousKeys);
  const map = new Map();
  let unresolved = 0;
  let ambiguous = 0;
  for (const [rawId, value] of Object.entries(byTaskId || {})) {
    const raw = String(rawId).trim();
    if (raw === '') continue;
    const resolvedKey = surrogateIndex.get(raw);
    let key;
    if (resolvedKey && resolvedKey.startsWith(AMBIGUOUS_PREFIX)) {
      ambiguous++;
      // Keyed per task_id so two ambiguous activities cannot displace each
      // other; the prefix keeps it out of any cross-file match.
      key = `${AMBIGUOUS_PREFIX}${raw}::${keyDisplay(resolvedKey)}`;
    } else if (resolvedKey) {
      key = resolvedKey;
    } else {
      unresolved++;
      key = UNRESOLVED_PREFIX + raw;
    }
    map.set(key, value);
  }
  return { map, unresolved, ambiguous };
}
