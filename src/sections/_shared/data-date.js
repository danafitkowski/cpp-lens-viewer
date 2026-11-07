import { getTable } from '@criticalpathpartners/lens-parser';

/**
 * ONE place that decides a file's data date (2026-11-07).
 *
 * Every section used to read the FIRST PROJECT row's raw last_recalc_date on
 * its own. CPP's DCMA definition (tests/fixtures/dcma_parity/
 * DCMA_DEFINITION.md) reads it as P6 does, and DCMA Lite followed that while
 * the rest of the viewer did not, so on a file with a blank data date, or one
 * before its planned start, the "Input file finding" card and DCMA check 9
 * named different dates on the same page. The rule now lives here and every
 * section asks here:
 *
 *   D0   A file with several PROJECT rows is read on one: the only row; else
 *        the latest last_recalc_date, ties broken by the most TASK rows, then
 *        file order.
 *   D14  The data date is that project's last_recalc_date. Blank, it is the
 *        project's planned start (plan_start_date); on a DAY before a later
 *        planned start, it is lifted to the planned start. Both are what P6
 *        does when it opens the project, and the page says so.
 *
 * A run over 581 real files found three with a blank data date and one filed
 * months before its planned start.
 */

function norm(v) {
  return v == null ? '' : String(v).trim();
}

