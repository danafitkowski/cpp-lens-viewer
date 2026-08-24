// @vitest-environment happy-dom
//
// REGRESSION SUITE — task_id vs task_code identity across comparison sections.
//
// P6 reassigns the internal surrogate task_id on every export; task_code (the
// Activity ID) is what stays put. Every fixture below therefore gives A and B
// DISJOINT task_id values while their task_code values match — the real-world
// condition. The previous fixtures handed both sides identical task_ids, which
// is why a green suite shipped a viewer that matched 0 of 318 activities,
// reported 655 added / 535 deleted relationships on a pair sharing 472, and
// called 410 of 410 activities a narrative flip.
//
// Every test here fails against the pre-fix source.
import { describe, it, expect } from 'vitest';
import { diffModels } from '../../src/sections/_shared/diff-models.js';
import {
  taskKey, resolveTaskKey, indexTasksByCode, ambiguousTaskRows, indexTasks,
  buildSurrogateKeyIndex, resolveRelEndpoints, indexRelsByCode
} from '../../src/sections/_shared/identity.js';
import { generateHalfStep, render as renderHalfStep, MIN_MATCH_RATIO } from '../../src/sections/half-step.js';
import { render as renderNarrativeFlip } from '../../src/sections/narrative-flip.js';
import { render as renderComparison } from '../../src/sections/xer-comparison.js';
import { assertDivergentSurrogates } from '../fixtures/reexport.js';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES — A and B share task_code, share NOTHING in task_id.
// ─────────────────────────────────────────────────────────────────────────────

