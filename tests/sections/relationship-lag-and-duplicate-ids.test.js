// @vitest-environment happy-dom
//
// REGRESSION SUITE — the three gaps the first identity fix stopped short of.
//
// 1. RELATIONSHIP LAG was not in the match key, so a link whose lag moved read
//    as "retained": the diff reported no change at all on one of the standard
//    ways a schedule is moved without touching an activity. On the real QA pair
//    (Georgian College current vs baseline) the lag-blind key returned
//    179 added / 59 deleted / 476 retained against a QA-confirmed 183 / 63 / 472
//    — exactly four relationships whose lag, and nothing else, had changed.
//
// 2. DUPLICATE ACTIVITY IDs silently under-counted. task_code is unique per
//    PROJECT, not per FILE, so a multi-project export repeats Activity IDs; on
//    the bare code two different activities collided on one key, one row left
//    the index, and nothing on screen said so.
//
//    The fix is NOT a project scope of any kind. proj_id is a surrogate P6
//    reassigns on export exactly like task_id (the real QA pair carries 4795 in
//    the current export and 4799 in the baseline for the SAME project), and
//    proj_short_name and the WBS root name move too — the same pair reads
//    "Georgian College" vs "Georgian College - B2" and
//    "…(CURRENT - FIXED)" vs "…- baseline - FOR ANALYSIS". Every project-level
//    discriminator fails on the ordinary case of a renamed baseline copy.
//
//    So a repeated Activity ID is DISCLOSED, never resolved by guessing: every
//    row carrying it is excluded from the verdict on BOTH sides, counted,
//    listed with the projects it spans, and the totals reconcile.
//
// 3. THE HALF-STEP REFUSAL GATE COULD NOT FIRE ON THE WORST CASE. The gate read
//    `comparable > 0 && matchRatio < MIN_MATCH_RATIO` with
//    comparable = min(aCount, bCount), so a model with ZERO TASK rows made
//    comparable 0 and switched the gate off. Probed on the pre-fix source with
//    B's TASK table absent: { matched: 0, aCount: 6, bCount: 0, comparable: 0,
//    implausible: false } — the emptiest possible input rendered a confident
//    Half-Step with a live download button.
//
// Every fixture here reproduces the REAL condition: A and B share task_code and
// share NOTHING in task_id (or proj_id). Every test fails against the pre-fix
// source.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseXer, getTable, getTableAliased } from '@criticalpathpartners/lens-parser';
import { diffModels } from '../../src/sections/_shared/diff-models.js';
import {
  indexTasks, indexRelsByCode, resolveComparisonAmbiguity, resolveRelEndpoints,
  buildSurrogateKeyIndex, normalizeLag, ambiguousTaskRows, taskKey
} from '../../src/sections/_shared/identity.js';
import { generateHalfStep, render as renderHalfStep, assessMatch, REFUSAL_REASONS, MIN_MATCH_RATIO } from '../../src/sections/half-step.js';
import { render as renderComparison } from '../../src/sections/xer-comparison.js';
import { assertDivergentSurrogates } from '../fixtures/reexport.js';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function task(task_id, task_code, proj_id = '1', extra = {}) {
  return {
    task_id: String(task_id),
    task_code,
    task_name: `Activity ${task_code}`,
    proj_id: String(proj_id),
    wbs_id: 'W1',
    status_code: 'TK_NotStart',
    task_type: 'TT_Task',
    phys_complete_pct: '0',
    remain_drtn_hr_cnt: '40',
    target_drtn_hr_cnt: '40',
    target_start_date: '2026-01-05 08:00',
    target_end_date: '2026-01-09 17:00',
    ...extra
  };
}

/** A TASKPRED row. `succ` is the successor — TASKPRED.task_id IS the successor. */
function rel(task_pred_id, pred_task_id, succ_task_id, pred_type = 'PR_FS', lag_hr_cnt = '0') {
  return {
    task_pred_id: String(task_pred_id),
    task_id: String(succ_task_id),
    pred_task_id: String(pred_task_id),
    pred_type,
    lag_hr_cnt: String(lag_hr_cnt)
  };
}

