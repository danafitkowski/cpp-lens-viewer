// @vitest-environment happy-dom
//
// REGRESSION SUITE — AUTOMATIC PROJECT SCOPING, AND WHY THERE IS NONE.
//
// THREE HEURISTICS, THREE NEW WAYS TO BE CONFIDENTLY WRONG
// -------------------------------------------------------
// `task_code` is unique per PROJECT, not per FILE, so a multi-project export
// really can repeat an Activity ID. Three successive attempts to auto-detect a
// project scope for cross-export matching each shipped a fresh catastrophe,
// every number below measured on real Georgian College exports:
//
//   1. per-model scope selection. A scoped by proj_short_name, B not scoped at
//      all → 732 added / 327 deleted / 0 changed / 0 retained on a pair sharing
//      318 Activity IDs.
//   2. pair-level scope selection, verified against the pair. A two-project
//      current against the one-project baseline → 405 added / 0 deleted /
//      0 CHANGED, on a pair whose live project shares 318 codes with the
//      baseline and changed 316 of them. The forensic content vanished behind a
//      tidy-looking answer.
//   3. the same, with the live project renamed between the two exports →
//      405 added AND 405 deleted on a pair whose truthful answer is zero of
//      each. Reproduced on the real files before this suite was rewritten.
//
// THE MEASUREMENT THAT SETTLES IT
// -------------------------------
// On the two real exports of the SAME project, NOT ONE project-level
// discriminator survives:
//
//   proj_id          4795                                        vs 4799
//   proj_short_name  'Georgian College'                          vs 'Georgian College - B2'
//   WBS root name    'Georgian College Building F Expansion (CURRENT - FIXED)'
//                                                                vs 'Georgian College - baseline - FOR ANALYSIS'
//
// Scoping that pair on ANY of them matches 0 of 318. Renaming a project between
// baseline and current is normal working practice, so no heuristic can tell
// "renamed" from "different". Automatic project scoping is not solvable by a
// better heuristic.
//
// WHAT THIS SUITE PINS INSTEAD
// ----------------------------
// 1. Cross-export identity is the Activity ID ALONE. No scope, no strategy
//    list, no per-pair decision — and no project field is read when matching.
// 2. A repeated Activity ID is DISCLOSED, never guessed: every row carrying it
//    is excluded from the verdict on BOTH sides, counted, listed, and the
//    projects it spans are named.
// 3. Every total reconciles, and the section PRINTS the reconciliation.
// 4. NOTHING in a section render throws on well-formed input — including the
//    input that made the deleted assertNoSurrogateTokens() guard take down all
//    four Compare sections at once.
// 5. The UI never claims, offers or hints at a project scope.
//
// This file previously pinned heuristic 2 as correct behaviour. It has been
// retargeted, not relaxed: every guarantee it used to make about symmetry and
// about proj_id is now enforced structurally (there is no scope to be
// asymmetric about, and no project field is read), and the disclosure,
// reconciliation and no-throw guarantees are new.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parseXer, getTable, getTableAliased } from '@criticalpathpartners/lens-parser';
import { diffModels } from '../../src/sections/_shared/diff-models.js';
import {
  resolveComparisonAmbiguity, matchedIdentityCount, indexTasks, indexRelsByCode,
  taskKey, resolveTaskKey, keyDisplay, repeatedTaskKeys, ambiguousTaskRows,
  projectLabels, CODE_PREFIX
} from '../../src/sections/_shared/identity.js';
import * as identity from '../../src/sections/_shared/identity.js';
import { render as renderComparison } from '../../src/sections/xer-comparison.js';
import { render as renderPeriod } from '../../src/sections/period-reporting.js';
import { render as renderFlip } from '../../src/sections/narrative-flip.js';
import { render as renderHalfStep } from '../../src/sections/half-step.js';
import { reexport, assertDivergentSurrogates, identityOverlap } from '../fixtures/reexport.js';

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC FIXTURES — always run, on any machine
// ─────────────────────────────────────────────────────────────────────────────

