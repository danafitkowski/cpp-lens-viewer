// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { generateHalfStep, render } from '../../src/sections/half-step.js';
import { writeXer, parseXer } from '@criticalpathpartners/lens-parser';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

// FIXTURE CONDITION — baseModel() and updatedModel() used to be the same two
// rows with the same task_id values ('1000', '1001'), so "matched 2 of 2" held
// for a Half-Step that keyed on the surrogate. updatedModel() is now a genuine
// later export: every surrogate renumbered, every Activity ID kept, TASKPRED
// endpoints renumbered with them.

const baseModel = () => ({
  ermhdr: { raw: ['ERMHDR','24.12','2026-01-01','u','db','USD'] },
  tables: {
    PROJECT: { fields:['proj_id','proj_short_name'], records:[{ proj_id:'1', proj_short_name:'DEMO' }] },
    TASK: { fields:['task_id','task_code','task_name','status_code','phys_complete_pct','remain_drtn_hr_cnt'],
      records:[
        { task_id:'1000', task_code:'A1', task_name:'Mobilize', status_code:'TK_NotStart', phys_complete_pct:'0', remain_drtn_hr_cnt:'40' },
        { task_id:'1001', task_code:'A2', task_name:'Pour', status_code:'TK_NotStart', phys_complete_pct:'0', remain_drtn_hr_cnt:'80' },
      ]},
    TASKPRED: { fields:['task_pred_id','task_id','pred_task_id','pred_type'], records:[{ task_pred_id:'1', task_id:'1001', pred_task_id:'1000', pred_type:'PR_FS' }] },
  },
});
/**
 * The same schedule as a LATER export sees it: surrogates renumbered by the
 * shared re-export builder, Activity IDs untouched, A1 finished.
 */
const updatedModel = () => {
  const m = reexport(baseModel(), 4000);
  const a1 = byCode(m, 'A1');
  a1.status_code = 'TK_Complete';
  a1.phys_complete_pct = '100';
  a1.remain_drtn_hr_cnt = '0';
  return m;
};

/** Address a row by its stable Activity ID — the re-export reversed row order. */
function byCode(model, code) {
  return model.tables.TASK.records.find(t => t.task_code === code);
}

describe('Half-Step generator — edge cases never crash, output stays valid XER', () => {
  it('fixture sanity: updated and base share Activity IDs and no task_id', () => {
    const overlap = assertDivergentSurrogates(updatedModel(), baseModel(), { minSharedCodes: 2 });
    expect(overlap.sharedTaskIds).toBe(0);
    expect(overlap.sharedCodes).toBe(2);
  });

  it('happy path overlays progress, preserves base structure, round-trips', () => {
    const out = generateHalfStep(updatedModel(), baseModel());
    expect(out._halfStepMeta.matched).toBe(2);
    expect(out.tables.TASK.records[0].status_code).toBe('TK_Complete'); // progress overlaid
    expect(out.tables.TASK.records[0].task_name).toBe('Mobilize');      // structure from base
    // generated XER must parse back cleanly (writeXer is TSV-safe)
    const back = parseXer(writeXer(out));
    expect(back.tables.TASK.records.length).toBe(2);
  });

  it('never regresses status back to TK_NotStart', () => {
    const A = baseModel(); // updated is all NotStart
    const B = updatedModel(); // base happens to have a Complete
    byCode(B, 'A1').status_code = 'TK_Complete';
    const out = generateHalfStep(A, B);
    // A says NotStart but copy-forward rule must NOT regress B's Complete
    expect(byCode(out, 'A1').status_code).toBe('TK_Complete');
  });

  it('A has no TASK table → all base tasks preserved, no crash', () => {
    const A = { tables: {} };
    const out = generateHalfStep(A, baseModel());
    expect(out._halfStepMeta.matched).toBe(0);
    expect(out._halfStepMeta.unmatchedInBase).toBe(2);
    expect(() => writeXer(out)).not.toThrow();
  });

  it('B has no TASK table → empty result, no crash', () => {
    const out = generateHalfStep(updatedModel(), { ermhdr: {}, tables: {} });
    expect(out._halfStepMeta.matched).toBe(0);
    expect(() => writeXer(out)).not.toThrow();
  });

  it('both empty models → no crash, valid (minimal) XER', () => {
    const out = generateHalfStep({ tables: {} }, { tables: {} });
    expect(() => parseXer(writeXer(out))).not.toThrow();
  });

  it('base with no ermhdr still produces a valid XER header', () => {
    const B = baseModel(); delete B.ermhdr;
    const out = generateHalfStep(updatedModel(), B);
    const xer = writeXer(out);
    expect(xer.startsWith('ERMHDR')).toBe(true);
  });

  it('render() returns empty-state without both models, never throws', () => {
    expect(() => render({ A: null, B: null })).not.toThrow();
    expect(() => render({ A: updatedModel(), B: null })).not.toThrow();
    const el = render({ A: updatedModel(), B: baseModel() });
    expect(el.textContent).toContain('Half-Step');
  });
});