function wrap(tasks, rels, projects = [{ proj_id: '1', proj_short_name: 'ALPHA' }]) {
  return {
    ermhdr: { raw: ['ERMHDR', '24.12', '2026-01-01', 'u', 'db', 'USD'] },
    tables: {
      PROJECT:  { fields: ['proj_id', 'proj_short_name'], records: projects },
      PROJWBS:  { fields: ['wbs_id', 'parent_wbs_id', 'wbs_name', 'proj_id'], records: [{ wbs_id: 'W1', parent_wbs_id: '', wbs_name: 'Root', proj_id: '1' }] },
      TASK:     { fields: Object.keys(task(1, 'X')), records: tasks },
      TASKPRED: { fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'], records: rels }
    }
  };
}

// ── LAG fixtures. Surrogates 100s in A, 500s in B. Codes shared. ─────────────
//   A1000→A1010 FS lag 0   in both            → retained
//   A1010→A1020 FS lag 0→40                   → LAG CHANGE (one link, re-lagged)
//   A1020→A1030 FS lag 0   in A only          → added
//   A1030→A8000 FS lag 0   in B only          → deleted
function lagA() {
  return wrap(
    [task(100, 'A1000'), task(101, 'A1010'), task(102, 'A1020'), task(103, 'A1030')],
    [
      rel(1, 100, 101, 'PR_FS', '0'),
      rel(2, 101, 102, 'PR_FS', '40'),
      rel(3, 102, 103, 'PR_FS', '0')
    ]
  );
}
function lagB() {
  return wrap(
    [task(504, 'A8000'), task(503, 'A1030'), task(502, 'A1020'), task(501, 'A1010'), task(500, 'A1000')],
    [
      rel(1, 500, 501, 'PR_FS', '0'),
      rel(2, 501, 502, 'PR_FS', '0'),
      rel(4, 503, 504, 'PR_FS', '0')
    ]
  );
}

// ── MULTI-PROJECT fixtures. A1000 exists in BOTH projects: two activities. ──
const TWO_PROJECTS_A = [{ proj_id: '10', proj_short_name: 'ALPHA' }, { proj_id: '20', proj_short_name: 'BRAVO' }];
const TWO_PROJECTS_B = [{ proj_id: '77', proj_short_name: 'ALPHA' }, { proj_id: '88', proj_short_name: 'BRAVO' }];

function multiA() {
  return wrap(
    [
      task(100, 'A1000', '10'),
      task(101, 'A1010', '10'),
      task(102, 'A1000', '20'),   // SAME Activity ID, different project
      task(103, 'A1020', '20')
    ],
    [],
    TWO_PROJECTS_A
  );
}
/** Re-export of multiA: every task_id AND every proj_id renumbered. */
function multiB() {
  return wrap(
    [
      task(903, 'A1020', '88'),
      task(902, 'A1000', '88'),
      task(901, 'A1010', '77'),
      task(900, 'A1000', '77')
    ],
    [],
    TWO_PROJECTS_B
  );
}

// ── SINGLE-PROJECT pair whose proj_id diverges, like the real QA pair ───────
function singleProjA() {
  return wrap([task(100, 'A1000', '4795'), task(101, 'A1010', '4795'), task(102, 'A1020', '4795')],
    [], [{ proj_id: '4795', proj_short_name: 'Georgian College' }]);
}
function singleProjB() {
  return wrap([task(500, 'A1000', '4799'), task(501, 'A1010', '4799'), task(502, 'A1020', '4799')],
    [], [{ proj_id: '4799', proj_short_name: 'Georgian College - B2' }]);
}

/** Read a KPI card's big number by its title. */
function kpi(el, title) {
  for (const card of el.querySelectorAll('.kpi')) {
    if (card.querySelector('.kpi-title')?.textContent === title) {
      return card.querySelector('.kpi-big')?.textContent;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. RELATIONSHIP LAG
// ─────────────────────────────────────────────────────────────────────────────

describe('fixture sanity — lag pair is a real re-export', () => {
  it('the shared refusal accepts the pair: no task_id in common, four codes', () => {
    // tests/unit/two-model-fixture-guard.test.js requires every two-model suite
    // to run this refusal, so a fixture cannot quietly regress to one export
    // compared with itself.
    expect(assertDivergentSurrogates(lagA(), lagB(), { minSharedCodes: 4 }))
      .toEqual({ sharedCodes: 4, sharedTaskIds: 0 });
  });

  it('A and B share ZERO task_id values but four task_code values', () => {
    const aIds = new Set(lagA().tables.TASK.records.map(t => t.task_id));
    const bIds = new Set(lagB().tables.TASK.records.map(t => t.task_id));
    expect([...aIds].filter(i => bIds.has(i))).toEqual([]);
    const aCodes = new Set(lagA().tables.TASK.records.map(t => t.task_code));
    const bCodes = new Set(lagB().tables.TASK.records.map(t => t.task_code));
    expect([...aCodes].filter(c => bCodes.has(c)).sort()).toEqual(['A1000', 'A1010', 'A1020', 'A1030']);
  });

  it('exactly one link differs by lag alone', () => {
    // A1010→A1020 FS is present in both files; only its lag moved.
    const a = lagA().tables.TASKPRED.records.find(r => r.task_pred_id === '2');
    const b = lagB().tables.TASKPRED.records.find(r => r.task_pred_id === '2');
    expect(a.pred_type).toBe(b.pred_type);
    expect(a.lag_hr_cnt).not.toBe(b.lag_hr_cnt);
  });
});

describe('relationship lag is part of the relationship identity', () => {
  it('a link whose ONLY change is the lag is NOT reported as retained', () => {
    const d = diffModels(lagA(), lagB());
    // Pre-fix this returned 2 retained — the re-lagged link counted as unchanged.
    expect(d.counts.relsRetained).toBe(1);
    const retained = d.relationships.retained.map(r => `${r.pred_code}->${r.succ_code}`);
    expect(retained).toEqual(['A1000->A1010']);
    expect(retained).not.toContain('A1010->A1020');
  });

  it('the re-lagged link lands in BOTH the added and the deleted column', () => {
    const d = diffModels(lagA(), lagB());
    expect(d.counts.relsAdded).toBe(2);    // A1010->A1020 @40  +  A1020->A1030
    expect(d.counts.relsDeleted).toBe(2);  // A1010->A1020 @0   +  A1030->A8000
    const added = d.relationships.added.map(r => `${r.pred_code}->${r.succ_code}@${r.lag_hr_cnt}`).sort();
    const deleted = d.relationships.deleted.map(r => `${r.pred_code}->${r.succ_code}@${r.lag_hr_cnt}`).sort();
    expect(added).toEqual(['A1010->A1020@40', 'A1020->A1030@0']);
    expect(deleted).toEqual(['A1010->A1020@0', 'A1030->A8000@0']);
  });

  it('a re-lag is NAMED as one changed link, not left as two unrelated edits', () => {
    const d = diffModels(lagA(), lagB());
    expect(d.counts.relsLagChanged).toBe(1);
    expect(d.relationships.lagChanged).toHaveLength(1);
    const [lc] = d.relationships.lagChanged;
    expect(lc.pred_code).toBe('A1010');
    expect(lc.succ_code).toBe('A1020');
    expect(lc.pred_type).toBe('PR_FS');
    expect(lc.lag_before_hr).toBe('0');
    expect(lc.lag_after_hr).toBe('40');
    expect(lc.lagDeltaHr).toBe(40);        // A − B, the locked sign convention
  });

  it('the two halves of the re-lag are flagged so a table can label them', () => {
    const d = diffModels(lagA(), lagB());
    const addedFlagged = d.relationships.added.filter(r => r.lag_changed);
    const deletedFlagged = d.relationships.deleted.filter(r => r.lag_changed);
    expect(addedFlagged.map(r => `${r.pred_code}->${r.succ_code}`)).toEqual(['A1010->A1020']);
    expect(deletedFlagged.map(r => `${r.pred_code}->${r.succ_code}`)).toEqual(['A1010->A1020']);
    // A genuinely new link is NOT flagged as a lag change.
    expect(d.relationships.added.find(r => r.succ_code === 'A1030').lag_changed).toBe(false);
  });

  it('counts still reconcile with the lag in the key', () => {
    const A = lagA(), B = lagB();
    const d = diffModels(A, B);
    expect(d.counts.relsAdded + d.counts.relsRetained).toBe(A.tables.TASKPRED.records.length);
    expect(d.counts.relsDeleted + d.counts.relsRetained).toBe(B.tables.TASKPRED.records.length);
  });

  it('re-lagging EVERY link reports total churn, not a clean bill of health', () => {
    const A = lagA();
    const B = lagA();
    // Real re-export: renumber every surrogate, keep every code.
    for (const t of B.tables.TASK.records) t.task_id = String(Number(t.task_id) + 7000);
    for (const r of B.tables.TASKPRED.records) {
      r.task_id = String(Number(r.task_id) + 7000);
      r.pred_task_id = String(Number(r.pred_task_id) + 7000);
      r.lag_hr_cnt = String(Number(r.lag_hr_cnt) + 8);   // every lag moved
    }
    const d = diffModels(A, B);
    // Pre-fix: 0 added / 0 deleted / 3 retained — "nothing changed".
    expect(d.counts.relsRetained).toBe(0);
    expect(d.counts.relsAdded).toBe(3);
    expect(d.counts.relsDeleted).toBe(3);
    expect(d.counts.relsLagChanged).toBe(3);
    for (const lc of d.relationships.lagChanged) expect(lc.lagDeltaHr).toBe(-8);
  });

  it('an identical re-export shows ZERO relationship churn and ZERO lag changes', () => {
    const A = lagA();
    const B = lagA();
    for (const t of B.tables.TASK.records) t.task_id = String(Number(t.task_id) + 7000);
    for (const r of B.tables.TASKPRED.records) {
      r.task_id = String(Number(r.task_id) + 7000);
      r.pred_task_id = String(Number(r.pred_task_id) + 7000);
    }
    const d = diffModels(A, B);
    expect(d.counts.relsAdded).toBe(0);
    expect(d.counts.relsDeleted).toBe(0);
    expect(d.counts.relsRetained).toBe(3);
    expect(d.counts.relsLagChanged).toBe(0);
  });

  it('0 / 0.0 / 0.00 is one lag, not three — no phantom churn from formatting', () => {
    expect(normalizeLag('0').lag).toBe('0');
    expect(normalizeLag('0.0').lag).toBe('0');
    expect(normalizeLag('0.00').lag).toBe('0');
    expect(normalizeLag('-40').lag).toBe('-40');
    const A = lagA();
    const B = lagA();
    for (const t of B.tables.TASK.records) t.task_id = String(Number(t.task_id) + 7000);
    for (const r of B.tables.TASKPRED.records) {
      r.task_id = String(Number(r.task_id) + 7000);
      r.pred_task_id = String(Number(r.pred_task_id) + 7000);
      r.lag_hr_cnt = Number(r.lag_hr_cnt).toFixed(2);   // 0 -> "0.00", 40 -> "40.00"
    }
    const d = diffModels(A, B);
    expect(d.counts.relsLagChanged).toBe(0);
    expect(d.counts.relsRetained).toBe(3);
  });

  it('a missing lag column is read as zero AND counted, never silently substituted', () => {
    const A = lagA();
    for (const r of A.tables.TASKPRED.records) delete r.lag_hr_cnt;
    const idx = indexRelsByCode(A);
    expect(idx.lagMissing).toBe(3);
    expect(normalizeLag(undefined)).toEqual({ lag: '0', hr: 0, missing: true });
    expect(normalizeLag('').missing).toBe(true);
    const d = diffModels(A, lagB());
    expect(d.counts.relsLagMissingA).toBe(3);
  });

  it('an unparseable lag is kept verbatim rather than passed off as zero', () => {
    const n = normalizeLag('n/a');
    expect(n.lag).toBe('n/a');
    expect(n.hr).toBe(null);
    expect(n.missing).toBe(false);
  });

  it('a duplicate on pred/succ/type/lag is still counted, and reconciles', () => {
    const A = lagA();
    A.tables.TASKPRED.records.push(rel(9, 100, 101, 'PR_FS', '0')); // exact repeat of rel 1
    const idx = indexRelsByCode(A);
    expect(idx.duplicates).toBe(1);
    expect(idx.index.size + idx.malformed + idx.duplicates).toBe(idx.total);
    const d = diffModels(A, lagB());
    expect(d.counts.relsAdded + d.counts.relsRetained + d.counts.relsDuplicateA)
      .toBe(A.tables.TASKPRED.records.length);
  });

  it('two rows for the same pair with DIFFERENT lags are two relationships, not a duplicate', () => {
    const A = lagA();
    A.tables.TASKPRED.records.push(rel(9, 100, 101, 'PR_FS', '16')); // same pair, different lag
    const idx = indexRelsByCode(A);
    expect(idx.duplicates).toBe(0);
    expect(idx.index.size).toBe(4);
    // The pair now carries two lag values in one file — visible via byPair.
    const info = resolveRelEndpoints(A.tables.TASKPRED.records[0], buildSurrogateKeyIndex(A));
    expect(idx.byPair.get(info.pairKey).size).toBe(2);
  });

  it('the XER Comparison screen says a lag-only change was counted twice', () => {
    const el = renderComparison({ A: lagA(), B: lagB() });
    expect(el.textContent).toContain('1 lag-only change');
    expect(el.textContent).toContain('counted in both + and −');
    // and the change is listed with its before/after lag
    expect(el.textContent).toContain('Relationship lag changes');
    expect(el.textContent).toContain('added (lag changed)');
    expect(el.textContent).toContain('deleted (lag changed)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DUPLICATE ACTIVITY IDs / PROJECT SCOPE
// ─────────────────────────────────────────────────────────────────────────────

describe('fixture sanity — multi-project pair repeats an Activity ID', () => {
  it('A1000 appears under two different projects in each file', () => {
    for (const m of [multiA(), multiB()]) {
      const a1000 = m.tables.TASK.records.filter(t => t.task_code === 'A1000');
      expect(a1000).toHaveLength(2);
      expect(new Set(a1000.map(t => t.proj_id)).size).toBe(2);
    }
  });

  it('the two exports share NO task_id and NO proj_id — only codes and project names', () => {
    const A = multiA(), B = multiB();
    const aIds = new Set(A.tables.TASK.records.map(t => t.task_id));
    const bIds = new Set(B.tables.TASK.records.map(t => t.task_id));
    expect([...aIds].filter(i => bIds.has(i))).toEqual([]);
    const aProj = new Set(A.tables.TASK.records.map(t => t.proj_id));
    const bProj = new Set(B.tables.TASK.records.map(t => t.proj_id));
    expect([...aProj].filter(p => bProj.has(p))).toEqual([]);
  });
});

describe('a repeated Activity ID is disclosed, never resolved by guessing', () => {
  it('two projects sharing an Activity ID are two activities NEITHER file can tell apart', () => {
    // The honest answer is not "scope them by project" — every project-level
    // field is free to move between exports. It is "these rows are ambiguous",
    // stated with a number.
    const A = multiA(), B = multiB();
    const ambiguity = resolveComparisonAmbiguity(A, B);
    expect(ambiguity.any).toBe(true);
    expect(ambiguity.keys.has('code:A1000')).toBe(true);
    expect(ambiguity.a.codeCount).toBe(1);
    expect(ambiguity.b.codeCount).toBe(1);
    // The projects are NAMED — for the reader, never as a match key.
    expect(ambiguity.a.projects.sort()).toEqual(['ALPHA', 'BRAVO']);

    const idx = indexTasks(A, ambiguity.keys);
    expect(idx.total).toBe(4);
    expect(idx.index.size).toBe(2);          // A1010 and A1020 only
    expect(idx.ambiguous).toBe(2);           // BOTH A1000 rows, not just the second
    expect(idx.index.has('code:A1000')).toBe(false);
    expect(idx.index.size + idx.ambiguous + idx.noIdentity).toBe(idx.total);
  });

  it('no key carries a project token, a proj_id, or anything but the Activity ID', () => {
    // The whole surface: a key is the prefix plus the raw Activity ID. Nothing
    // project-derived can enter it, because nothing project-derived is read.
    for (const m of [multiA(), multiB(), singleProjA(), singleProjB()]) {
      for (const t of getTable(m, 'TASK')) {
        expect(taskKey(t)).toBe(`code:${t.task_code}`);
      }
    }
  });

  it('the ambiguous rows take no part in added, deleted or changed', () => {
    const A = multiA();
    const B = multiB();
    // Change BRAVO's A1000 only. Under the old scoped design this was reported
    // as one change attributed to BRAVO — a claim resting on a project name
    // that a rename would have silenced.
    A.tables.TASK.records.find(t => t.task_code === 'A1000' && t.proj_id === '20').status_code = 'TK_Complete';
    const d = diffModels(A, B);
    expect(d.counts.tasksMatched).toBe(2);
    expect(d.counts.tasksAdded).toBe(0);
    expect(d.counts.tasksDeleted).toBe(0);
    expect(d.counts.activitiesChanged).toBe(0);
    expect(d.tasks.changed.some(c => c.task_code === 'A1000')).toBe(false);
    expect(d.counts.tasksAmbiguousA).toBe(2);
    expect(d.counts.tasksAmbiguousB).toBe(2);
    // Nothing was dropped: every excluded row is still listed, with its project.
    expect(d.tasks.ambiguous.a.excludedRows).toHaveLength(2);
    expect(d.tasks.ambiguous.a.excludedRows.map(r => r.project).sort()).toEqual(['ALPHA', 'BRAVO']);
  });

  it('the totals reconcile on both sides — nothing vanishes into the ambiguity', () => {
    const A = multiA(), B = multiB();
    const d = diffModels(A, B);
    expect(d.tasks.reconciliation.a.reconciles).toBe(true);
    expect(d.tasks.reconciliation.b.reconciles).toBe(true);
    expect(d.counts.tasksMatched + d.counts.tasksAdded + d.counts.tasksAmbiguousA + d.counts.tasksNoIdentityA)
      .toBe(d.counts.tasksTotalA);
    expect(d.counts.tasksMatched + d.counts.tasksDeleted + d.counts.tasksAmbiguousB + d.counts.tasksNoIdentityB)
      .toBe(d.counts.tasksTotalB);
    expect(d.counts.tasksTotalA).toBe(A.tables.TASK.records.length);
    expect(d.counts.tasksTotalB).toBe(B.tables.TASK.records.length);
  });

  it('a code repeated in ONE file is excluded from the OTHER file too', () => {
    // Otherwise the clean side reports a deletion about an activity the other
    // file demonstrably holds — a confident statement with nothing behind it.
    const A = multiA();                       // A1000 twice
    const B = wrap([task(900, 'A1000', '77'), task(901, 'A1010', '77'), task(902, 'A1020', '77')],
      [], [{ proj_id: '77', proj_short_name: 'ALPHA' }]);
    const d = diffModels(A, B);
    expect(d.counts.ambiguousCodesA).toBe(1);
    expect(d.counts.ambiguousCodesB).toBe(0);   // B repeats nothing on its own
    expect(d.counts.tasksAmbiguousB).toBe(1);   // yet B's A1000 is still excluded
    expect(d.counts.tasksDeleted).toBe(0);      // and is NOT called deleted
    expect(d.tasks.reconciliation.b.reconciles).toBe(true);
  });

  it('proj_id is never read at all — a single-project pair with divergent proj_ids matches in full', () => {
    // The real QA pair carries proj_id 4795 / 4799 for the same project. Any
    // proj_id-scoped key matches 0 of 318 activities.
    const A = singleProjA(), B = singleProjB();
    expect(A.tables.TASK.records[0].proj_id).not.toBe(B.tables.TASK.records[0].proj_id);
    const d = diffModels(A, B);
    expect(d.counts.tasksMatched).toBe(3);
    expect(d.counts.tasksAdded).toBe(0);
    expect(d.counts.tasksDeleted).toBe(0);
    expect(d.counts.tasksAmbiguousA).toBe(0);
    expect(indexTasks(A).index.size).toBe(3);
  });

  it('a project renamed between exports changes nothing — the name is never consulted', () => {
    // "Georgian College" vs "Georgian College - B2": the baseline was saved as
    // a copy and renamed, which is ordinary practice.
    const d = diffModels(singleProjA(), singleProjB());
    expect(d.counts.activitiesChanged).toBe(0);
    expect(d.counts.tasksMatched).toBe(3);

    // Rename BOTH the Project ID and the WBS root of one side and the answer is
    // identical, because neither is read.
    const A = singleProjA(), B = singleProjB();
    A.tables.PROJECT.records[0].proj_short_name = 'Something Else Entirely';
    A.tables.PROJWBS.records[0].wbs_name = 'Renamed root';
    const d2 = diffModels(A, B);
    expect(d2.counts.tasksMatched).toBe(3);
    expect(d2.counts.tasksAdded).toBe(0);
    expect(d2.counts.tasksDeleted).toBe(0);
  });

  it('a repeated Activity ID INSIDE one project is surfaced, never merged away', () => {
    const A = multiA();
    A.tables.TASK.records.push(task(999, 'A1000', '10', { task_name: 'Duplicate of ALPHA A1000' }));
    const idx = indexTasks(A);
    expect(idx.total).toBe(5);
    expect(idx.index.size).toBe(2);
    expect(idx.ambiguous).toBe(3);            // all three A1000 rows
    expect(ambiguousTaskRows(A)).toBe(3);
    // Every one of them is kept and identifiable — none is picked to stand in
    // for the others, and none is dropped.
    expect(idx.ambiguousRows.map(r => r.task_id).sort()).toEqual(['100', '102', '999']);
    expect(idx.ambiguousRows.every(r => r.display === 'A1000')).toBe(true);
    expect(idx.ambiguousRows.find(r => r.task_id === '999').project).toBe('ALPHA');
    expect(idx.ambiguousRows.find(r => r.task_id === '102').project).toBe('BRAVO');
  });

  it('the excluded rows are NOT counted as added, deleted or changed', () => {
    const A = multiA();
    A.tables.TASK.records.push(task(999, 'A1000', '10', { status_code: 'TK_Complete' }));
    const d = diffModels(A, multiB());
    expect(d.counts.tasksAmbiguousA).toBe(3);
    expect(d.counts.tasksAdded).toBe(0);
    expect(d.counts.tasksDeleted).toBe(0);
    expect(d.counts.activitiesChanged).toBe(0);   // the repeat never took part
    expect(d.tasks.ambiguous.a.excludedRows).toHaveLength(3);
    expect(d.tasks.ambiguous.b.excludedRows).toHaveLength(2);
  });

  it('indexTasks reconciles: index + ambiguous + noIdentity = every row read', () => {
    const A = multiA();
    A.tables.TASK.records.push(task(999, 'A1000', '10'));
    A.tables.TASK.records.push({ task_id: '', task_code: '', proj_id: '10', task_name: 'no identity at all' });
    const idx = indexTasks(A, resolveComparisonAmbiguity(A, multiB()).keys);
    expect(idx.noIdentity).toBe(1);
    expect(idx.index.size + idx.ambiguous + idx.noIdentity).toBe(idx.total);
    expect(idx.total).toBe(A.tables.TASK.records.length);
  });

  it('a file that names no project at all still reconciles, and says so plainly', () => {
    const A = multiA(), B = multiB();
    A.tables.PROJECT.records = [{ proj_id: '10', proj_short_name: '' }, { proj_id: '20', proj_short_name: '' }];
    B.tables.PROJECT.records = [{ proj_id: '77', proj_short_name: '' }, { proj_id: '88', proj_short_name: '' }];
    const ambiguity = resolveComparisonAmbiguity(A, B);
    // With no name available the label falls back to "project <proj_id>" — a
    // LABEL for the reader. It is never a key: the keys are unchanged.
    expect(ambiguity.a.projects.sort()).toEqual(['project 10', 'project 20']);
    for (const t of getTable(A, 'TASK')) expect(taskKey(t)).toBe(`code:${t.task_code}`);

    const idx = indexTasks(A, ambiguity.keys);
    expect(idx.total).toBe(4);
    expect(idx.index.size).toBe(2);
    expect(idx.ambiguous).toBe(2);
    expect(idx.index.size + idx.ambiguous + idx.noIdentity).toBe(idx.total);
  });

  it('two projects sharing one Project ID need no special case — the code is what repeats', () => {
    const A = multiA(), B = multiB();
    A.tables.PROJECT.records = [{ proj_id: '10', proj_short_name: 'SAME' }, { proj_id: '20', proj_short_name: 'SAME' }];
    // Pre-fix this reported 0 duplicates because a proj_id fallback hid them.
    expect(indexTasks(A).ambiguous).toBe(2);
    expect(diffModels(A, B).counts.tasksAmbiguousA).toBe(2);
  });

  it('the repeated-Activity-ID count reaches the SCREEN, with the rows and projects listed', () => {
    const A = multiA();
    A.tables.TASK.records.push(task(999, 'A1000', '10', { task_name: 'Second ALPHA A1000' }));
    const el = renderComparison({ A, B: multiB() });
    // One repeated Activity ID in each file.
    expect(kpi(el, 'Repeated Activity IDs')).toBe('2');
    expect(el.textContent).toContain('1 Activity ID is repeated in the current export');
    expect(el.textContent).toContain('excluded from the comparison');
    expect(el.textContent).toContain('cover only the unambiguous remainder');
    expect(el.textContent).toContain('3 current activity row(s) are excluded');
    expect(el.textContent).toContain('Repeated across: ALPHA, BRAVO');
    expect(el.textContent).toContain('Second ALPHA A1000');
    // and the reconciliation is printed, not merely true
    expect(el.textContent).toContain('Reconciliation — every row accounted for');
    expect(el.textContent).toContain('= 5 activity rows.');
  });

  it('the screen makes no project-scope claim on ANY input', () => {
    // Requirement 4: a project-scoped comparison is a future feature with a
    // human in it. Nothing may hint that the tool did one, or could.
    const A = multiA();
    A.tables.TASK.records.push(task(999, 'A1000', '10'));
    for (const el of [
      renderComparison({ A, B: multiB() }),
      renderComparison({ A: multiA(), B: multiB() }),
      renderComparison({ A: singleProjA(), B: singleProjB() })
    ]) {
      const text = el.textContent;
      expect(text).not.toContain('scoped by');
      expect(text).not.toContain('Multi-project comparison');
      expect(text).not.toContain('on BOTH files');
      expect(text).not.toContain('proj_short_name');
      expect(text).not.toContain('proj_id');
    }
  });

  it('a clean single-project pair shows no disclosure card at all', () => {
    const el = renderComparison({ A: singleProjA(), B: singleProjB() });
    expect(kpi(el, 'Repeated Activity IDs')).toBe('0');
    expect(el.textContent).not.toContain('Read this before the numbers');
    expect(el.textContent).toContain('every Activity ID is unique within its file');
    // The reconciliation still prints — it is not a disclosure, it is the sum.
    expect(el.textContent).toContain('Reconciliation — every row accounted for');
    expect(el.textContent).toContain('3 matched + 0 added + 0 excluded as ambiguous');
  });

  it('Half-Step refuses to overlay a repeated Activity ID, and says how many', () => {
    const A = multiA();
    const B = multiB();
    A.tables.TASK.records.find(t => t.task_code === 'A1000' && t.proj_id === '20').status_code = 'TK_Complete';
    const out = generateHalfStep(A, B);
    expect(out._halfStepMeta.matched).toBe(2);                    // A1010 and A1020
    expect(out._halfStepMeta.ambiguousIdentitiesBase).toBe(2);
    expect(out._halfStepMeta.ambiguousCodesA).toBe(1);
    // NEITHER base A1000 took the progress: picking one would be the guess.
    const bravo = out.tables.TASK.records.find(t => t.task_code === 'A1000' && t.proj_id === '88');
    const alpha = out.tables.TASK.records.find(t => t.task_code === 'A1000' && t.proj_id === '77');
    expect(bravo.status_code).toBe('TK_NotStart');
    expect(alpha.status_code).toBe('TK_NotStart');

    const el = renderHalfStep({ A, B });
    expect(el.textContent).toContain('repeated in the updated export');
    expect(el.textContent).toContain('Repeated across: ALPHA, BRAVO');
    expect(el.textContent).toContain('Reconciliation — every base row accounted for');
  });

  it('Half-Step leaves a repeated base row verbatim instead of guessing', () => {
    const A = multiA();
    const B = multiB();
    A.tables.TASK.records.find(t => t.task_code === 'A1000' && t.proj_id === '20').status_code = 'TK_Complete';
    B.tables.TASK.records.push(task(998, 'A1000', '88', { task_name: 'Second BRAVO A1000' }));
    const out = generateHalfStep(A, B);
    expect(out._halfStepMeta.ambiguousIdentitiesBase).toBe(3);
    expect(out._halfStepMeta.matched).toBe(2);
    const repeats = out.tables.TASK.records.filter(t => t.task_code === 'A1000');
    expect(repeats).toHaveLength(3);
    expect(repeats.filter(t => t.status_code === 'TK_Complete')).toHaveLength(0);
  });

  it('every base row is accounted for: matched + ambiguous + unmatched = B rows', () => {
    const A = multiA();
    const B = multiB();
    B.tables.TASK.records.push(task(998, 'A1000', '88'));          // a repeat
    B.tables.TASK.records.push(task(997, 'B9999', '88'));          // B-only scope
    B.tables.TASK.records.push({ task_id: '', task_code: '', proj_id: '88' }); // no identity
    const m = generateHalfStep(A, B)._halfStepMeta;
    expect(m.matched + m.ambiguousIdentitiesBase + m.unmatchedInBase)
      .toBe(B.tables.TASK.records.length);
  });

  it('every UPDATED row is accounted for, and an ambiguous row is not called A-only', () => {
    // "Unmatched in updated" means "absent from the base schedule". A row whose
    // Activity ID repeats is not absent — it is unidentifiable — and folding the
    // two together would overstate the scope change.
    const A = multiA();
    A.tables.TASK.records.push(task(999, 'A9000', '10'));          // genuinely A-only
    const m = generateHalfStep(A, multiB())._halfStepMeta;
    expect(m.ambiguousIdentities).toBe(2);                          // both A1000 rows
    expect(m.unmatchedInUpdated).toBe(1);                           // A9000 only
    expect(m.matched + m.unmatchedInUpdated + m.ambiguousIdentities).toBe(m.aCount);
    expect(renderHalfStep({ A, B: multiB() }).textContent)
      .toContain('2 overlaid + 1 with no counterpart in the base export + 2 excluded as ambiguous = 5 activity rows.');
  });

  it('relationships touching an ambiguous activity are excluded and counted, never guessed', () => {
    // A1000 repeats in both files, so a link to "A1000" cannot be matched: which
    // A1000? Keying it on the surrogate would manufacture one false addition and
    // one false deletion for every such link.
    const A = wrap(
      [task(100, 'A1000', '10'), task(101, 'A1010', '10'), task(102, 'A1000', '20'), task(103, 'A1020', '20')],
      [rel(1, 100, 101), rel(2, 101, 103)],
      TWO_PROJECTS_A
    );
    const B = wrap(
      [task(900, 'A1000', '77'), task(901, 'A1010', '77'), task(902, 'A1000', '88'), task(903, 'A1020', '88')],
      [rel(1, 900, 901), rel(2, 901, 903)],
      TWO_PROJECTS_B
    );
    const d = diffModels(A, B);
    expect(d.counts.relsAmbiguousA).toBe(1);      // A1000 → A1010
    expect(d.counts.relsAmbiguousB).toBe(1);
    expect(d.counts.relsRetained).toBe(1);        // A1010 → A1020 is unambiguous
    expect(d.counts.relsAdded).toBe(0);
    expect(d.counts.relsDeleted).toBe(0);
    // Relationship totals reconcile on both sides.
    expect(d.counts.relsAdded + d.counts.relsRetained + d.counts.relsAmbiguousA +
           d.counts.relsMalformedA + d.counts.relsDuplicateA).toBe(d.counts.relsTotalA);
    expect(d.counts.relsDeleted + d.counts.relsRetained + d.counts.relsAmbiguousB +
           d.counts.relsMalformedB + d.counts.relsDuplicateB).toBe(d.counts.relsTotalB);

    const el = renderComparison({ A, B });
    expect(el.textContent).toContain('2 relationship row(s) run to or from an activity with a repeated');
    expect(el.textContent).toContain('excluded as ambiguous');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. HALF-STEP REFUSAL GATE ON THE DEGENERATE INPUT
// ─────────────────────────────────────────────────────────────────────────────

/** Six activities — the exact aCount the pre-fix probe reported. */
function sixTaskModel() {
  return wrap(
    ['A1000', 'A1010', 'A1020', 'A1030', 'A1040', 'A1050'].map((c, i) =>
      task(100 + i, c, '1', { status_code: 'TK_Complete', phys_complete_pct: '100', remain_drtn_hr_cnt: '0' })),
    []
  );
}

describe('assessMatch — the gate cannot switch itself off', () => {
  it('fires when the BASE has no activities (comparable = 0)', () => {
    const g = assessMatch(6, 0, 0);
    expect(g.comparable).toBe(0);
    expect(g.matchRatio).toBe(null);
    expect(g.implausible).toBe(true);               // pre-fix: false
    expect(g.refusalReason).toBe(REFUSAL_REASONS.NO_ACTIVITIES_BASE);
  });

  it('fires when the UPDATED schedule has no activities', () => {
    const g = assessMatch(0, 6, 0);
    expect(g.implausible).toBe(true);
    expect(g.refusalReason).toBe(REFUSAL_REASONS.NO_ACTIVITIES_UPDATED);
  });

  it('fires when NEITHER side has activities', () => {
    const g = assessMatch(0, 0, 0);
    expect(g.implausible).toBe(true);
    expect(g.refusalReason).toBe(REFUSAL_REASONS.NO_ACTIVITIES_EITHER);
  });

  it('still fires on a low but non-zero overlap', () => {
    const g = assessMatch(100, 100, 10);
    expect(g.implausible).toBe(true);
    expect(g.refusalReason).toBe(REFUSAL_REASONS.MATCH_BELOW_FLOOR);
    expect(g.matchRatio).toBeCloseTo(0.1);
  });

  it('does not fire on a healthy overlap', () => {
    const g = assessMatch(100, 100, 90);
    expect(g.implausible).toBe(false);
    expect(g.refusalReason).toBe(null);
    expect(g.matchRatio).toBeGreaterThanOrEqual(MIN_MATCH_RATIO);
  });

  it('the floor itself is inclusive — exactly at the floor is allowed', () => {
    expect(assessMatch(100, 100, 50).implausible).toBe(false);
    expect(assessMatch(100, 100, 49).implausible).toBe(true);
  });
});

describe('Half-Step refuses the degenerate input it used to render confidently', () => {
  it("B's TASK table absent — the exact pre-fix probe — now refuses", () => {
    const out = generateHalfStep(sixTaskModel(), { ermhdr: {}, tables: {} });
    const m = out._halfStepMeta;
    // Pre-fix probe result: { matched:0, aCount:6, bCount:0, comparable:0, implausible:false }
    expect(m.matched).toBe(0);
    expect(m.aCount).toBe(6);
    expect(m.bCount).toBe(0);
    expect(m.comparable).toBe(0);
    expect(m.implausible).toBe(true);
    expect(m.refusalReason).toBe(REFUSAL_REASONS.NO_ACTIVITIES_BASE);
  });

  it("A's TASK table absent — nothing to overlay — refuses", () => {
    const out = generateHalfStep({ tables: {} }, sixTaskModel());
    expect(out._halfStepMeta.implausible).toBe(true);
    expect(out._halfStepMeta.refusalReason).toBe(REFUSAL_REASONS.NO_ACTIVITIES_UPDATED);
  });

  it('both models empty — refuses rather than emitting an empty XER as an answer', () => {
    const out = generateHalfStep({ tables: {} }, { tables: {} });
    expect(out._halfStepMeta.implausible).toBe(true);
    expect(out._halfStepMeta.refusalReason).toBe(REFUSAL_REASONS.NO_ACTIVITIES_EITHER);
  });

  it('the download button is withheld on the degenerate input', () => {
    const el = renderHalfStep({ A: sixTaskModel(), B: { ermhdr: {}, tables: {} } });
    expect(el.textContent).toContain('Half-Step withheld');
    expect(el.textContent).toContain('the base schedule has no activities');
    const dl = [...el.querySelectorAll('button')].find(b => /Half-Step XER/.test(b.textContent));
    expect(dl.disabled).toBe(true);
  });

  it('the refusal never prints a confident percentage it cannot compute', () => {
    // matchRatio is null here; formatting it would render a precise "0.0%".
    const el = renderHalfStep({ A: sixTaskModel(), B: { ermhdr: {}, tables: {} } });
    expect(el.textContent).not.toMatch(/\d+\.\d%/);
    expect(el.textContent).not.toContain('NaN');
    expect(el.textContent).toContain('There is nothing to compare');
  });

  it('a healthy pair is still produced, with no refusal text', () => {
    const A = sixTaskModel();
    const B = sixTaskModel();
    for (const t of B.tables.TASK.records) {
      t.task_id = String(Number(t.task_id) + 7000);
      t.status_code = 'TK_NotStart';
      t.phys_complete_pct = '0';
    }
    const out = generateHalfStep(A, B);
    expect(out._halfStepMeta.matched).toBe(6);
    expect(out._halfStepMeta.implausible).toBe(false);
    expect(out._halfStepMeta.refusalReason).toBe(null);
    const el = renderHalfStep({ A, B });
    expect(el.textContent).not.toContain('Half-Step withheld');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. THE REAL QA PAIR — runs when the two genuine exports are on the machine.
//    QA-confirmed: 318 matching activity codes; 183 added / 63 deleted /
//    472 retained relationships.
// ─────────────────────────────────────────────────────────────────────────────

import { QA_DIR } from '../qa-corpus.js';
const QA_CURRENT = `${QA_DIR}/Georgian-College-current.xer`;
const QA_BASELINE = `${QA_DIR}/Georgian-College-baseline.xer`;
const HAVE_QA = existsSync(QA_CURRENT) && existsSync(QA_BASELINE);

describe.skipIf(!HAVE_QA)('real QA pair — Georgian College current vs baseline', () => {
  const A = HAVE_QA ? parseXer(readFileSync(QA_CURRENT, 'latin1')) : null;
  const B = HAVE_QA ? parseXer(readFileSync(QA_BASELINE, 'latin1')) : null;

  it('is the real condition: task_id disjoint, proj_id different, codes shared', () => {
    const aIds = new Set(getTable(A, 'TASK').map(t => t.task_id));
    const bIds = new Set(getTable(B, 'TASK').map(t => t.task_id));
    expect([...aIds].filter(i => bIds.has(i))).toEqual([]);
    expect(getTable(A, 'TASK')[0].proj_id).not.toBe(getTable(B, 'TASK')[0].proj_id);
    expect(getTable(A, 'TASK').length).toBe(405);
    expect(getTable(B, 'TASK').length).toBe(327);
  });

  it('matches the QA-confirmed 318 shared activity codes', () => {
    const a = indexTasks(A), b = indexTasks(B);
    let matched = 0;
    for (const k of a.index.keys()) if (b.index.has(k)) matched++;
    expect(matched).toBe(318);
    expect(a.ambiguous).toBe(0);
    expect(b.ambiguous).toBe(0);
    expect(resolveComparisonAmbiguity(A, B).any).toBe(false);
  });

  it('matches the QA-confirmed 183 added / 63 deleted / 472 retained relationships', () => {
    const d = diffModels(A, B);
    expect(d.counts.relsAdded).toBe(183);
    expect(d.counts.relsDeleted).toBe(63);
    expect(d.counts.relsRetained).toBe(472);
    // The four links the lag-blind key called "retained".
    expect(d.counts.relsLagChanged).toBe(4);
  });

  it('every relationship is accounted for on both sides', () => {
    const d = diffModels(A, B);
    expect(d.counts.relsAmbiguousA).toBe(0);
    expect(d.counts.relsAmbiguousB).toBe(0);
    expect(d.counts.relsAdded + d.counts.relsRetained + d.counts.relsAmbiguousA +
           d.counts.relsMalformedA + d.counts.relsDuplicateA)
      .toBe(getTableAliased(A, 'REL').length);
    expect(d.counts.relsDeleted + d.counts.relsRetained + d.counts.relsAmbiguousB +
           d.counts.relsMalformedB + d.counts.relsDuplicateB)
      .toBe(getTableAliased(B, 'REL').length);
  });

  it('the Half-Step gate does not fire on this healthy pair', () => {
    const out = generateHalfStep(A, B);
    expect(out._halfStepMeta.matched).toBe(318);
    expect(out._halfStepMeta.implausible).toBe(false);
  });
});