function task(task_id, task_code, extra = {}) {
  return {
    task_id: String(task_id),
    task_code,
    task_name: `Activity ${task_code}`,
    proj_id: '1',
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

function rel(task_pred_id, pred_task_id, succ_task_id, pred_type = 'PR_FS') {
  return {
    task_pred_id: String(task_pred_id),
    task_id: String(succ_task_id),      // TASKPRED.task_id IS the successor
    pred_task_id: String(pred_task_id),
    pred_type,
    lag_hr_cnt: '0'
  };
}

const ACTVTYPE = [
  { actv_code_type_id: 'AT1', actv_code_type: 'Phase', proj_id: '1' },
  { actv_code_type_id: 'AT2', actv_code_type: 'Area',  proj_id: '1' }
];
const ACTVCODE = [
  { actv_code_id: 'AC1', actv_code_type_id: 'AT1', short_name: 'CIVIL', actv_code_name: 'Civil Works' },
  { actv_code_id: 'AC2', actv_code_type_id: 'AT1', short_name: 'ELEC',  actv_code_name: 'Electrical' },
  { actv_code_id: 'AC3', actv_code_type_id: 'AT2', short_name: 'NORTH', actv_code_name: 'North Zone' },
  { actv_code_id: 'AC4', actv_code_type_id: 'AT2', short_name: 'SOUTH', actv_code_name: 'South Zone' }
];

function wrap(tasks, rels, taskactv) {
  return {
    ermhdr: { raw: ['ERMHDR', '24.12', '2026-01-01', 'u', 'db', 'USD'] },
    tables: {
      PROJECT:  { fields: ['proj_id', 'proj_short_name'], records: [{ proj_id: '1', proj_short_name: 'IDENT' }] },
      PROJWBS:  { fields: ['wbs_id', 'parent_wbs_id', 'wbs_name', 'proj_id'], records: [{ wbs_id: 'W1', parent_wbs_id: '', wbs_name: 'Root', proj_id: '1' }] },
      TASK:     { fields: Object.keys(task(1, 'X')), records: tasks },
      TASKPRED: { fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'], records: rels },
      ACTVTYPE: { fields: ['actv_code_type_id', 'actv_code_type', 'proj_id'], records: ACTVTYPE },
      ACTVCODE: { fields: ['actv_code_id', 'actv_code_type_id', 'short_name', 'actv_code_name'], records: ACTVCODE },
      TASKACTV: { fields: ['task_id', 'actv_code_type_id', 'actv_code_id'], records: taskactv }
    }
  };
}

/** Current / updated export. Surrogates 100-104. */
function modelA() {
  return wrap(
    [
      task(100, 'A1000', { status_code: 'TK_Complete', phys_complete_pct: '100', remain_drtn_hr_cnt: '0',
                           act_start_date: '2026-01-05 08:00', act_end_date: '2026-01-09 17:00',
                           target_drtn_hr_cnt: '999' }),
      task(101, 'A1010', { status_code: 'TK_Active', phys_complete_pct: '50', remain_drtn_hr_cnt: '20',
                           act_start_date: '2026-01-12 08:00' }),
      task(102, 'A1020'),
      task(103, 'A1030'),
      task(104, 'A9000')                       // A-only: added scope
    ],
    [
      rel(1, 100, 101, 'PR_FS'),               // A1000 → A1010  retained
      rel(2, 101, 102, 'PR_FS'),               // A1010 → A1020  retained
      rel(3, 102, 103, 'PR_FS'),               // A1020 → A1030 FS  added (B has SS)
      rel(4, 103, 104, 'PR_FS')                // A1030 → A9000     added
    ],
    [
      { task_id: '100', actv_code_type_id: 'AT1', actv_code_id: 'AC1' }, // A1000 Phase=CIVIL (same as B)
      { task_id: '101', actv_code_type_id: 'AT1', actv_code_id: 'AC2' }, // A1010 Phase=ELEC  (was CIVIL) → flip 1
      { task_id: '102', actv_code_type_id: 'AT1', actv_code_id: 'AC2' }, // A1020 Phase=ELEC  (was CIVIL)
      { task_id: '102', actv_code_type_id: 'AT2', actv_code_id: 'AC4' }, // A1020 Area=SOUTH  (was NORTH) → flip 2
      { task_id: '104', actv_code_type_id: 'AT1', actv_code_id: 'AC2' }  // A9000 A-only, not a flip
    ]
  );
}

/**
 * Baseline / prior export of the SAME project. Surrogates 500-504 — disjoint
 * from A's 100-104 — and the TASK rows are in the opposite order, so nothing
 * can match by position either.
 */
function modelB() {
  return wrap(
    [
      task(504, 'A8000'),                      // B-only: deleted scope
      task(503, 'A1030'),
      task(502, 'A1020'),
      task(501, 'A1010'),
      task(500, 'A1000', { target_drtn_hr_cnt: '40' })
    ],
    [
      rel(1, 500, 501, 'PR_FS'),               // A1000 → A1010  retained
      rel(2, 501, 502, 'PR_FS'),               // A1010 → A1020  retained
      rel(3, 502, 503, 'PR_SS'),               // A1020 → A1030 SS  deleted (A has FS)
      rel(4, 503, 504, 'PR_FS')                // A1030 → A8000     deleted
    ],
    [
      { task_id: '500', actv_code_type_id: 'AT1', actv_code_id: 'AC1' }, // A1000 Phase=CIVIL
      { task_id: '501', actv_code_type_id: 'AT1', actv_code_id: 'AC1' }, // A1010 Phase=CIVIL
      { task_id: '502', actv_code_type_id: 'AT1', actv_code_id: 'AC1' }, // A1020 Phase=CIVIL
      { task_id: '502', actv_code_type_id: 'AT2', actv_code_id: 'AC3' }, // A1020 Area=NORTH
      { task_id: '504', actv_code_type_id: 'AT1', actv_code_id: 'AC1' }  // A8000 B-only
    ]
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
// FIXTURE SANITY — prove the fixtures are the real-world condition
// ─────────────────────────────────────────────────────────────────────────────

describe('fixture sanity: task_id disjoint, task_code shared', () => {
  it('A and B share ZERO task_id values but four task_code values', () => {
    const A = modelA(), B = modelB();
    // Shared refusal — the same precondition every two-model suite runs.
    expect(assertDivergentSurrogates(A, B, { minSharedCodes: 4 }))
      .toEqual({ sharedCodes: 4, sharedTaskIds: 0 });

    const aIds = new Set(A.tables.TASK.records.map(t => t.task_id));
    const bIds = new Set(B.tables.TASK.records.map(t => t.task_id));
    const idOverlap = [...aIds].filter(i => bIds.has(i));
    expect(idOverlap).toEqual([]);            // matching on task_id can only give 0

    const aCodes = new Set(A.tables.TASK.records.map(t => t.task_code));
    const bCodes = new Set(B.tables.TASK.records.map(t => t.task_code));
    const codeOverlap = [...aCodes].filter(c => bCodes.has(c)).sort();
    expect(codeOverlap).toEqual(['A1000', 'A1010', 'A1020', 'A1030']);
  });

  it('TASKPRED endpoints in each file point at that file own surrogates', () => {
    const B = modelB();
    const ids = new Set(B.tables.TASK.records.map(t => t.task_id));
    for (const r of B.tables.TASKPRED.records) {
      expect(ids.has(r.task_id)).toBe(true);
      expect(ids.has(r.pred_task_id)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE SHARED RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

describe('identity.js — one resolver, task_code first', () => {
  it('keys on task_code and reports matched_on', () => {
    const r = resolveTaskKey({ task_id: '100', task_code: 'A1000' });
    expect(r.matched_on).toBe('task_code');
    expect(r.display).toBe('A1000');
    expect(r.key).toBe('code:A1000');
  });

  it('falls back to task_id when there is genuinely no code, and SAYS so', () => {
    const r = resolveTaskKey({ task_id: '100', task_code: '   ' });
    expect(r.matched_on).toBe('task_id');   // honest degradation, not a silent drop
    expect(r.display).toBe('100');
    expect(r.key).toBe('id:100');
  });

  it('a numeric task_code cannot collide with a numeric task_id fallback', () => {
    expect(taskKey({ task_code: '1010' })).not.toBe(taskKey({ task_id: '1010' }));
  });

  it('indexTasksByCode matches every shared activity across renumbered exports', () => {
    const a = indexTasksByCode(modelA());
    const b = indexTasksByCode(modelB());
    let matched = 0;
    for (const k of a.keys()) if (b.has(k)) matched++;
    expect(matched).toBe(4);
  });

  it('resolves a relationship endpoint through its own TASK table', () => {
    const B = modelB();
    const idx = buildSurrogateKeyIndex(B);
    const info = resolveRelEndpoints(B.tables.TASKPRED.records[0], idx);
    expect(info.predCode).toBe('A1000');
    expect(info.succCode).toBe('A1010');
    expect(info.resolved).toBe(true);
    // The match key carries the LAG. Without it a re-lagged link reads as
    // "retained" and the diff reports no change on exactly the edit a forensic
    // reader is hunting for.
    expect(info.key).toBe('code:A1000::code:A1010::PR_FS::lag=0');
    // The lag-free pair identity is exposed separately so a re-lag can be named
    // as one changed link rather than an unrelated addition plus deletion.
    expect(info.pairKey).toBe('code:A1000::code:A1010::PR_FS');
    expect(info.lag).toBe('0');
    expect(info.lagHr).toBe(0);
  });

  it('the relationship key changes when only the lag changes', () => {
    const B = modelB();
    const idx = buildSurrogateKeyIndex(B);
    const row = B.tables.TASKPRED.records[0];
    const before = resolveRelEndpoints(row, idx);
    const after = resolveRelEndpoints({ ...row, lag_hr_cnt: '40' }, idx);
    expect(after.pairKey).toBe(before.pairKey);   // same link
    expect(after.key).not.toBe(before.key);       // different relationship
    expect(after.lagHr).toBe(40);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. RELATIONSHIPS  (was: 655 added / 535 deleted — every rel in both files)
// ─────────────────────────────────────────────────────────────────────────────

describe('diffModels relationships — keyed on resolved endpoint CODES', () => {
  it('reports 2 added / 2 deleted / 2 retained, not 4 / 4 / 0', () => {
    const d = diffModels(modelA(), modelB());
    expect(d.counts.relsRetained).toBe(2);
    expect(d.counts.relsAdded).toBe(2);
    expect(d.counts.relsDeleted).toBe(2);
  });

  it('added and deleted name the ACTIVITY IDs, not the export surrogates', () => {
    const d = diffModels(modelA(), modelB());
    const added = d.relationships.added.map(r => `${r.pred_code}->${r.succ_code} ${r.pred_type}`).sort();
    const deleted = d.relationships.deleted.map(r => `${r.pred_code}->${r.succ_code} ${r.pred_type}`).sort();
    expect(added).toEqual(['A1020->A1030 PR_FS', 'A1030->A9000 PR_FS']);
    expect(deleted).toEqual(['A1020->A1030 PR_SS', 'A1030->A8000 PR_FS']);
  });

  it('every relationship is accounted for — added + retained = A total, deleted + retained = B total', () => {
    const A = modelA(), B = modelB();
    const d = diffModels(A, B);
    expect(d.counts.relsAdded + d.counts.relsRetained).toBe(A.tables.TASKPRED.records.length);
    expect(d.counts.relsDeleted + d.counts.relsRetained).toBe(B.tables.TASKPRED.records.length);
  });

  it('an identical schedule re-exported shows ZERO relationship churn', () => {
    const A = modelA();
    const B = modelA();
    // Re-export: renumber every surrogate consistently, task_code untouched.
    for (const t of B.tables.TASK.records) t.task_id = String(Number(t.task_id) + 7000);
    for (const r of B.tables.TASKPRED.records) {
      r.task_id = String(Number(r.task_id) + 7000);
      r.pred_task_id = String(Number(r.pred_task_id) + 7000);
    }
    const d = diffModels(A, B);
    expect(d.counts.relsAdded).toBe(0);
    expect(d.counts.relsDeleted).toBe(0);
    expect(d.counts.relsRetained).toBe(4);
  });

  it('an unresolvable endpoint is COUNTED and kept, never silently dropped', () => {
    const A = modelA();
    A.tables.TASKPRED.records.push(rel(9, 100, 777, 'PR_FS')); // 777 has no TASK row
    const d = diffModels(A, modelB());
    expect(d.counts.relsUnresolvedA).toBe(1);
    // still present in the diff
    const kept = d.relationships.added.find(r => r.succ_code === '777');
    expect(kept).toBeTruthy();
    expect(kept.endpoints_resolved).toBe(false);
    expect(d.counts.relsAdded + d.counts.relsRetained).toBe(A.tables.TASKPRED.records.length);
  });

  it('a relationship naming no successor is COUNTED as malformed, never silently dropped', () => {
    const A = modelA();
    A.tables.TASKPRED.records.push({ task_pred_id: '9', pred_task_id: '100', pred_type: 'PR_FS', lag_hr_cnt: '0' });
    const d = diffModels(A, modelB());
    expect(d.counts.relsMalformedA).toBe(1);
    expect(d.counts.relsAdded + d.counts.relsRetained + d.counts.relsMalformedA)
      .toBe(A.tables.TASKPRED.records.length);
  });

  it('indexRelsByCode totals reconcile: index + malformed + duplicates = every row read', () => {
    const A = modelA();
    const idx = indexRelsByCode(A);
    expect(idx.total).toBe(A.tables.TASKPRED.records.length);
    expect(idx.index.size + idx.malformed + idx.duplicates).toBe(idx.total);
  });

  it('a duplicated relationship is COUNTED, not quietly overwritten', () => {
    const A = modelA();
    A.tables.TASKPRED.records.push(rel(5, 100, 101, 'PR_FS')); // same pred/succ/type as rel 1
    const idx = indexRelsByCode(A);
    expect(idx.duplicates).toBe(1);
    expect(idx.index.size + idx.malformed + idx.duplicates).toBe(idx.total);

    const d = diffModels(A, modelB());
    expect(d.counts.relsDuplicateA).toBe(1);
    expect(d.counts.relsAdded + d.counts.relsRetained + d.counts.relsDuplicateA)
      .toBe(A.tables.TASKPRED.records.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. HALF-STEP  (was: 0 matches of 318 — a base schedule wearing a new name)
// ─────────────────────────────────────────────────────────────────────────────

describe('Half-Step — matches on Activity ID across renumbered exports', () => {
  it('matches 4 of 4 shared activities, not 0', () => {
    const out = generateHalfStep(modelA(), modelB());
    expect(out._halfStepMeta.matched).toBe(4);
    expect(out._halfStepMeta.unmatchedInUpdated).toBe(1); // A9000
    expect(out._halfStepMeta.unmatchedInBase).toBe(1);    // A8000
  });

  it('overlays progress onto the row with the SAME Activity ID, not the same position', () => {
    const out = generateHalfStep(modelA(), modelB());
    const byCode = Object.fromEntries(out.tables.TASK.records.map(t => [t.task_code, t]));
    expect(byCode.A1000.status_code).toBe('TK_Complete');       // progress from A
    expect(byCode.A1000.phys_complete_pct).toBe('100');
    expect(byCode.A1010.status_code).toBe('TK_Active');
    expect(byCode.A1020.status_code).toBe('TK_NotStart');       // no progress in A
    expect(byCode.A1000.task_id).toBe('500');                   // B's surrogate survives
    expect(byCode.A1000.target_drtn_hr_cnt).toBe('40');         // B's plan survives (A said 999)
  });

  it('matched activities carry an Activity ID — none fell back to the surrogate', () => {
    const out = generateHalfStep(modelA(), modelB());
    expect(out._halfStepMeta.matchedOnSurrogate).toBe(0);
  });

  it('KPI names the key actually used — Activity ID, not task_id', () => {
    const el = renderHalfStep({ A: modelA(), B: modelB() });
    expect(kpi(el, 'Matched activities')).toBe('4');
    expect(el.textContent).toContain('Activity ID (task_code) found in both B and A');
    expect(el.textContent).not.toContain('task_id found in both B and A');
  });

  it('REFUSES to present a Half-Step when the match is implausibly low', () => {
    const A = modelA();
    const B = modelB();
    for (const t of B.tables.TASK.records) t.task_code = 'X' + t.task_code; // codes renumbered too
    const out = generateHalfStep(A, B);
    expect(out._halfStepMeta.matched).toBe(0);
    expect(out._halfStepMeta.implausible).toBe(true);

    const el = renderHalfStep({ A, B });
    expect(el.textContent).toContain('Half-Step withheld');
    const buttons = [...el.querySelectorAll('button')];
    const dl = buttons.find(b => /Half-Step XER/.test(b.textContent));
    expect(dl.disabled).toBe(true);          // the unusable file is not one click away
  });

  it('does NOT refuse on a healthy pair', () => {
    const out = generateHalfStep(modelA(), modelB());
    expect(out._halfStepMeta.implausible).toBe(false);
    expect(out._halfStepMeta.matchRatio).toBeGreaterThanOrEqual(MIN_MATCH_RATIO);
    const el = renderHalfStep({ A: modelA(), B: modelB() });
    expect(el.textContent).not.toContain('Half-Step withheld');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. NARRATIVE FLIP  (was: 410 flips / 0 unchanged — every activity a "flip")
// ─────────────────────────────────────────────────────────────────────────────

describe('Narrative Flip — code maps re-keyed onto the Activity ID', () => {
  it('reports 2 flips / 2 unchanged over 4 shared activities, not 5 flips / 0', () => {
    const el = renderNarrativeFlip({ A: modelA(), B: modelB() });
    expect(kpi(el, 'Total flips detected')).toBe('2');
    expect(kpi(el, 'Unchanged activities')).toBe('2');
    expect(kpi(el, 'Shared activities compared')).toBe('4');
  });

  it('flips + unchanged always equal the shared population', () => {
    const el = renderNarrativeFlip({ A: modelA(), B: modelB() });
    const flips = Number(kpi(el, 'Total flips detected'));
    const unchanged = Number(kpi(el, 'Unchanged activities'));
    expect(flips + unchanged).toBe(Number(kpi(el, 'Shared activities compared')));
  });

  it('severity is graded on real per-type changes', () => {
    const el = renderNarrativeFlip({ A: modelA(), B: modelB() });
    expect(kpi(el, 'High severity (≥ 3)')).toBe('0');
    expect(kpi(el, 'Medium severity (2)')).toBe('1');   // A1020: Phase AND Area moved
    expect(kpi(el, 'Low severity (1)')).toBe('1');      // A1010: Phase only
  });

  it('A-only and B-only activities are scope, not flips', () => {
    const el = renderNarrativeFlip({ A: modelA(), B: modelB() });
    expect(el.textContent).toContain('A-only 1');
    expect(el.textContent).toContain('B-only 1');
    expect(el.textContent).not.toContain('A9000');     // A-only, never in the flip table
    expect(el.textContent).not.toContain('A8000');     // B-only
  });

  it('the flip table shows Activity IDs and the codes that actually moved', () => {
    const el = renderNarrativeFlip({ A: modelA(), B: modelB() });
    const txt = el.textContent;
    expect(txt).toContain('A1010');
    expect(txt).toContain('A1020');
    expect(txt).toContain('CIVIL');
    expect(txt).toContain('ELEC');
    expect(txt).toContain('NORTH');
    expect(txt).toContain('SOUTH');
  });

  it('an identical schedule re-exported shows ZERO flips', () => {
    const A = modelA();
    const B = modelA();
    for (const t of B.tables.TASK.records) t.task_id = String(Number(t.task_id) + 7000);
    for (const r of B.tables.TASKPRED.records) {
      r.task_id = String(Number(r.task_id) + 7000);
      r.pred_task_id = String(Number(r.pred_task_id) + 7000);
    }
    for (const ta of B.tables.TASKACTV.records) ta.task_id = String(Number(ta.task_id) + 7000);
    const el = renderNarrativeFlip({ A, B });
    expect(kpi(el, 'Total flips detected')).toBe('0');
    expect(kpi(el, 'Unchanged activities')).toBe('5');
    expect(kpi(el, 'Shared activities compared')).toBe('5');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. HONEST DEGRADATION — a row with no Activity ID is kept AND labelled
// ─────────────────────────────────────────────────────────────────────────────

describe('honest degradation — fall back to task_id, and say so', () => {
  it('Half-Step keeps a code-less activity and counts the surrogate match', () => {
    const A = modelA();
    const B = modelB();
    // Same activity, no Activity ID in either file, same surrogate in both.
    A.tables.TASK.records.push(task(900, ''));
    B.tables.TASK.records.push(task(900, ''));
    const out = generateHalfStep(A, B);
    expect(out._halfStepMeta.matched).toBe(5);            // 4 by code + 1 by surrogate
    expect(out._halfStepMeta.matchedOnSurrogate).toBe(1); // and it is declared

    const el = renderHalfStep({ A, B });
    expect(el.textContent).toContain('matched on internal task_id (no Activity ID)');
  });

  it('Narrative Flip labels a code-less activity rather than passing it off as an Activity ID', () => {
    const A = modelA();
    const B = modelB();
    A.tables.TASK.records.push(task(900, ''));
    B.tables.TASK.records.push(task(900, ''));
    A.tables.TASKACTV.records.push({ task_id: '900', actv_code_type_id: 'AT1', actv_code_id: 'AC2' });
    B.tables.TASKACTV.records.push({ task_id: '900', actv_code_type_id: 'AT1', actv_code_id: 'AC1' });
    const el = renderNarrativeFlip({ A, B });
    expect(kpi(el, 'Shared activities compared')).toBe('5');
    expect(kpi(el, 'Total flips detected')).toBe('3');
    expect(el.textContent).toContain('900 (internal ID — no Activity ID)');
  });

  it('Narrative Flip counts code assignments whose task_id has no TASK row', () => {
    const A = modelA();
    A.tables.TASKACTV.records.push({ task_id: '888', actv_code_type_id: 'AT1', actv_code_id: 'AC2' });
    const el = renderNarrativeFlip({ A, B: modelB() });
    expect(el.textContent).toContain('1 code assignments reference a task_id with no');
    // and the shared population is untouched — the orphan was not silently merged in
    expect(kpi(el, 'Shared activities compared')).toBe('4');
  });

  it('a repeated Activity ID inside one file is reported, not quietly lost', () => {
    const A = modelA();
    A.tables.TASK.records.push(task(910, 'A1020')); // same Activity ID twice in A

    // BOTH rows of the repeat are ambiguous, not just the second one. Letting
    // the first row keep the slot would silently pick one of two activities to
    // represent both — the guess this design exists to refuse.
    expect(ambiguousTaskRows(A)).toBe(2);
    const idx = indexTasks(A);
    expect(idx.index.has('code:A1020')).toBe(false);
    expect(idx.index.size + idx.ambiguous + idx.noIdentity).toBe(idx.total);

    // The exclusion is symmetric: B's single A1020 is excluded too, so B cannot
    // report a deletion about an activity A demonstrably holds.
    const B = modelB();
    const d = diffModels(A, B);
    expect(d.counts.tasksAmbiguousA).toBe(2);
    expect(d.counts.tasksAmbiguousB).toBe(1);
    expect(d.counts.ambiguousCodesA).toBe(1);
    expect(d.tasks.deleted.map(t => t.task_code)).toEqual(['A8000']);
    expect(d.tasks.changed.some(c => c.task_code === 'A1020')).toBe(false);
    expect(d.tasks.reconciliation.a.reconciles).toBe(true);
    expect(d.tasks.reconciliation.b.reconciles).toBe(true);

    const out = generateHalfStep(A, modelB());
    expect(out._halfStepMeta.ambiguousIdentities).toBe(2);
    expect(out._halfStepMeta.ambiguousIdentitiesBase).toBe(1);
    expect(out._halfStepMeta.matched + out._halfStepMeta.ambiguousIdentitiesBase +
           out._halfStepMeta.unmatchedInBase).toBe(out._halfStepMeta.bCount);

    const el = renderNarrativeFlip({ A, B: modelB() });
    expect(el.textContent).toContain('repeated in the current export');
    expect(el.textContent).toContain('excluded from the comparison');
  });

  it('Narrative Flip says the answer is degraded when a TASK table is missing', () => {
    const A = modelA();
    const B = modelB();
    delete B.tables.TASK;
    const el = renderNarrativeFlip({ A, B });
    expect(el.textContent).toContain('Degraded');
  });

  /**
   * Internal match-key prefixes. NO \b ANCHOR — that is what made the earlier
   * version of this guard blind. textContent concatenates adjacent cells, so a
   * leaked key normally lands straight after a word character ("IDENTcode:A1020"
   * in the excluded-rows table) and \bcode: cannot match it. Planted the leak
   * and watched the guard report clean; without the anchor it fails as it must.
   */
  const KEY_LEAKS = [/code:[A-Za-z0-9]/, /\bid:[0-9]/, /unresolved:[0-9]/, /ambiguous:[A-Za-z0-9]/];

  it('the key-leak guard can actually fire', () => {
    // A detector that matches nothing reports clean forever. Prove it matches
    // the exact shape a leak takes, in the exact position textContent puts it.
    const leaked = 'FileProjectActivity IDInternal IDNamecurrentIDENTcode:A1020102Activity A1020';
    expect(KEY_LEAKS.some(re => re.test(leaked))).toBe(true);
    expect(KEY_LEAKS.some(re => re.test('IDENTunresolved:888'))).toBe(true);
    expect(KEY_LEAKS.some(re => re.test('IDENTambiguous:910::A1020'))).toBe(true);
    // and does not fire on the legitimate prose that mentions the column name
    expect(KEY_LEAKS.some(re => re.test('Activity ID (task_code) found in both B and A'))).toBe(false);
  });

  it('no internal match key ever reaches the screen', () => {
    // Keys are prefixed for collision safety and are meaningless to a reader.
    const A = modelA();
    const B = modelB();
    delete B.tables.TASK;                                        // force the degraded path
    A.tables.TASKACTV.records.push({ task_id: '888', actv_code_type_id: 'AT1', actv_code_id: 'AC2' });
    const withRepeat = modelA();
    withRepeat.tables.TASK.records.push(task(910, 'A1020'));       // forces ambiguous keys
    const noCode = modelA();
    noCode.tables.TASK.records.push(task(920, ''));                // forces an id: fallback key
    for (const el of [
      renderNarrativeFlip({ A, B }),
      renderNarrativeFlip({ A: modelA(), B: modelB() }),
      renderNarrativeFlip({ A: withRepeat, B: modelB() }),
      renderNarrativeFlip({ A: noCode, B: modelB() }),
      renderHalfStep({ A: modelA(), B: modelB() }),
      renderHalfStep({ A: withRepeat, B: modelB() }),
      renderComparison({ A: withRepeat, B: modelB() }),
      renderComparison({ A: noCode, B: modelB() })
    ]) {
      for (const re of KEY_LEAKS) expect(el.textContent).not.toMatch(re);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ACTIVITY-LEVEL DIFF across renumbered exports
// ─────────────────────────────────────────────────────────────────────────────

describe('diffModels activities — one added, one deleted, not five and five', () => {
  it('scope change is A9000 in / A8000 out', () => {
    const d = diffModels(modelA(), modelB());
    expect(d.tasks.added.map(t => t.task_code)).toEqual(['A9000']);
    expect(d.tasks.deleted.map(t => t.task_code)).toEqual(['A8000']);
    expect(d.counts.tasksAdded).toBe(1);
    expect(d.counts.tasksDeleted).toBe(1);
  });

  it('field changes carry the Activity ID and how the row was matched', () => {
    const d = diffModels(modelA(), modelB());
    const statusChange = d.tasks.changed.find(c => c.task_code === 'A1000' && c.field === 'status_code');
    expect(statusChange).toBeTruthy();
    expect(statusChange.before).toBe('TK_NotStart');
    expect(statusChange.after).toBe('TK_Complete');
    expect(statusChange.matched_on).toBe('task_code');
  });
});