/** 'YYYY-MM-DD' from a raw XER date cell, or '' when the cell holds no date. */
export function dayOf(raw) {
  const s = raw == null ? '' : String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

/** 'YYYY-MM-DD HH:MM' from a raw XER date cell (a date with no time is 00:00), or ''. */
export function instantOf(raw) {
  const x = norm(raw).replace('T', ' ');
  if (!dayOf(x)) return '';
  return x.length >= 16 ? x.slice(0, 16) : `${x.slice(0, 10)} 00:00`;
}

/** proj_id -> number of TASK rows carrying it. */
export function taskCountsByProject(model) {
  const counts = new Map();
  for (const t of getTable(model, 'TASK')) {
    const pid = norm(t.proj_id);
    counts.set(pid, (counts.get(pid) || 0) + 1);
  }
  return counts;
}

/**
 * The best of some PROJECT rows by D0: the latest last_recalc_date, ties
 * broken by the most TASK rows, then file order. DCMA Lite's baseline
 * project choice (D9) breaks its ties with this too.
 *
 * @param {Array<{p: object, i: number}>} candidates  rows with their file position
 * @param {Map<string, number>} counts  proj_id -> TASK rows
 * @returns {{p: object, i: number}|null}
 */
export function bestProject(candidates, counts) {
  const stamp = p => (dayOf(p.last_recalc_date) ? norm(p.last_recalc_date) : '');
  let best = null;
  for (const c of candidates) {
    if (!best) { best = c; continue; }
    const sa = stamp(c.p), sb = stamp(best.p);
    const na = counts.get(norm(c.p.proj_id)) || 0, nb = counts.get(norm(best.p.proj_id)) || 0;
    if (sa > sb || (sa === sb && na > nb)) best = c;
  }
  return best;
}

/**
 * D0. Which project of a file is read.
 *
 * @param {object|null} model
 * @returns {{ project: object, position: number, total: number }|null}
 *   null when the file carries no PROJECT row.
 */
export function selectScoredProject(model) {
  const projects = getTable(model, 'PROJECT');
  if (projects.length === 0) return null;
  const best = bestProject(projects.map((p, i) => ({ p, i })), taskCountsByProject(model));
  return { project: best.p, position: best.i + 1, total: projects.length };
}

/**
 * D0. The model cut down to one project: its PROJECT row, its TASK rows, the
 * relationships with both ends in those tasks and the assignments on them.
 * Every other table (calendars included) is left whole. A file with one
 * PROJECT row (or none) is returned as it is, whatever project ID its
 * activities carry. DCMA Lite scores this, and the input-file finding counts it.
 *
 * @param {object|null} model
 * @param {object|null} project  a PROJECT row of the model
 * @param {number} total         how many PROJECT rows the model holds
 * @returns {object|null}
 */
/**
 * The model cut to the project D0 scores: what a section counts must come
 * from the same project its data date comes from (review of 7-Nov-26: EVM on
 * a two-project file read the chosen project's data date against both
 * projects' activities, SPI 0.14 instead of 1.00). A single-project file is
 * returned whole.
 */
export function scopedModel(model) {
  const sel = selectScoredProject(model);
  return scopeToProject(model, sel && sel.project, sel ? sel.total : 0);
}

export function scopeToProject(model, project, total) {
  if (!model || !project || total <= 1) return model;
  const pid = norm(project.proj_id);
  const tables = { ...model.tables };
  const cut = (name, keep) => {
    if (tables[name]) tables[name] = { ...tables[name], records: (tables[name].records || []).filter(keep) };
  };
  cut('PROJECT', p => p === project);
  cut('TASK', t => norm(t.proj_id) === pid);
  const ids = new Set(getTable({ tables }, 'TASK').map(t => norm(t.task_id)));
  cut('TASKPRED', r => ids.has(norm(r.task_id)) && ids.has(norm(r.pred_task_id)));
  cut('TASKRSRC', r => ids.has(norm(r.task_id)));
  return { ...model, tables };
}

/**
 * D0 in one call: the project read and the model cut down to it.
 *
 * @param {object|null} model
 * @returns {{ model: object|null, selection: { project: object, position: number, total: number }|null }}
 */
export function scopedToScoredProject(model) {
  const selection = selectScoredProject(model);
  return { model: scopeToProject(model, selection && selection.project, selection ? selection.total : 0), selection };
}

/**
 * D14 applied to one PROJECT row.
 *
 * @param {object|null|undefined} project
 * @returns {{ instant: string, day: string, project: object|null,
 *             disclosure: { filed: string, from: 'plan_start_date' }|null }}
 *   `instant` is 'YYYY-MM-DD HH:MM' and `day` 'YYYY-MM-DD', both '' when the
 *   project states neither a data date nor a planned start. `disclosure` is
 *   null when the filed data date is used; otherwise the date is the planned
 *   start and `filed` is the filed data date ('' when it was blank).
 */
export function dataDateOfProject(project) {
  const filed = instantOf(project && project.last_recalc_date);
  const planned = instantOf(project && project.plan_start_date);
  const at = (instant, disclosure) => ({ instant, day: instant.slice(0, 10), project: project || null, disclosure });
  if (!filed) return planned ? at(planned, { filed: '', from: 'plan_start_date' }) : at('', null);
  if (planned && filed.slice(0, 10) < planned.slice(0, 10)) return at(planned, { filed, from: 'plan_start_date' });
  return at(filed, null);
}

/**
 * The data date of a file: D0 picks the project, D14 reads its date.
 *
 * @param {object|null} model
 * @returns {{ instant: string, day: string, project: object|null,
 *             disclosure: { filed: string, from: 'plan_start_date' }|null }}
 */
export function resolveDataDate(model) {
  const sel = selectScoredProject(model);
  return dataDateOfProject(sel ? sel.project : null);
}

/**
 * The disclosure in plain words, the same wherever it is printed (DCMA check
 * 9, the input-file card), or '' when the filed data date is used. Starts in
 * lower case, so a caller can put it after a semicolon or capitalise it.
 *
 * @param {{ day: string, disclosure: object|null }} dd  from resolveDataDate()
 * @returns {string}
 */
export function dataDateDisclosure(dd) {
  if (!dd || !dd.disclosure) return '';
  return dd.disclosure.filed
    ? `the file's data date, ${dd.disclosure.filed.slice(0, 10)}, is before the project's planned start, ${dd.day}, so the planned start is used, as P6 does`
    : `the file states no data date, so the project's planned start, ${dd.day}, is used, as P6 does`;
}

/**
 * Where the date on a "Data date" tile came from, short enough for its caption.
 *
 * @param {{ disclosure: object|null }} dd  from resolveDataDate()
 * @returns {string}
 */
export function dataDateSource(dd) {
  if (!dd || !dd.day) return 'the file states no data date or planned start';
  if (!dd.disclosure) return 'last_recalc_date';
  return dd.disclosure.filed
    ? `planned start: the data date in the file, ${dd.disclosure.filed.slice(0, 10)}, is earlier`
    : 'planned start: the file states no data date';
}