function task(task_id, task_code, proj_id, extra = {}) {
  return {
    task_id: String(task_id),
    task_code,
    task_name: `Activity ${task_code}`,
    proj_id: String(proj_id),
    wbs_id: 'W' + proj_id,
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

function rel(task_pred_id, pred_task_id, succ_task_id) {
  return {
    task_pred_id: String(task_pred_id),
    task_id: String(succ_task_id),
    pred_task_id: String(pred_task_id),
    pred_type: 'PR_FS',
    lag_hr_cnt: '0'
  };
}

/**
 * Build a model. `projects` is [{ proj_id, proj_short_name, wbs_name }]; every
 * project gets a WBS project node so a WBS-derived label is reachable.
 */
function model(projects, tasks, rels = []) {
  return {
    ermhdr: { raw: ['ERMHDR', '24.12', '2026-01-01', 'u', 'db', 'USD'] },
    tables: {
      PROJECT: {
        fields: ['proj_id', 'proj_short_name'],
        records: projects.map(p => ({ proj_id: p.proj_id, proj_short_name: p.proj_short_name }))
      },
      PROJWBS: {
        fields: ['wbs_id', 'parent_wbs_id', 'wbs_name', 'proj_id', 'proj_node_flag'],
        records: projects.map(p => ({
          wbs_id: 'W' + p.proj_id, parent_wbs_id: 'EPS', wbs_name: p.wbs_name,
          proj_id: p.proj_id, proj_node_flag: 'Y'
        }))
      },
      TASK: { fields: Object.keys(task(1, 'X', '1')), records: tasks },
      TASKPRED: { fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'], records: rels }
    }
  };
}

/** Two projects in one file, both repeating Activity ID A1000. Surrogates 1xx. */
function twoProjectCurrent() {
  return model(
    [
      { proj_id: '10', proj_short_name: 'ALPHA', wbs_name: 'Alpha Works' },
      { proj_id: '20', proj_short_name: 'BRAVO', wbs_name: 'Bravo Works' }
    ],
    [
      task(100, 'A1000', '10'), task(101, 'A1010', '10'),
      task(102, 'A1000', '20'), task(103, 'A1020', '20')
    ],
    [rel(1, 100, 101), rel(2, 102, 103)]
  );
}

/** ONE project — ALPHA only — re-exported: disjoint surrogates, new proj_id. */
function oneProjectBaseline() {
  return model(
    [{ proj_id: '77', proj_short_name: 'ALPHA', wbs_name: 'Alpha Works' }],
    [task(900, 'A1010', '77'), task(901, 'A1000', '77')],
    [rel(1, 901, 900)]
  );
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
// FIXTURE SANITY
// ─────────────────────────────────────────────────────────────────────────────

describe('fixture sanity — a two-project current against a one-project baseline', () => {
  it('is a real export pair: no task_id and no proj_id in common, codes shared', () => {
    const A = twoProjectCurrent(), B = oneProjectBaseline();
    expect(assertDivergentSurrogates(A, B, { minSharedCodes: 2 }))
      .toEqual({ sharedCodes: 2, sharedTaskIds: 0 });
    const aProj = new Set(getTable(A, 'TASK').map(t => t.proj_id));
    const bProj = new Set(getTable(B, 'TASK').map(t => t.proj_id));
    expect([...aProj].filter(p => bProj.has(p))).toEqual([]);
  });

  it('the current file genuinely repeats an Activity ID across its two projects', () => {
    const rows = getTable(twoProjectCurrent(), 'TASK').filter(t => t.task_code === 'A1000');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(t => t.proj_id)).size).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. THERE IS NO SCOPE — STRUCTURALLY, NOT BY CONVENTION
// ─────────────────────────────────────────────────────────────────────────────

describe('identity.js exposes no scope machinery of any kind', () => {
  // Each of these was part of a shipped heuristic. Their absence is the
  // guarantee: a caller that tries to scope now fails at import, loudly,
  // instead of quietly producing a key the other side cannot match.
  const REMOVED = [
    'resolveProjectScope',      // heuristic 1: per-model decision
    'resolveComparisonScope',   // heuristics 2 and 3: per-pair decision
    'surveyProjectScope',
    'SCOPE_STRATEGIES',
    'SCOPE_SEP',
    'NO_SCOPE',
    'keyScope',
    'assertNoSurrogateTokens'   // the render-time throw
  ];

  for (const name of REMOVED) {
    it(`${name} is gone`, () => {
      expect(identity[name]).toBeUndefined();
    });
  }

  it('resolveTaskKey takes ONE argument — there is no scope to pass it', () => {
    expect(resolveTaskKey.length).toBe(1);
    expect(taskKey.length).toBe(1);
  });

  it('a key is the prefix plus the raw Activity ID, and nothing else', () => {
    for (const m of [twoProjectCurrent(), oneProjectBaseline()]) {
      for (const t of getTable(m, 'TASK')) {
        const k = taskKey(t);
        expect(k).toBe(CODE_PREFIX + t.task_code);
        expect(keyDisplay(k)).toBe(t.task_code);
      }
    }
  });

  it('an extra argument cannot smuggle a scope back in', () => {
    // Guards against a caller "restoring" the old signature by habit.
    const t = getTable(twoProjectCurrent(), 'TASK')[0];
    const smuggled = { applied: true, scopedBy: 'proj_short_name', tokens: new Map([['10', 'ALPHA']]) };
    expect(taskKey(t, smuggled)).toBe(taskKey(t));
    expect(resolveTaskKey(t, smuggled)).toEqual(resolveTaskKey(t));
  });
});

describe('no project field is read when matching', () => {
  /** Rewrite every project-level field in a model, leaving activities alone. */
  function scrambleProjectIdentity(m) {
    const out = JSON.parse(JSON.stringify(m));
    for (const p of out.tables.PROJECT.records) {
      p.proj_short_name = `Renamed ${p.proj_id} rev C`;
      p.proj_id = String(Number(p.proj_id) + 4000);
    }
    for (const w of out.tables.PROJWBS.records) {
      w.wbs_name = `${w.wbs_name} — FOR ANALYSIS`;
      w.proj_id = String(Number(w.proj_id) + 4000);
    }
    for (const t of out.tables.TASK.records) t.proj_id = String(Number(t.proj_id) + 4000);
    return out;
  }

  /** The counts that a scope, if one existed, would move. */
  function verdict(A, B) {
    const c = diffModels(A, B).counts;
    return {
      matched: c.tasksMatched, added: c.tasksAdded, deleted: c.tasksDeleted,
      changed: c.activitiesChanged, ambiguousA: c.tasksAmbiguousA, ambiguousB: c.tasksAmbiguousB,
      relsAdded: c.relsAdded, relsDeleted: c.relsDeleted, relsRetained: c.relsRetained
    };
  }

  it('renaming and renumbering every project changes NOTHING about the verdict', () => {
    // This is the QA pair's condition in miniature: proj_id, proj_short_name and
    // the WBS root name all move between the two exports. Under any of the three
    // heuristics this input produced a different — and wrong — answer.
    const A = twoProjectCurrent(), B = oneProjectBaseline();
    expect(verdict(scrambleProjectIdentity(A), B)).toEqual(verdict(A, B));
    expect(verdict(A, scrambleProjectIdentity(B))).toEqual(verdict(A, B));
    expect(verdict(scrambleProjectIdentity(A), scrambleProjectIdentity(B))).toEqual(verdict(A, B));
  });

  it('stripping the PROJECT and PROJWBS tables entirely changes nothing either', () => {
    const A = twoProjectCurrent(), B = oneProjectBaseline();
    const stripped = JSON.parse(JSON.stringify(A));
    delete stripped.tables.PROJECT;
    delete stripped.tables.PROJWBS;
    expect(verdict(stripped, B)).toEqual(verdict(A, B));
  });

  it('the project labels that DO exist are for the reader, never for a key', () => {
    const A = twoProjectCurrent();
    expect(projectLabels(A).get('10')).toBe('ALPHA');
    // and no key mentions it
    for (const t of getTable(A, 'TASK')) expect(taskKey(t)).not.toContain('ALPHA');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE MULTI-PROJECT CASE — DISCLOSED, NOT GUESSED
// ─────────────────────────────────────────────────────────────────────────────

describe('a multi-project file against a single-project file', () => {
  it('excludes the repeated Activity ID from both sides and counts it', () => {
    const A = twoProjectCurrent(), B = oneProjectBaseline();
    const d = diffModels(A, B);
    // A1000 repeats in A, so it is ambiguous for the pair. A1010 matches;
    // A1020 is genuinely current-only. Nothing else can be said honestly.
    expect(d.counts.tasksMatched).toBe(1);        // A1010
    expect(d.counts.tasksAdded).toBe(1);          // A1020
    expect(d.counts.tasksDeleted).toBe(0);
    expect(d.counts.tasksAmbiguousA).toBe(2);     // both A1000 rows in A
    expect(d.counts.tasksAmbiguousB).toBe(1);     // B's A1000, excluded symmetrically
    expect(d.counts.ambiguousCodesA).toBe(1);
    expect(matchedIdentityCount(A, B)).toBe(1);
  });

  it('names the projects the repeat spans, without ever keying on them', () => {
    const ambiguity = resolveComparisonAmbiguity(twoProjectCurrent(), oneProjectBaseline());
    expect(ambiguity.a.projects.sort()).toEqual(['ALPHA', 'BRAVO']);
    expect(ambiguity.a.repeats).toHaveLength(1);
    expect(ambiguity.a.repeats[0].display).toBe('A1000');
    expect(ambiguity.a.repeats[0].rowCount).toBe(2);
  });

  it('reconciles on both sides', () => {
    const A = twoProjectCurrent(), B = oneProjectBaseline();
    const d = diffModels(A, B);
    expect(d.tasks.reconciliation.a.reconciles).toBe(true);
    expect(d.tasks.reconciliation.b.reconciles).toBe(true);
    expect(d.counts.tasksTotalA).toBe(getTable(A, 'TASK').length);
    expect(d.counts.tasksTotalB).toBe(getTable(B, 'TASK').length);
  });

  it('states the exclusion ABOVE the numbers, and prints the reconciliation', () => {
    const el = renderComparison({ A: twoProjectCurrent(), B: oneProjectBaseline() });
    const text = el.textContent;
    expect(text).toContain('Read this before the numbers');
    expect(text).toContain('1 Activity ID is repeated in the current export');
    expect(text).toContain('excluded from the comparison');
    expect(text).toContain('cover only the unambiguous remainder');
    expect(text).toContain('Repeated across: ALPHA, BRAVO');
    expect(text).toContain('Reconciliation — every row accounted for');
    expect(text).toContain('Current export: 1 matched + 1 added + 2 excluded as ambiguous + 0 with no Activity ID = 4 activity rows.');
    expect(text).toContain('Baseline export: 1 matched + 0 deleted + 1 excluded as ambiguous + 0 with no Activity ID = 2 activity rows.');
    // The disclosure comes before the KPI numbers in document order.
    expect(text.indexOf('Read this before the numbers')).toBeLessThan(text.indexOf('Activities matched'));
    // and every excluded row is listed rather than dropped
    expect(text).toContain('Activity rows excluded');
    expect(text).toContain('Activity A1000');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. EVERY PAIR SHAPE — the battery the heuristics kept failing
// ─────────────────────────────────────────────────────────────────────────────

/** Named pair shapes, including every shape the deleted scope code branched on. */
const SHAPES = {
  'single-project': () => oneProjectBaseline(),
  'single-project renamed': () => {
    const m = oneProjectBaseline();
    m.tables.PROJECT.records[0].proj_short_name = 'ALPHA - B2';
    m.tables.PROJWBS.records[0].wbs_name = 'Alpha Works - baseline copy';
    return m;
  },
  'two projects, named': () => twoProjectCurrent(),
  'two projects, renamed': () => {
    const m = twoProjectCurrent();
    for (const p of m.tables.PROJECT.records) p.proj_short_name += ' (rev C)';
    for (const w of m.tables.PROJWBS.records) w.wbs_name += ' (rev C)';
    return m;
  },
  'two projects, no Project ID': () => {
    const m = twoProjectCurrent();
    for (const p of m.tables.PROJECT.records) p.proj_short_name = '';
    return m;
  },
  'two projects sharing one Project ID': () => {
    const m = twoProjectCurrent();
    for (const p of m.tables.PROJECT.records) p.proj_short_name = 'SAME';
    return m;
  },
  'two projects named after their own proj_id': () => {
    // The input that made the deleted assertNoSurrogateTokens() throw and take
    // down all four Compare sections at once. It is a legitimate export: a
    // project may be named with digits.
    const m = twoProjectCurrent();
    for (const p of m.tables.PROJECT.records) p.proj_short_name = p.proj_id;
    for (const w of m.tables.PROJWBS.records) w.wbs_name = w.proj_id;
    return m;
  },
  'two projects, no PROJECT table': () => {
    const m = twoProjectCurrent();
    delete m.tables.PROJECT;
    return m;
  },
  'two projects, no WBS table': () => {
    const m = twoProjectCurrent();
    delete m.tables.PROJWBS;
    return m;
  },
  'no TASK table': () => ({ ermhdr: {}, tables: {} })
};

const SECTIONS = {
  'XER Comparison': renderComparison,
  'Period Reporting': renderPeriod,
  'Narrative Flip': renderFlip,
  'Half-Step': renderHalfStep
};

describe('every pair shape', () => {
  for (const [aName, buildA] of Object.entries(SHAPES)) {
    for (const [bName, buildB] of Object.entries(SHAPES)) {
      it(`${aName} vs ${bName}: matches exactly the unambiguous shared Activity IDs`, () => {
        const A = buildA(), B = buildB();
        const d = diffModels(A, B);

        // The expected answer, computed independently of the product: codes in
        // both files, minus any code repeated in either.
        const codes = m => getTable(m, 'TASK').map(t => String(t.task_code ?? '').trim()).filter(Boolean);
        const repeated = m => {
          const seen = new Map();
          for (const c of codes(m)) seen.set(c, (seen.get(c) || 0) + 1);
          return new Set([...seen].filter(([, n]) => n > 1).map(([c]) => c));
        };
        const bad = new Set([...repeated(A), ...repeated(B)]);
        const aSet = new Set(codes(A).filter(c => !bad.has(c)));
        const expected = [...new Set(codes(B).filter(c => !bad.has(c)))].filter(c => aSet.has(c)).length;

        expect(d.counts.tasksMatched).toBe(expected);
        expect(matchedIdentityCount(A, B)).toBe(expected);
      });

      it(`${aName} vs ${bName}: both sides reconcile`, () => {
        const A = buildA(), B = buildB();
        const d = diffModels(A, B);
        expect(d.tasks.reconciliation.a.reconciles).toBe(true);
        expect(d.tasks.reconciliation.b.reconciles).toBe(true);
        expect(d.counts.tasksMatched + d.counts.tasksAdded + d.counts.tasksAmbiguousA + d.counts.tasksNoIdentityA)
          .toBe(getTable(A, 'TASK').length);
        expect(d.counts.tasksMatched + d.counts.tasksDeleted + d.counts.tasksAmbiguousB + d.counts.tasksNoIdentityB)
          .toBe(getTable(B, 'TASK').length);
        // Relationships reconcile too, ambiguity included.
        expect(d.counts.relsAdded + d.counts.relsRetained + d.counts.relsAmbiguousA +
               d.counts.relsMalformedA + d.counts.relsDuplicateA)
          .toBe(getTableAliased(A, 'REL').length);
        expect(d.counts.relsDeleted + d.counts.relsRetained + d.counts.relsAmbiguousB +
               d.counts.relsMalformedB + d.counts.relsDuplicateB)
          .toBe(getTableAliased(B, 'REL').length);
      });

      it(`${aName} vs ${bName}: no key carries anything but the Activity ID`, () => {
        const A = buildA(), B = buildB();
        for (const m of [A, B]) {
          for (const t of getTable(m, 'TASK')) {
            expect(taskKey(t)).toBe(CODE_PREFIX + t.task_code);
          }
        }
      });

      it(`${aName} vs ${bName}: not one Compare section throws`, () => {
        // A guard that crashes the product on valid data is worse than the
        // defect it guards. Nothing in a render may throw on well-formed input.
        const A = buildA(), B = buildB();
        for (const [name, render] of Object.entries(SECTIONS)) {
          expect(() => render({ A, B }), `${name} threw on ${aName} vs ${bName}`).not.toThrow();
        }
      });

      it(`${aName} vs ${bName}: no section claims or offers a project scope`, () => {
        const A = buildA(), B = buildB();
        for (const [name, render] of Object.entries(SECTIONS)) {
          const text = render({ A, B }).textContent;
          for (const forbidden of ['scoped by', 'proj_short_name', 'proj_id', 'Multi-project comparison']) {
            expect(text.includes(forbidden), `${name} said "${forbidden}" on ${aName} vs ${bName}`).toBe(false);
          }
        }
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. THE DELETED RENDER-TIME THROW
// ─────────────────────────────────────────────────────────────────────────────

describe('a legitimate project name can no longer take down the Compare group', () => {
  it('a project named exactly its own proj_id renders in all four sections', () => {
    // assertNoSurrogateTokens() threw on precisely this, killing XER
    // Comparison, Period Reporting, Narrative Flip and Half-Step together.
    const A = SHAPES['two projects named after their own proj_id']();
    const B = oneProjectBaseline();
    B.tables.PROJECT.records[0].proj_short_name = '77';
    B.tables.PROJWBS.records[0].wbs_name = '77';
    for (const [name, render] of Object.entries(SECTIONS)) {
      let el;
      expect(() => { el = render({ A, B }); }, `${name} threw`).not.toThrow();
      expect(el.textContent.length).toBeGreaterThan(0);
    }
    // and the comparison still produces its honest answer
    const d = diffModels(A, B);
    expect(d.counts.tasksMatched).toBe(1);
    expect(d.tasks.reconciliation.a.reconciles).toBe(true);
  });

  it('the invariant that guard protected is now a TEST, not a runtime exception', () => {
    // "No key ever carries a proj_id" — enforced by construction and checked
    // here, where a violation fails a build instead of a customer's screen.
    const projIds = new Set();
    const models = Object.values(SHAPES).map(f => f());
    for (const m of models) for (const t of getTable(m, 'TASK')) projIds.add(String(t.proj_id));
    for (const m of models) {
      for (const t of getTable(m, 'TASK')) {
        const k = taskKey(t);
        if (k === null) continue;
        for (const pid of projIds) expect(k).not.toContain(`${pid}\u0000`);
        expect(k).toBe(CODE_PREFIX + t.task_code);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. NOTHING IS MERGED, NOTHING IS DROPPED
// ─────────────────────────────────────────────────────────────────────────────

describe('the ambiguous rows are kept, counted and listed', () => {
  /** Two projects repeating A1000, and nothing that could tell them apart. */
  function unnamedPair() {
    const A = twoProjectCurrent();
    const B = oneProjectBaseline();
    for (const p of A.tables.PROJECT.records) p.proj_short_name = '';
    for (const w of A.tables.PROJWBS.records) w.wbs_name = '';
    return [A, B];
  }

  it('every repeat is kept — no row is chosen to stand in for the others', () => {
    const [A, B] = unnamedPair();
    const d = diffModels(A, B);
    expect(d.counts.tasksAmbiguousA).toBe(2);
    expect(d.tasks.ambiguous.a.excludedRows.map(r => r.task_id).sort()).toEqual(['100', '102']);
    expect(repeatedTaskKeys(A).get('code:A1000')).toHaveLength(2);
    expect(ambiguousTaskRows(A)).toBe(2);
    const idx = indexTasks(A, resolveComparisonAmbiguity(A, B).keys);
    expect(idx.index.size + idx.ambiguous + idx.noIdentity).toBe(idx.total);
    expect(idx.total).toBe(getTable(A, 'TASK').length);
  });

  it('the screen states the count, names the fallback label, and lists the rows', () => {
    const [A, B] = unnamedPair();
    const el = renderComparison({ A, B });
    expect(kpi(el, 'Repeated Activity IDs')).toBe('1');
    expect(el.textContent).toContain('1 Activity ID is repeated in the current export');
    expect(el.textContent).toContain('2 current activity row(s) are excluded');
    // With no name in the file the label falls back to the proj_id — as a
    // LABEL. The keys are unaffected, which the shape battery above proves.
    expect(el.textContent).toContain('Repeated across: project 10, project 20');
    expect(el.textContent).toContain('Activity rows excluded');
    expect(el.textContent).toContain('Activity A1000');
  });

  it('rows with no identity at all are counted separately and never guessed at', () => {
    const [A, B] = unnamedPair();
    A.tables.TASK.records.push({ task_id: '', task_code: '', proj_id: '10', task_name: 'nothing to key on' });
    const d = diffModels(A, B);
    expect(d.counts.tasksNoIdentityA).toBe(1);
    expect(d.tasks.reconciliation.a.reconciles).toBe(true);
    expect(renderComparison({ A, B }).textContent)
      .toContain('1 activity row(s) carry neither an Activity ID nor an internal ID');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. THE REAL QA PAIR — the numbers this design is measured against.
//    QA-confirmed: 318 matching activity codes; 183 added / 63 deleted /
//    472 retained relationships.
// ─────────────────────────────────────────────────────────────────────────────

const QA_DIR = process.env.LENS_QA_XER_DIR || 'C:/Users/danaf/Downloads/.tmp.driveupload';
const QA_CURRENT = `${QA_DIR}/Georgian-College-current.xer`;
const QA_BASELINE = `${QA_DIR}/Georgian-College-baseline.xer`;
const HAVE_QA = existsSync(QA_CURRENT) && existsSync(QA_BASELINE);

/** Concatenate two models into ONE file — a genuine multi-project export. */
function mergeProjects(m1, m2) {
  const out = JSON.parse(JSON.stringify(m1));
  const src = JSON.parse(JSON.stringify(m2));
  for (const [name, tbl] of Object.entries(src.tables)) {
    if (!out.tables[name]) { out.tables[name] = tbl; continue; }
    out.tables[name].records.push(...tbl.records);
  }
  return out;
}

describe.skipIf(!HAVE_QA)('real QA pair — Georgian College current vs baseline', () => {
  const A = HAVE_QA ? parseXer(readFileSync(QA_CURRENT, 'latin1')) : null;
  const B = HAVE_QA ? parseXer(readFileSync(QA_BASELINE, 'latin1')) : null;

  it('is a real export pair — 405 vs 327 activities, no task_id in common', () => {
    expect(assertDivergentSurrogates(A, B, { minSharedCodes: 318 }))
      .toEqual({ sharedCodes: 318, sharedTaskIds: 0 });
    expect(getTable(A, 'TASK').length).toBe(405);
    expect(getTable(B, 'TASK').length).toBe(327);
  });

  it('NOT ONE project-level field survives between the two exports', () => {
    // Measured, not assumed. This is the whole reason no project field is read.
    expect(getTable(A, 'PROJECT')[0].proj_id).toBe('4795');
    expect(getTable(B, 'PROJECT')[0].proj_id).toBe('4799');
    expect(getTable(A, 'PROJECT')[0].proj_short_name).toBe('Georgian College');
    expect(getTable(B, 'PROJECT')[0].proj_short_name).toBe('Georgian College - B2');
    const root = m => getTable(m, 'PROJWBS').find(w => String(w.proj_node_flag).trim() === 'Y').wbs_name;
    expect(root(A)).toBe('Georgian College Building F Expansion (CURRENT - FIXED)');
    expect(root(B)).toBe('Georgian College - baseline - FOR ANALYSIS');
    // Every one of them differs, so scoping on any of them matches 0 of 318.
    expect(getTable(A, 'PROJECT')[0].proj_short_name).not.toBe(getTable(B, 'PROJECT')[0].proj_short_name);
    expect(root(A)).not.toBe(root(B));
  });

  it('matches the QA-confirmed 318, with nothing ambiguous', () => {
    expect(matchedIdentityCount(A, B)).toBe(318);
    const ambiguity = resolveComparisonAmbiguity(A, B);
    expect(ambiguity.any).toBe(false);
    expect(ambiguity.a.codeCount).toBe(0);
    expect(ambiguity.b.codeCount).toBe(0);
    expect(indexTasks(A).ambiguous).toBe(0);
    expect(indexTasks(B).ambiguous).toBe(0);
  });

  it('reports the QA-confirmed activity and relationship figures', () => {
    const d = diffModels(A, B);
    expect(d.counts.tasksMatched).toBe(318);
    expect(d.counts.tasksAdded).toBe(87);
    expect(d.counts.tasksDeleted).toBe(9);
    expect(d.counts.activitiesChanged).toBe(316);
    expect(d.counts.fieldChanges).toBe(1429);
    expect(d.counts.relsAdded).toBe(183);
    expect(d.counts.relsDeleted).toBe(63);
    expect(d.counts.relsRetained).toBe(472);
    expect(d.counts.relsLagChanged).toBe(4);
    expect(d.counts.relsAmbiguousA).toBe(0);
    expect(d.counts.relsAmbiguousB).toBe(0);
    // 318 + 87 = 405, 318 + 9 = 327. Every row lands somewhere.
    expect(d.tasks.reconciliation.a.reconciles).toBe(true);
    expect(d.tasks.reconciliation.b.reconciles).toBe(true);
  });

  it('shows NO disclosure card, and prints the reconciliation anyway', () => {
    const text = renderComparison({ A, B }).textContent;
    expect(text).not.toContain('Read this before the numbers');
    expect(text).not.toContain('Multi-project');
    expect(text).not.toContain('scoped by');
    expect(text).toContain('every Activity ID is unique within its file');
    expect(text).toContain('Current export: 318 matched + 87 added + 0 excluded as ambiguous + 0 with no Activity ID = 405 activity rows.');
    expect(text).toContain('Baseline export: 318 matched + 9 deleted + 0 excluded as ambiguous + 0 with no Activity ID = 327 activity rows.');
  });

  it('not one Compare section throws on the real pair', () => {
    for (const [name, render] of Object.entries(SECTIONS)) {
      expect(() => render({ A, B }), `${name} threw`).not.toThrow();
    }
  });
});

describe.skipIf(!HAVE_QA)('real QA files — the multi-project input the heuristics got wrong', () => {
  const A0 = HAVE_QA ? parseXer(readFileSync(QA_CURRENT, 'latin1')) : null;
  const B = HAVE_QA ? parseXer(readFileSync(QA_BASELINE, 'latin1')) : null;
  // The current project exported together with its baseline copy: ONE file,
  // TWO projects, and 318 Activity IDs repeated across them. The baseline copy
  // inside it is re-exported, so it shares no surrogate with the standalone
  // baseline file — the real condition, not one file compared with itself.
  const MULTI = HAVE_QA ? mergeProjects(A0, reexport(B)) : null;

  it('is a genuine multi-project file: 732 rows, 2 projects, 318 repeated Activity IDs', () => {
    expect(getTable(MULTI, 'TASK').length).toBe(732);
    expect(getTable(MULTI, 'PROJECT').map(p => p.proj_short_name))
      .toEqual(['Georgian College', 'Georgian College - B2']);
    expect(repeatedTaskKeys(MULTI).size).toBe(318);
    expect(assertDivergentSurrogates(MULTI, B, { minSharedCodes: 327 }))
      .toEqual({ sharedCodes: 327, sharedTaskIds: 0 });
  });

  it('states NO confident total over the ambiguous rows', () => {
    const d = diffModels(MULTI, B);
    // Heuristic 1 said 732 added / 327 deleted. Heuristic 2 said 405 added /
    // 0 deleted / 0 changed. Neither number can be produced now.
    expect(d.counts.tasksAdded).not.toBe(732);
    expect(d.counts.tasksAdded).not.toBe(405);
    expect(d.counts.tasksDeleted).not.toBe(327);
    // What it says instead: 636 of the 732 current rows and 318 of the 327
    // baseline rows carry a repeated Activity ID and are excluded. The verdict
    // covers only the 96 and 9 rows that remain.
    expect(d.counts.ambiguousCodesA).toBe(318);
    expect(d.counts.tasksAmbiguousA).toBe(636);
    expect(d.counts.tasksAmbiguousB).toBe(318);
    expect(d.counts.tasksMatched).toBe(9);
    expect(d.counts.tasksAdded).toBe(87);
    expect(d.counts.tasksDeleted).toBe(0);
  });

  it('reconciles: 9 + 87 + 636 + 0 = 732 and 9 + 0 + 318 + 0 = 327', () => {
    const d = diffModels(MULTI, B);
    expect(d.tasks.reconciliation.a.reconciles).toBe(true);
    expect(d.tasks.reconciliation.b.reconciles).toBe(true);
    expect(d.counts.tasksTotalA).toBe(732);
    expect(d.counts.tasksTotalB).toBe(327);
    expect(d.tasks.ambiguous.a.excludedRows).toHaveLength(636);
    expect(d.tasks.ambiguous.b.excludedRows).toHaveLength(318);
    // Relationships reconcile with the ambiguity term too.
    expect(d.counts.relsAdded + d.counts.relsRetained + d.counts.relsAmbiguousA +
           d.counts.relsMalformedA + d.counts.relsDuplicateA)
      .toBe(getTableAliased(MULTI, 'REL').length);
    expect(d.counts.relsDeleted + d.counts.relsRetained + d.counts.relsAmbiguousB +
           d.counts.relsMalformedB + d.counts.relsDuplicateB)
      .toBe(getTableAliased(B, 'REL').length);
  });

  it('discloses the ambiguity on screen, above the numbers, with the projects named', () => {
    const text = renderComparison({ A: MULTI, B }).textContent;
    expect(text).toContain('318 Activity IDs are repeated in the current export');
    expect(text).toContain('excluded from the comparison');
    expect(text).toContain('cover only the unambiguous remainder');
    expect(text).toContain('636 current activity row(s) are excluded');
    expect(text).toContain('Repeated across: Georgian College, Georgian College - B2');
    expect(text).toContain('Current export: 9 matched + 87 added + 636 excluded as ambiguous + 0 with no Activity ID = 732 activity rows.');
    expect(text).toContain('Baseline export: 9 matched + 0 deleted + 318 excluded as ambiguous + 0 with no Activity ID = 327 activity rows.');
    expect(text.indexOf('Read this before the numbers')).toBeLessThan(text.indexOf('Activities matched'));
    // and still no scope claim of any kind
    expect(text).not.toContain('scoped by');
    expect(text).not.toContain('Multi-project comparison');
  });

  it('not one Compare section throws on the multi-project input', () => {
    for (const [name, render] of Object.entries(SECTIONS)) {
      expect(() => render({ A: MULTI, B }), `${name} threw`).not.toThrow();
    }
  });

  it('Half-Step discloses the same exclusion and reconciles both sides', () => {
    const text = renderHalfStep({ A: MULTI, B }).textContent;
    expect(text).toContain('318 Activity IDs are repeated in the updated export');
    expect(text).toContain('Repeated across: Georgian College, Georgian College - B2');
    expect(text).toContain('Base export: 9 overlaid + 0 preserved (no counterpart in the updated export) + 318 excluded as ambiguous = 327 activity rows.');
    expect(text).toContain('Updated export: 9 overlaid + 87 with no counterpart in the base export + 636 excluded as ambiguous = 732 activity rows.');
    // 9 of a possible 327 is below the plausibility floor, so the file is
    // withheld. An honest refusal is the right worst case.
    expect(text).toContain('Half-Step withheld');
  });

  it('THE 405 / 405 CASE: the same file re-exported with the live project renamed', () => {
    // Reproduced against the previous source: heuristic 3 scoped this pair by
    // the one project name they still had in common and reported
    // 405 added AND 405 deleted on two files holding the same 732 activities.
    const LATER = reexport(MULTI, 500000);
    for (const p of LATER.tables.PROJECT.records) {
      if (p.proj_short_name === 'Georgian College') p.proj_short_name = 'Georgian College - Rev C';
    }
    for (const w of LATER.tables.PROJWBS.records) {
      if (String(w.proj_node_flag).trim() === 'Y' && /CURRENT/.test(String(w.wbs_name))) {
        w.wbs_name = `${w.wbs_name} Rev C`;
      }
    }
    expect(getTable(LATER, 'TASK').length).toBe(732);
    expect(identityOverlap(MULTI, LATER).sharedTaskIds).toBe(0);

    const d = diffModels(LATER, MULTI);
    expect(d.counts.tasksAdded).toBe(0);      // was 405
    expect(d.counts.tasksDeleted).toBe(0);    // was 405
    expect(d.counts.tasksMatched).toBe(96);   // the unambiguous remainder
    expect(d.counts.tasksAmbiguousA).toBe(636);
    expect(d.counts.tasksAmbiguousB).toBe(636);
    expect(d.tasks.reconciliation.a.reconciles).toBe(true);
    expect(d.tasks.reconciliation.b.reconciles).toBe(true);
    for (const [name, render] of Object.entries(SECTIONS)) {
      expect(() => render({ A: LATER, B: MULTI }), `${name} threw`).not.toThrow();
    }
  });
});
