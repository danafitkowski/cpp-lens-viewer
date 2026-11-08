import { h } from '../lib/dom.js';
import { getTable, getTableAliased } from '@criticalpathpartners/lens-parser';
import { dataTable } from './_shared/data-table.js';
import { workingDayContext, disclosureCards, HOUR_FIELDS } from './_shared/working-days.js';
import { actualsAfter, inputQualityCards } from './_shared/input-quality.js';
// The data date and the D0 project choice live in one shared module (2026-11-07),
// so every section names the same date this screen scores against.
import {
  dayOf, instantOf, bestProject, taskCountsByProject, selectScoredProject, scopeToProject, dataDateOfProject,
  dataDateDisclosure
} from './_shared/data-date.js';

export { selectScoredProject };

// ONE DEFINITION (2026-11-07, DCMA phase 2). CPP's three DCMA engines (the
// validator, the health dashboard and this screen) measure the fourteen checks
// exactly as tests/fixtures/dcma_parity/DCMA_DEFINITION.md writes them, a
// byte-for-byte copy of CPP's shared definition. tests/sections/
// dcma-parity.test.js holds this screen to the results worked out by hand from
// that text on twenty-one synthetic schedules. "D0" to "D11" below are the
// definition's common rules.
//
// D1. Ordinary activities are every type but milestones, level of effort and
// WBS summary. Level of effort and WBS summary are never counted, and nor is a
// relationship with either end on one.
const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);
const MILESTONES = new Set(['TT_Mile', 'TT_FinMile']);
// D1: a milestone type, or an activity whose original duration is zero.
function isMilestoneLike(t) {
  if (MILESTONES.has(t.task_type)) return true;
  const raw = String(t.target_drtn_hr_cnt ?? '').trim();
  return raw !== '' && Number(raw) === 0;
}
// D2. Complete means TK_Complete; everything else is incomplete.
const COMPLETE = 'TK_Complete';
// DCMA-EA PAM 200.1 s4.5 lists four hard types: Must Start On, Must Finish On,
// Start No Later Than and Finish No Later Than. In P6 the last two are Start On
// or Before (CS_MSOB) and Finish On or Before (CS_MEOB); P6's Mandatory Start
// and Mandatory Finish are hard as well. Until 2026-11-07 the On or Before
// types were left out and only the primary constraint was read.
const HARD_CONSTRAINTS = new Set(['CS_MSO', 'CS_MEO', 'CS_MANDSTART', 'CS_MANDFIN', 'CS_MSOB', 'CS_MEOB']);
const HARD_CONSTRAINTS_NAME = 'Hard Constraints (Mandatory, Start / Finish On, Start / Finish On or Before)';
const MANDATORY = { CS_MANDSTART: 'Mandatory Start', CS_MANDFIN: 'Mandatory Finish' };
// #10. Assignment fields that make an activity resourced: hours or cost above 0.
const RESOURCE_FIELDS = ['target_qty', 'remain_qty', 'target_cost', 'remain_cost'];

/** Share of the due baseline activities that must match the current file before #11 is scored. */
const MIN_BASELINE_MATCH = 0.8;

/** DCMA-14 thresholds in WORKING DAYS on the activity's own calendar. */
const HIGH_FLOAT_WD    = 44;
const HIGH_DURATION_WD = 44;
const LONG_LAG_WD      = 44;   // #3: listed for information, decides nothing
const MIN_RESOURCE_WD  = 1;    // #10: shorter activities are left out

/** Status of a row this view does not score. Never PASS, never FAIL. */
export const NOT_SCORED = 'NOT SCORED';

// Every result is PASS, FAIL or NOT SCORED (2026-11-07, DCMA phase 2). The
// amber middle band this page used to print between PASS and FAIL was never
// in DCMA's pamphlet, and it is gone: a check passes its threshold or it
// does not.
const BADGE_COLORS = {
  PASS:   { bg: '#15803D', text: '#ffffff' },
  FAIL:   { bg: '#C8392F', text: '#ffffff' },
  [NOT_SCORED]: { bg: '#5A6675', text: '#ffffff' }
};

function norm(v) {
  return v == null ? '' : String(v).trim();
}

/** True when a raw XER cell holds a number (a blank or non-numeric cell does not). */
function isNumeric(raw) {
  return raw != null && String(raw).trim() !== '' && Number.isFinite(parseFloat(raw));
}

/** D8. The Activity ID as matched across files: task_code, spaces trimmed, case ignored. */
function activityKey(t) {
  return norm(t && t.task_code).toLowerCase();
}

