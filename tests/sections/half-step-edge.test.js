// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { generateHalfStep, render } from '../../src/sections/half-step.js';
import { writeXer, parseXer } from '@criticalpathpartners/lens-parser';

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
const updatedModel = () => {
  const m = baseModel();
  m.tables.TASK.records[0].status_code = 'TK_Complete';
  m.tables.TASK.records[0].phys_complete_pct = '100';
  m.tables.TASK.records[0].remain_drtn_hr_cnt = '0';
  return m;
};

describe('Half-Step generator — edge cases never crash, output stays valid XER', () => {
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
    B.tables.TASK.records[0].status_code = 'TK_Complete';
    const out = generateHalfStep(A, B);
    // A says NotStart but copy-forward rule must NOT regress B's Complete
    expect(out.tables.TASK.records[0].status_code).toBe('TK_Complete');
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