function keyCounts(model) {
  const counts = new Map();
  for (const t of getTable(model, 'TASK')) {
    const k = activityKey(t);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

function num(n) {
  return n.toLocaleString();
}

function projectName(p) {
  if (!p) return '';
  return norm(p.proj_short_name) || `project ${norm(p.proj_id)}`;
}

/**
 * D9. The baseline project #8 and #11 read. A baseline file with one project
 * is read on it. With several: the one with the same proj_id as the scored
 * project, else the same proj_short_name, else the one sharing the most
 * Activity IDs with it (ties by the D0 rule). With none of those, the baseline
 * is not used: `project` is null and `unmatched` is true. Until 2026-11-07 the
 * last resort was "the latest data date", which compared the scored project
 * with a baseline of some other project.
 *
 * @returns {{ project: object|null, total: number, basis: string|null, unmatched: boolean }|null}
 *   null when the baseline file carries no PROJECT row (it is read whole).
 */
function selectBaselineProject(B, scoredProject, scopedA) {
  const projects = getTable(B, 'PROJECT');
  if (projects.length === 0) return null;
  const counts = taskCountsByProject(B);
  const all = projects.map((p, i) => ({ p, i }));
  // D9: an Activity ID is shared when an ordinary activity or milestone
  // carries it in both files; a level of effort or WBS summary row does not
  // count, as in the validator (Claude AI review of 7-Nov-26, round 2).
  const isWork = t => !LOE_WBS.has(String(t.task_type || '').trim());
  const keys = new Set(getTable(scopedA, 'TASK').filter(isWork).map(activityKey).filter(Boolean));
  const shared = new Map();   // proj_id -> Set of shared Activity IDs
  const sharedAll = new Set();
  for (const t of getTable(B, 'TASK')) {
    if (!isWork(t)) continue;
    const k = activityKey(t);
    if (!k || !keys.has(k)) continue;
    sharedAll.add(k);
    const pid = norm(t.proj_id);
    if (!shared.has(pid)) shared.set(pid, new Set());
    shared.get(pid).add(k);
  }
  const size = c => (shared.get(norm(c.p.proj_id)) || new Set()).size;
  // Whatever chose it, a baseline project that shares no Activity ID with the
  // scored project is not used (D9; review of 7-Nov-26).
  const pick = (cands, basis) => {
    const best = bestProject(cands, counts);
    const n = projects.length === 1 ? sharedAll.size : size(best);
    return n > 0 ? { project: best.p, total: projects.length, basis, unmatched: false }
                 : { project: null, total: projects.length, basis: null, unmatched: true };
  };
  if (projects.length === 1) return pick(all, 'the only project');
  const id = scoredProject ? norm(scoredProject.proj_id) : '';
  const byId = id === '' ? [] : all.filter(c => norm(c.p.proj_id) === id);
  if (byId.length > 0) return pick(byId, 'the same project ID');
  const name = scoredProject ? norm(scoredProject.proj_short_name) : '';
  const byName = name === '' ? [] : all.filter(c => norm(c.p.proj_short_name) === name);
  if (byName.length > 0) return pick(byName, 'the same project short name');
  const most = Math.max(0, ...all.map(size));
  if (most > 0) return pick(all.filter(c => size(c) === most), 'the most Activity IDs shared with the scored project');
  return { project: null, total: projects.length, basis: null, unmatched: true };
}

function pct(n, d) {
  if (d === 0) return 0;
  return (n / d) * 100;
}

function fmtPct(val) {
  return `${val.toFixed(1)}%`;
}

/** D7. A percentage threshold is tested on the counts, never on a rounded percentage. */
function atMostPct(n, d, limit) {
  return n * 100 <= limit * d;
}
function atLeastPct(n, d, limit) {
  return n * 100 >= limit * d;
}

/**
 * A row this view does not score. It says so, with the reason, in the result
 * cell. It is never stamped PASS: a check that was not run has not passed.
 */
function notScored(name, reason, target) {
  return { name, result: `Not scored here: ${reason}`, count: '', target, status: NOT_SCORED, num: null, den: null };
}

/** A scored row: PASS or FAIL, with its numerator and denominator as numbers. */
function scored(name, result, count, target, pass, n, d) {
  return { name, result, count, target, status: pass ? 'PASS' : 'FAIL', num: n, den: d };
}

/**
 * One loop in the logic, or null. Tarjan's strongly connected components,
 * iterative so a long chain cannot overflow the stack; returns the activities
 * of the first loop found (a relationship from an activity to itself is one).
 *
 * @param {Array<{pred: object, succ: object}>} links
 * @returns {object[]|null}
 */
function findLoop(links) {
  const out = new Map();
  for (const { pred, succ } of links) {
    if (pred === succ) return [pred];
    if (!out.has(pred)) out.set(pred, []);
    out.get(pred).push(succ);
  }
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  let next = 0;
  const visit = (v) => {
    index.set(v, next); low.set(v, next); next++;
    stack.push(v); onStack.add(v);
  };
  for (const root of out.keys()) {
    if (index.has(root)) continue;
    visit(root);
    const work = [[root, 0]];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const v = frame[0];
      const succs = out.get(v) || [];
      if (frame[1] < succs.length) {
        const w = succs[frame[1]++];
        if (!index.has(w)) { visit(w); work.push([w, 0]); }
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const u = work[work.length - 1][0];
        low.set(u, Math.min(low.get(u), low.get(v)));
      }
      if (low.get(v) === index.get(v)) {
        const component = [];
        let w;
        do { w = stack.pop(); onStack.delete(w); component.push(w); } while (w !== v);
        if (component.length > 1) return component.reverse();
      }
    }
  }
  return null;
}

function activityList(rows, max = 5) {
  const ids = rows.map(t => norm(t.task_code) || norm(t.task_id));
  if (ids.length <= max) return ids.length === 1 ? ids[0] : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
  return `${ids.slice(0, max).join(', ')} and ${num(ids.length - max)} more`;
}

/**
 * The fourteen rows. Exported so the Executive Dashboard banner reads the same
 * results this page prints instead of forming a second opinion.
 *
 * Each row carries name, result, count, target and status, and `num` / `den`:
 * the numerator and denominator the status was decided on (null when the row
 * is not scored, and on the Critical Path Test, which has no counts). What
 * they count is the definition's: for #4 the Finish-to-Start relationships,
 * for #10 the resourced activities, otherwise the findings.
 *
 * @param {object} file          current schedule
 * @param {object|null} baselineFile  baseline schedule, or null. #8 and #11 read it.
 */
export function computeMetrics(file, baselineFile = null) {
  // ONE PROJECT (D0, 2026-11-07). Everything below reads the scored project
  // only: its activities, relationships with both ends in them, their
  // assignments, and its own data date.
  const selection = selectScoredProject(file);
  const multi = !!selection && selection.total > 1;
  const A = scopeToProject(file, selection && selection.project, selection ? selection.total : 0);
  const B = baselineFile;
  const allTasks = getTable(A, 'TASK');
  const rels     = getTableAliased(A, 'REL');
  const rsrc     = getTable(A, 'TASKRSRC');
  // Hours become working days in exactly one module — see _shared/working-days.js.
  const cal      = workingDayContext(A);
  // D14. A blank data date is the planned start; one on a day before a later
  // planned start is lifted to it. #9 and #11 compare with this one.
  const dd       = dataDateOfProject(selection && selection.project);
  const dataDate = dd.day;
  const dataDateNote = dd.disclosure ? `; ${dataDateDisclosure(dd)}` : '';
  const isDone   = t => t.status_code === COMPLETE;

  // THE POPULATIONS. The published DCMA percentages are measured over
  // INCOMPLETE ordinary activities: not milestones, not level of effort, not
  // WBS summary, and not finished work. This view used to divide by every
  // activity, so finished work and milestones diluted each result. Measured on
  // the public demonstration file: High Float read 152 of 404 = 37.6% where
  // the full assessment, on this population, reads 152 of 287 = 53.0%.
  // #1 adds incomplete milestones, and #9 counts milestones and finished work.
  const counted   = allTasks.filter(t => !LOE_WBS.has(t.task_type));   // ordinary + milestones
  // D1: an activity whose original duration is zero carries no work and is a
  // milestone for the DCMA populations, as the pamphlet reads it (review of
  // 7-Nov-26). A blank duration is not zero.
  const normal    = counted.filter(t => !isMilestoneLike(t));
  const tasks     = normal.filter(t => !isDone(t));
  const openWork  = counted.filter(t => !isDone(t));                    // incomplete ordinary + milestones
  const openMilestones = openWork.filter(t => isMilestoneLike(t));
  const n = tasks.length;
  const ofTasks = (count) => `${num(count)} of ${num(n)} incomplete activities`;
  // A percentage over nothing is not a pass. Say so instead of printing 0.0%.
  const noTasks = n === 0 ? 'the file has no incomplete activities to measure' : null;

  // D4. LOGIC RELATIONSHIPS: both ends in the scored project, neither end level
  // of effort or WBS summary. LIVE relationships: logic relationships whose
  // successor is not finished. A relationship between finished activities is
  // history and is not graded (CPP reading).
  const byTaskId = new Map(allTasks.map(t => [norm(t.task_id), t]));
  const logicRels = [];
  for (const r of rels) {
    const pred = byTaskId.get(norm(r.pred_task_id));
    const succ = byTaskId.get(norm(r.task_id));
    if (!pred || !succ || LOE_WBS.has(pred.task_type) || LOE_WBS.has(succ.task_type)) continue;
    logicRels.push({ r, pred, succ });
  }
  const liveRels = logicRels.filter(x => !isDone(x.succ));
  const nLive = liveRels.length;
  const historicRels = logicRels.length - nLive;

  // 1. Logic. An incomplete activity or milestone with no logic relationship in
  // (no predecessor) or out (no successor). Until 2026-11-07 this counted the
  // share WITH both, over ordinary activities only, and any relationship
  // counted, so a link to a level of effort hid an open end and a milestone
  // dangling in mid-network was never looked at.
  //
  // D10. The network starts at the earliest start (actual, else early, else
  // planned) of any ordinary or milestone activity, finished work included, and
  // finishes at the latest finish of the incomplete ones. A start milestone
  // with no predecessor at or before that start, and a finish milestone with no
  // successor at or after that finish, are the ends of the network, not open
  // ends.
  const startOf  = t => instantOf(t.act_start_date) || instantOf(t.early_start_date) || instantOf(t.target_start_date);
  const finishOf = t => instantOf(t.act_end_date) || instantOf(t.early_end_date) || instantOf(t.target_end_date);
  let networkStart = '';
  let networkFinish = '';
  for (const t of counted) {
    const s = startOf(t);
    if (s && (!networkStart || s < networkStart)) networkStart = s;
  }
  for (const t of openWork) {
    const f = finishOf(t);
    if (f > networkFinish) networkFinish = f;
  }
  const hasPred = new Set();
  const hasSucc = new Set();
  for (const { pred, succ } of logicRels) { hasSucc.add(pred); hasPred.add(succ); }
  // D4: a link to another project is logic for #1 (P6 schedules it), so an
  // activity whose only predecessor or successor is in another project is not
  // an open end (review of 7-Nov-26, round 2). Read from the whole file: a
  // relationship with one end in the scored project and the other outside it
  // (not a level of effort or WBS summary where the file holds it), or P6's
  // external dates on the activity. Not graded by #2 to #4.
  const extPred = new Set();
  const extSucc = new Set();
  {
    const scopedIds = new Set(allTasks.map(t => norm(t.task_id)));
    const fileById = new Map(getTable(file, 'TASK').map(t => [norm(t.task_id), t]));
    const logicEnd = t => !t || !LOE_WBS.has(t.task_type);
    for (const r of getTableAliased(file, 'REL')) {
      const s = norm(r.task_id), q = norm(r.pred_task_id);
      const inS = scopedIds.has(s), inP = scopedIds.has(q);
      if (inS && !inP && logicEnd(fileById.get(q))) extPred.add(s);
      if (inP && !inS && logicEnd(fileById.get(s))) extSucc.add(q);
    }
    for (const t of allTasks) {
      if (String(t.external_early_start_date ?? '').trim()) extPred.add(norm(t.task_id));
      if (String(t.external_late_end_date ?? '').trim()) extSucc.add(norm(t.task_id));
    }
  }
  let noPred = 0, noSucc = 0, openEnds = 0, networkEnds = 0, externalOnly = 0;
  for (const t of openWork) {
    const id = norm(t.task_id);
    if ((!hasPred.has(t) && extPred.has(id)) || (!hasSucc.has(t) && extSucc.has(id))) externalOnly++;
    let missingPred = !hasPred.has(t) && !extPred.has(id);
    let missingSucc = !hasSucc.has(t) && !extSucc.has(id);
    if (missingPred && t.task_type === 'TT_Mile' && networkStart && startOf(t) && startOf(t) <= networkStart) {
      missingPred = false; networkEnds++;
    }
    if (missingSucc && t.task_type === 'TT_FinMile' && networkFinish && finishOf(t) >= networkFinish) {
      missingSucc = false; networkEnds++;
    }
    if (missingPred) noPred++;
    if (missingSucc) noSucc++;
    if (missingPred || missingSucc) openEnds++;
  }
  const M1 = 'Logic (missing a predecessor or successor)';
  const metric1 = openWork.length === 0
    ? notScored(M1, 'the file has no incomplete activities or milestones to measure', '≤ 5%')
    : scored(M1, fmtPct(pct(openEnds, openWork.length)),
        `${num(openEnds)} of ${num(openWork.length)} incomplete activities and milestones: ` +
        `${num(noPred)} with no predecessor, ${num(noSucc)} with no successor` +
        (networkEnds > 0 ? '; the start and finish milestones at the ends of the network are not counted as open ends' : '') +
        (externalOnly > 0 ? `; ${num(externalOnly)} linked only to another project on one side, and that link counts` : ''),
        '≤ 5%', atMostPct(openEnds, openWork.length, 5), openEnds, openWork.length);

  // 2 to 4. Relationship checks, over the relationships into unfinished work
  // (2026-11-07). They used to grade every TASKPRED row, so a lead between two
  // finished activities failed Leads, and links to level of effort counted.
  const noLive = nLive > 0 ? null
    : logicRels.length === 0 ? 'the file has no relationships to measure'
    : 'every relationship ends on finished work, so there is none into unfinished work to grade';
  const ofRels = (count) => `${num(count)} of ${num(nLive)} relationships into unfinished work` +
    (historicRels > 0 ? `; ${num(historicRels)} more end on finished work and are not graded` : '');

  // 2. Leads — lag below 0 (target none)
  const leadsCount = liveRels.filter(x => parseFloat(x.r.lag_hr_cnt) < 0).length;
  const metric2 = noLive ? notScored('Leads (negative lag)', noLive, '0')
    : scored('Leads (negative lag)', String(leadsCount), ofRels(leadsCount), '0', leadsCount === 0, leadsCount, nLive);

  // 3. Lags — lag above 0 (target ≤ 5%). A lag over 44 working days on the
  // successor's calendar is listed for information; it decides nothing.
  const lagged = liveRels.filter(x => parseFloat(x.r.lag_hr_cnt) > 0);
  const lagPositiveCount = lagged.length;
  const longLags = lagged.filter(x => {
    const wd = cal.hoursToDays(x.r.lag_hr_cnt, x.succ.clndr_id, x.succ.proj_id);
    return wd != null && wd > LONG_LAG_WD;
  }).length;
  const metric3 = noLive ? notScored('Lags (% with lag > 0)', noLive, '≤ 5%')
    : scored('Lags (% with lag > 0)', fmtPct(pct(lagPositiveCount, nLive)),
        ofRels(lagPositiveCount) +
        (longLags > 0 ? `; for information, ${num(longLags)} of the lags ${plural(longLags, 'is', 'are')} over ${LONG_LAG_WD} working days` : ''),
        '≤ 5%', atMostPct(lagPositiveCount, nLive, 5), lagPositiveCount, nLive);

  // 4. FS Relationships — share that are Finish-to-Start (target ≥ 90%)
  const fsCount = liveRels.filter(x => x.r.pred_type === 'PR_FS').length;
  const sfCount = liveRels.filter(x => x.r.pred_type === 'PR_SF').length;
  const metric4 = noLive ? notScored('FS Relationships (% PR_FS)', noLive, '≥ 90%')
    : scored('FS Relationships (% PR_FS)', fmtPct(pct(fsCount, nLive)), ofRels(fsCount) +
        // The pamphlet says Start-to-Finish should not be used: counted for information.
        (sfCount > 0 ? `; ${num(sfCount)} ${plural(sfCount, 'is', 'are')} Start-to-Finish, which DCMA says should not be used` : ''), '≥ 90%',
        atLeastPct(fsCount, nLive, 90), fsCount, nLive);

  // 5. Hard Constraints — a hard primary OR secondary constraint (target ≤ 5%).
  // A constrained milestone is not counted; it is listed for information.
  const isHard = t => HARD_CONSTRAINTS.has(t.cstr_type) || HARD_CONSTRAINTS.has(t.cstr_type2);
  const hardCount = tasks.filter(isHard).length;
  const hardMilestones = openMilestones.filter(isHard).length;
  const metric5 = noTasks ? notScored(HARD_CONSTRAINTS_NAME, noTasks, '≤ 5%')
    : scored(HARD_CONSTRAINTS_NAME, fmtPct(pct(hardCount, n)),
        ofTasks(hardCount) +
        (hardMilestones > 0 ? `; for information, ${num(hardMilestones)} incomplete ${plural(hardMilestones, 'milestone carries', 'milestones carry')} one too and ${plural(hardMilestones, 'is', 'are')} not counted` : ''),
        '≤ 5%', atMostPct(hardCount, n, 5), hardCount, n);

  // 6. High Float — > 44 WORKING DAYS on the activity's own calendar (target ≤ 5%).
  // Not "> 352 hr": 352 is 44 days only where a day is 8 hours. On the 10 hr/day
  // calendars this viewer is handed all the time it is 35.2 days, and the card
  // still said "44 wd".
  //
  // BLANK TOTAL FLOAT (2026-11-07). An activity whose total_float_hr_cnt is
  // blank or not a number has no float to test. It used to read as "not high"
  // and "not negative" and stay in the denominator, so an export that was never
  // rescheduled, with no float in it at all, read PASS on #6 and #7. It is left
  // out of both populations and the Count says how many; when no incomplete
  // activity carries a float, neither row is scored.
  const floatTasks = tasks.filter(t => isNumeric(t.total_float_hr_cnt));
  const nFloat = floatTasks.length;
  const noFloat = n - nFloat;
  const noFloatReason = noTasks || (nFloat === 0 ? 'the file carries no computed total float; recalculate in P6 and re-export' : null);
  const ofFloat = (count) => noFloat === 0 ? ofTasks(count)
    : `${num(count)} of ${num(nFloat)} incomplete activities that carry a total float; ` +
      `${num(noFloat)} more carry no total float and are left out`;
  const highFloatCount = floatTasks.filter(t => {
    const wd = cal.workingDays(t, HOUR_FIELDS.TOTAL_FLOAT);
    return wd != null && wd > HIGH_FLOAT_WD;
  }).length;
  const metric6 = noFloatReason ? notScored(`High Float (> ${HIGH_FLOAT_WD} wd)`, noFloatReason, '≤ 5%')
    : scored(`High Float (> ${HIGH_FLOAT_WD} wd)`, fmtPct(pct(highFloatCount, nFloat)), ofFloat(highFloatCount),
        '≤ 5%', atMostPct(highFloatCount, nFloat, 5), highFloatCount, nFloat);

  // 7. Negative Float — total float below 0 (target none)
  const negFloatCount = floatTasks.filter(t => parseFloat(t.total_float_hr_cnt) < 0).length;
  const metric7 = noFloatReason ? notScored('Negative Float', noFloatReason, '0%')
    : scored('Negative Float', fmtPct(pct(negFloatCount, nFloat)), ofFloat(negFloatCount),
        '0%', negFloatCount === 0, negFloatCount, nFloat);

  // THE BASELINE (D8, D9), read by #8 and #11. Activities are matched on the
  // Activity ID, spaces trimmed and case ignored. An ID that appears more than
  // once in either file matches no single activity: it is left out of #8's
  // baseline reading and of both counts of #11, and the number is given.
  const bSel = B ? selectBaselineProject(B, selection && selection.project, A) : null;
  const baselineUsable = !!B && !(bSel && bSel.unmatched);
  const Bs = baselineUsable ? (bSel ? scopeToProject(B, bSel.project, bSel.total) : B) : null;
  const baselineNote = bSel && bSel.total > 1 && bSel.project
    ? `; baseline project: ${projectName(bSel.project)} (1 of ${bSel.total} projects in the baseline file, chosen on ${bSel.basis})`
    : '';
  const unmatchedBaseline = B && !baselineUsable
    ? (bSel.total === 1
        ? 'the baseline project shares no Activity ID with the scored project, so it is not used'
        : `the baseline file holds ${num(bSel.total)} projects and none shares an Activity ID with the scored project, so it is not used`)
    : null;
  const aKeys = keyCounts(A);
  const bKeys = baselineUsable ? keyCounts(Bs) : new Map();
  const ambiguous = k => (aKeys.get(k) || 0) > 1 || (bKeys.get(k) || 0) > 1;
  const baselineByKey = new Map();
  if (baselineUsable) {
    for (const bt of getTable(Bs, 'TASK')) {
      const k = activityKey(bt);
      if (k && !ambiguous(k)) baselineByKey.set(k, bt);
    }
  }
  const bcal = baselineUsable ? workingDayContext(Bs) : null;

  // 8. High Duration — > 44 WORKING DAYS (target ≤ 5%). The duration is the
  // BASELINE's original duration of the same activity, on the baseline
  // activity's calendar, when a baseline is loaded and the activity is in it,
  // else the current original duration (2026-11-07). Splitting a long activity
  // in the current schedule does not hide that it was planned long.
  let highDurCount = 0, fromBaseline = 0, fromCurrent = 0, repeatedIds = 0, blankDur = 0;
  for (const t of tasks) {
    const k = activityKey(t);
    if (baselineUsable && k && ambiguous(k)) repeatedIds++;
    const bt = baselineUsable && k ? baselineByKey.get(k) : null;
    let wd = bt ? bcal.workingDays(bt, HOUR_FIELDS.ORIGINAL_DURATION) : null;
    if (wd != null) fromBaseline++;
    else {
      wd = cal.workingDays(t, HOUR_FIELDS.ORIGINAL_DURATION);
      // A blank duration is not zero: left out and counted (review of 7-Nov-26).
      if (wd == null || String(t.target_drtn_hr_cnt ?? '').trim() === '') { blankDur++; continue; }
      fromCurrent++;
    }
    if (wd != null && wd > HIGH_DURATION_WD) highDurCount++;
  }
  const n8 = n - blankDur;
  const blankNote = blankDur > 0 ? `; ${num(blankDur)} with no original duration ${plural(blankDur, 'is', 'are')} left out` : '';
  const durationBasis = !B ? ''
    : !baselineUsable ? `; durations read from the current file, because ${unmatchedBaseline}`
    : `; original durations read from the baseline for ${num(fromBaseline)} and from the current file for ${num(fromCurrent)}` +
      (repeatedIds > 0 ? ` (${num(repeatedIds)} of them ${plural(repeatedIds, 'has an Activity ID', 'have Activity IDs')} that ${plural(repeatedIds, 'appears', 'appear')} more than once)` : '');
  const metric8 = noTasks ? notScored(`High Duration (> ${HIGH_DURATION_WD} wd)`, noTasks, '≤ 5%')
    : n8 === 0 ? notScored(`High Duration (> ${HIGH_DURATION_WD} wd)`, 'none of the incomplete activities carries an original duration', '≤ 5%')
    : scored(`High Duration (> ${HIGH_DURATION_WD} wd)`, fmtPct(pct(highDurCount, n8)),
        `${num(highDurCount)} of ${num(n8)} incomplete activities` + durationBasis + blankNote,
        '≤ 5%', atMostPct(highDurCount, n8, 5), highDurCount, n8);

  // 9. Invalid Dates. The published check compares dates WITH THE DATA DATE:
  // an actual date must not be after it, and a forecast (early) date of
  // incomplete work must not be before it. Until 2026-09-21 this row only
  // looked for a MISSING actual date and never compared anything with the data
  // date, so the public demonstration file read "0 PASS" with 103 ordinary
  // activities statused past its data date. It counts ACTIVITIES, not fields,
  // over ordinary activities AND milestones (2026-11-07), finished ones
  // included; dates are compared by day (see _shared/input-quality.js). The
  // missing-actual condition is kept, under its own label, in `missingActuals`.
  let actualAfterCount = 0;
  let forecastBeforeCount = 0;
  let invalidDatesCount = 0;
  for (const t of counted) {
    const actualAfter = actualsAfter(t, dataDate).any;
    let forecastBefore = false;
    if (dataDate && !isDone(t)) {
      const started = dayOf(t.act_start_date) !== '' || t.status_code === 'TK_Active';
      const earlyStart = dayOf(t.early_start_date);
      const earlyEnd   = dayOf(t.early_end_date);
      forecastBefore = (!started && earlyStart !== '' && earlyStart < dataDate) ||
                       (earlyEnd !== '' && earlyEnd < dataDate);
    }
    if (actualAfter) actualAfterCount++;
    if (forecastBefore) forecastBeforeCount++;
    if (actualAfter || forecastBefore) invalidDatesCount++;
  }
  const forecastsUnreadable = openWork.length > 0 &&
    !openWork.some(t => dayOf(t.early_start_date) !== '' || dayOf(t.early_end_date) !== '');
  const unreadableNote = forecastsUnreadable
    ? '; none of the unfinished work carries an early start or early finish, so its forecast dates cannot be read and only the actual dates are judged' : '';
  const metric9 = !dataDate ? notScored('Invalid Dates', 'the file states no data date or planned start to compare with', '0')
    : counted.length === 0 ? notScored('Invalid Dates', 'the file has no activities to measure', '0')
    : scored('Invalid Dates', String(invalidDatesCount),
        `${num(invalidDatesCount)} of ${num(counted.length)} activities, milestones included: ` +
        `${num(actualAfterCount)} with an actual date after the data date, ` +
        `${num(forecastBeforeCount)} with a forecast date before it` + unreadableNote + dataDateNote,
        '0', invalidDatesCount === 0, invalidDatesCount, counted.length);

  // Not one of the fourteen points, and not scored: a finished activity with no
  // actual finish, or an activity in progress with no actual start. This is
  // what row 9 used to count under the name "Invalid Dates".
  const missingActuals = allTasks.filter(t =>
    (t.status_code === 'TK_Complete' && !t.act_end_date) ||
    (t.status_code === 'TK_Active'   && !t.act_start_date)
  ).length;

  // 10. Resources. DCMA-EA PAM 200.1 §4.10 verifies that ALL tasks with
  // duration carry dollars or hours: the target is 100%, not a band. This
  // surface published "≥ 80%" until 2026-08-28 — a threshold the standard
  // never contained. When the scored project carries no TASKRSRC rows at all
  // the criterion is not scored, rather than a fake FAIL.
  //
  // 2026-11-07. An activity is resourced when an assignment on it carries
  // hours or cost (target or remaining quantity or cost above 0): an
  // assignment of nothing used to count. Activities shorter than one working
  // day are left out of the population.
  const carries = r => RESOURCE_FIELDS.some(f => parseFloat(r[f]) > 0);
  const resourcedIds = new Set(rsrc.filter(carries).map(r => norm(r.task_id)));
  const assignedIds  = new Set(rsrc.map(r => norm(r.task_id)));
  const rsrcPop = tasks.filter(t => {
    const wd = cal.workingDays(t, HOUR_FIELDS.ORIGINAL_DURATION);
    return wd != null && wd >= MIN_RESOURCE_WD;
  });
  const shortTasks = n - rsrcPop.length;
  const rsrcCount = rsrcPop.filter(t => resourcedIds.has(norm(t.task_id))).length;
  const emptyAssignments = rsrcPop.filter(t => !resourcedIds.has(norm(t.task_id)) && assignedIds.has(norm(t.task_id))).length;
  const M10 = 'Resources (% assigned)';
  const metric10 = rsrc.length === 0
    ? notScored(M10, `${multi ? 'the scored project' : 'the file'} carries no resource assignments (no TASKRSRC rows)`, '100%')
    : noTasks ? notScored(M10, noTasks, '100%')
    : rsrcPop.length === 0 ? notScored(M10, 'no incomplete activity is one working day or longer', '100%')
    : scored(M10, fmtPct(pct(rsrcCount, rsrcPop.length)),
        `${num(rsrcCount)} of ${num(rsrcPop.length)} incomplete activities of one working day or more carry hours or cost` +
        (emptyAssignments > 0 ? `; ${num(emptyAssignments)} more ${plural(emptyAssignments, 'has an assignment', 'have assignments')} with no hours and no cost` : '') +
        (shortTasks > 0 ? `; ${num(shortTasks)} shorter than one working day ${plural(shortTasks, 'is', 'are')} left out` : ''),
        '100%', rsrcCount === rsrcPop.length, rsrcCount, rsrcPop.length);

  // 11. Missed Tasks. DCMA-EA PAM 200.1 §4.11 is a FINISH test against the
  // BASELINE with a 5% ceiling: of the activities whose baseline finish is on
  // or before the data date, the share that did not finish on or before that
  // baseline finish, whether still open or finished late.
  //
  // Until 2026-09-21 this row read the CURRENT file's own planned finish and
  // skipped finished activities. P6 reschedules the planned dates of unstarted
  // work on every update, so almost nothing is ever "past" them, and a late
  // finish was invisible: the public demonstration pair read 0.0% PASS where
  // the full assessment finds 38 of 43. There is no baseline finish inside a
  // single XER, so without a baseline file this row is not scored. It is never
  // a PASS it did not earn.
  //
  // Who was due is decided on the BASELINE side, over its ordinary activities,
  // and matched to the current file on the Activity ID (D8).
  //
  // 2026-11-07. A due baseline activity that is NOT IN the current file is
  // deleted or renumbered scope, and it did not finish by its baseline finish:
  // it counts as missed. When fewer than 80% of the due baseline activities
  // match a current activity the baseline looks renumbered, and the row is not
  // scored. A multi-project baseline is read on one project (D9).
  const M11 = 'Missed Tasks (late against the baseline finish)';
  let metric11;
  if (!B) {
    metric11 = notScored(M11, 'needs a baseline. Load one in the Baseline schedule box', '≤ 5%');
  } else if (!dataDate) {
    metric11 = notScored(M11, 'the file states no data date or planned start to compare with', '≤ 5%');
  } else if (!baselineUsable) {
    metric11 = notScored(M11, unmatchedBaseline, '≤ 5%');
  } else {
    const current = new Map();
    for (const t of allTasks) {
      const k = activityKey(t);
      if (k && !ambiguous(k)) current.set(k, t);
    }
    const dataInstant = dd.instant;
    let due = 0, matched = 0, missed = 0, notInCurrent = 0, leftOut = 0, noActualFinish = 0;
    for (const bt of getTable(Bs, 'TASK')) {
      if (LOE_WBS.has(bt.task_type) || isMilestoneLike(bt)) continue;
      // D12. A baseline activity's finish is its planned finish, else its early finish.
      const finishInstant = instantOf(bt.target_end_date) || instantOf(bt.early_end_date);
      // DUE is decided to the minute (D5): a baseline finish later on the data
      // date itself is not yet due (data date 08:00, baseline finish 16:00).
      // Lateness is decided by the day.
      if (finishInstant === '' || finishInstant > dataInstant) continue;
      const baselineFinish = finishInstant.slice(0, 10);
      const key = activityKey(bt);
      // A blank or repeated Activity ID matches no SINGLE activity: out of both counts.
      if (!key || ambiguous(key)) { leftOut++; continue; }
      due++;
      const at = current.get(key);
      if (!at) { notInCurrent++; missed++; continue; }
      matched++;
      if (!isDone(at)) { missed++; continue; }
      const actualFinish = dayOf(at.act_end_date);
      if (actualFinish === '') noActualFinish++;
      else if (actualFinish > baselineFinish) missed++;
    }
    // A finished activity with no actual finish has unknown lateness: out of both
    // counts, as in the health dashboard and the validator (2026-11-07).
    const scoredDue = due - noActualFinish;
    const leftOutNote = leftOut > 0
      ? `; ${num(leftOut)} more ${plural(leftOut, 'was', 'were')} due but ${plural(leftOut, 'carries an Activity ID', 'carry Activity IDs')} that ${plural(leftOut, 'is', 'are')} blank or ${plural(leftOut, 'appears', 'appear')} more than once in either file, and ${plural(leftOut, 'is', 'are')} left out`
      : '';
    if (due === 0) {
      metric11 = notScored(M11, 'no baseline activity was due on or before the data date' + leftOutNote + baselineNote + dataDateNote, '≤ 5%');
    } else if (matched * 100 < Math.round(MIN_BASELINE_MATCH * 100) * due) {
      metric11 = notScored(M11,
        "the baseline's Activity IDs do not match the current file; it looks renumbered. " +
        `${num(matched)} of ${num(due)} baseline activities due on or before the data date match an activity in the current file, ` +
        `fewer than ${Math.round(MIN_BASELINE_MATCH * 100)}%` + leftOutNote + baselineNote, '≤ 5%');
    } else if (scoredDue <= 0) {
      metric11 = notScored(M11, 'every due baseline activity finished with no actual finish date, so lateness is unknown' + leftOutNote + baselineNote, '≤ 5%');
    } else {
      metric11 = scored(M11, fmtPct(pct(missed, scoredDue)),
        `${num(missed)} of ${num(scoredDue)} activities with a baseline finish on or before the data date` +
        (notInCurrent > 0 ? `; ${num(notInCurrent)} of the missed ${plural(notInCurrent, 'is', 'are')} not in the current file (deleted or renumbered)` : '') +
        (noActualFinish > 0 ? `; ${num(noActualFinish)} finished with no actual finish date, so lateness is unknown and not counted` : '') +
        leftOutNote + baselineNote + dataDateNote,
        '≤ 5%', atMostPct(missed, scoredDue, 5), missed, scoredDue);
    }
  }

  // 12. Critical Path Test. The published test adds a large delay to a critical
  // activity and checks that the project finish moves by the same amount. That
  // needs a schedule recalculation, which this viewer does not do. This row
  // used to PASS on a bare count of activities at or below zero float, with no
  // test behind it. The count is kept, as information only.
  //
  // 2026-11-07. Two answers are certain without a recalculation, and on them
  // the row FAILS: the logic runs in a loop, or the completion activity (D11)
  // is held by a Mandatory Start or Mandatory Finish, so no delay can move it.
  // A blank total float is not "zero or less": it is skipped, and said so.
  const criticalCount = floatTasks.filter(t => parseFloat(t.total_float_hr_cnt) <= 0).length;
  const criticalInfo = noFloat === 0
    ? `For information, ${ofTasks(criticalCount)} have total float of zero or less`
    : nFloat === 0
      ? 'For information, no incomplete activity carries a total float'
      : `For information, ${num(criticalCount)} of ${num(nFloat)} incomplete activities that carry a total float ` +
        `have total float of zero or less; ${num(noFloat)} more carry none`;
  // D11. The completion activity: the ordinary or milestone activity, complete
  // or not, with the latest early finish (else planned finish). On a tie: an
  // unfinished activity, then the end of the network (no logic relationship to
  // an unfinished successor leads from it), then a
  // finish milestone, then an activity of zero original duration (a completion
  // typed as a task), else the first in the file. (8-Nov-26: two finish
  // milestones on one instant, the first in the file feeding the second; file
  // order took the first, which is not the project's end.)
  // A relationship to a finished (out-of-sequence) successor does not stop an
  // activity being the end; an unfinished tied activity comes before a finished
  // one (review of the tie, 8-Nov-26).
  const withSuccessor = new Set(logicRels.filter(x => !isDone(x.succ)).map(x => x.pred));
  const tieRank = t => (isDone(t) ? 0 : 8) + (withSuccessor.has(t) ? 0 : 4) + (t.task_type === 'TT_FinMile' ? 2
    : (isNumeric(t.target_drtn_hr_cnt) && parseFloat(t.target_drtn_hr_cnt) === 0 ? 1 : 0));
  let completion = null;
  let completionFinish = '';
  for (const t of counted) {
    const f = instantOf(t.early_end_date) || instantOf(t.target_end_date);
    if (!f) continue;
    if (!completion || f > completionFinish || (f === completionFinish && tieRank(t) > tieRank(completion))) {
      completion = t;
      completionFinish = f;
    }
  }
  const pin = completion ? (MANDATORY[completion.cstr_type] || MANDATORY[completion.cstr_type2] || null) : null;
  const loop = findLoop(logicRels);
  const M12 = 'Critical Path Test';
  const metric12 = loop
    ? { name: M12, status: 'FAIL', num: null, den: null, target: 'finish moves with the delay', count: '',
        result: `Fails: the logic runs in a loop (${activityList(loop)}${loop.length === 1 ? ' is its own predecessor' : ' lead back to one another'}), ` +
          'so a delay cannot be followed through it to the finish' }
    // A finished completion has no remaining network for a delay to move, and
    // P6 does not apply a constraint to finished work (review of 7-Nov-26,
    // round 2): its pin decides nothing.
    : pin && completion.status_code === COMPLETE
      ? notScored(M12, `the completion activity ${activityList([completion])} is complete, so there is no remaining ` +
          `network for an inserted delay to move, and its ${pin} constraint no longer applies`, 'finish moves with the delay')
    : pin
      ? { name: M12, status: 'FAIL', num: null, den: null, target: 'finish moves with the delay', count: '',
          result: `Fails: the completion activity ${activityList([completion])} is held by a ${pin} constraint, ` +
            'so a delay on the way to it cannot move the finish' }
      : notScored(M12, 'the test adds a delay and recalculates the schedule, and this viewer does not recalculate. ' +
          criticalInfo, 'finish moves with the delay');

  // 13 & 14. Never calculated here. They used to show a dash under a heading
  // that claimed all fourteen points.
  const metric13 = notScored('CPLI', 'it needs the critical path length in working days, which this viewer does not calculate', '≥ 0.95');
  const metric14 = notScored('BEI', 'this view does not calculate it. The analyst-delivered Schedule Health Assessment does, from a baseline', '≥ 0.95');

  // Metrics 6 and 8 are working-day thresholds, so the divisor they were applied
  // at — and any activity whose divisor was a fallback rather than a number read
  // off the file — travels with them to the page.
  const disclosure = cal.disclose(tasks);

  return {
    metrics: [metric1, metric2, metric3, metric4, metric5, metric6, metric7,
              metric8, metric9, metric10, metric11, metric12, metric13, metric14],
    disclosure,
    incompleteCount: n,
    openMilestoneCount: openMilestones.length,
    missingActuals,
    scoredProject: selection
  };
}

/**
 * "Lite" means lite: this view intentionally does not synthesize a CPP Quality
 * Overlay A-F grade. That grade comes from the analyst-delivered Schedule
 * Health Assessment (free, requested from the schedule-health-report page),
 * which scores the full fourteen points from a baseline and a current schedule.
 * The old label sent readers to "the free Schedule Health Report", which is
 * this screening's own name on the site. Computing a second, differently-derived grade here
 * would risk two different "CPP Quality Overlay" scores for the same schedule
 * on two different pages — a real problem for a brand built on reproducibility.
 * Point to the real thing instead of faking a lite version of it.
 */
function qualityOverlayCard() {
  return h('div', { class: 'lens-card quality-overlay' }, [
    h('h3', {}, 'CPP Quality Overlay'),
    h('p', { class: 'quality-overlay-sub' }, 'This Lite view shows the checks it can score from the file, with no synthesized grade.'),
    h('a', {
      href: 'https://criticalpathpartners.ca/schedule-health-report.html',
      class: 'quality-cta-btn'
    }, 'Request the free analyst-delivered Schedule Health Assessment for the full A to F grade →')
  ]);
}

function statusBadge(status) {
  const c = BADGE_COLORS[status] || BADGE_COLORS[NOT_SCORED];
  return h('span', {
    class: 'lens-badge',
    style: {
      background:   c.bg,
      color:        c.text,
      padding:      '2px 8px',
      borderRadius: '99px',
      fontSize:     '11px',
      fontWeight:   '800',
      whiteSpace:   'nowrap'
    }
  }, status);
}

const COLUMNS = [
  { key: 'name',   label: 'Metric' },
  { key: 'result', label: 'Result' },
  // The denominator, beside the result it belongs to.
  { key: 'count',  label: 'Count' },
  { key: 'target', label: 'Target' },
  { key: 'status', label: 'Status', render: (v) => statusBadge(v) }
];

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'DCMA Lite'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const { metrics, disclosure, incompleteCount, openMilestoneCount, missingActuals, scoredProject } = computeMetrics(A, B);
  const multi = scoredProject && scoredProject.total > 1;
  const scopeLine = multi
    ? `Scored project: ${projectName(scoredProject.project)} (1 of ${scoredProject.total} projects in this file). `
    : '';
  const passCount   = metrics.filter(m => m.status === 'PASS').length;
  const failCount   = metrics.filter(m => m.status === 'FAIL').length;
  const notScoredCount = metrics.filter(m => m.status === NOT_SCORED).length;
  const scoredCount = metrics.length - notScoredCount;

  const table = dataTable({ columns: COLUMNS, rows: metrics });

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'DCMA Lite'),
    ...inputQualityCards(A),
    h('div', { class: 'lens-card' }, [
      // Count what was scored. This line used to say "14 of the 14 points" with
      // CPLI and BEI hard-coded to a dash and the Critical Path Test passing on
      // a count with no test behind it.
      h('p', { class: 'lens-dcma-heading' },
        scopeLine +
        `DCMA screening: ${scoredCount} of the 14 points are scored here · ${passCount} PASS · ` +
        `${failCount} FAIL · ${notScoredCount} not scored here, each with its reason in the table.`),
      h('p', { class: 'lens-dcma-population' },
        // 2026-11-07 (DCMA phase 2): each check's population, as CPP's one
        // DCMA definition sets it.
        `Checks 5, 6, 7 and 8 are measured over the ${incompleteCount.toLocaleString()} incomplete activities in ${multi ? 'the scored project' : 'this file'}. ` +
        'Milestones (an activity of zero duration counts as one), level of effort and WBS summary activities are left out, and so is finished work. ' +
        `Check 1 also counts incomplete milestones (${openMilestoneCount.toLocaleString()} here), and check 10 leaves out activities shorter than one working day. ` +
        'Checks 2, 3 and 4 grade the relationships into unfinished work, and check 9 reads every activity and milestone, finished ones included. ' +
        'A link to a level of effort or WBS summary activity is not counted in any check. ' +
        // Round 2 review (7-Nov-26): #6 and #7 leave out a blank float and #8
        // a blank or non-numeric duration, so their denominators can be smaller.
        'An activity with no total float is left out of checks 6 and 7, and one with no readable original duration out of check 8, so their counts can be smaller. ' +
        'The Count column gives the numerator and the denominator of every result.')
    ]),
    qualityOverlayCard(),
    h('div', { class: 'lens-card' }, [table]),
    h('div', { class: 'lens-card' }, [
      h('p', { class: 'lens-dcma-missing-actuals' },
        `Missing actual dates: ${missingActuals.toLocaleString()}. These are activities marked complete with no actual finish date, ` +
        'or in progress with no actual start date. It is a separate data check: it is not DCMA check 9, and it is not counted in the score above.')
    ]),
    ...disclosureCards(disclosure)
  ]);
}
