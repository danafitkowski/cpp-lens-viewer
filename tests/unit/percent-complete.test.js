// An activity's percent complete depends on its P6 percent complete type.
//
// The viewer used to read phys_complete_pct for every activity. P6 only keeps
// that field current on Physical-type activities; Duration is P6's default
// type, and on a Duration-type activity the stored physical percent is
// normally 0 from the first day to the last. A finished activity therefore
// read 0%. Measured on the public demonstration schedule: 404 of 405
// activities are Duration type, a WBS node with 12 of 12 activities complete
// rolled up to 0.0%, and 57 of 81 "Completed this period" rows read +0.0%.
//
// Every expected value below is worked by hand in the comment beside it.
import { describe, it, expect } from 'vitest';
import { percentComplete, describeProgressBasis } from '../../src/sections/_shared/percent-complete.js';

function task(extra = {}) {
  return {
    status_code: 'TK_Active',
    complete_pct_type: 'CP_Drtn',
    phys_complete_pct: '0',
    target_drtn_hr_cnt: '40',
    remain_drtn_hr_cnt: '40',
    act_work_qty: '0',
    remain_work_qty: '0',
    act_equip_qty: '0',
    remain_equip_qty: '0',
    ...extra
  };
}

describe('percentComplete: Duration type (CP_Drtn)', () => {
  it('is original minus remaining, over original', () => {
    // (40 - 10) / 40 = 0.75
    expect(percentComplete(task({ remain_drtn_hr_cnt: '10' })).pct).toBe(75);
  });

  it('ignores the stored physical percent', () => {
    // (80 - 60) / 80 = 0.25, whatever phys_complete_pct says
    expect(percentComplete(task({ target_drtn_hr_cnt: '80', remain_drtn_hr_cnt: '60', phys_complete_pct: '90' })).pct).toBe(25);
  });

  it('floors at 0 when remaining exceeds original, as P6 does', () => {
    // (40 - 60) / 40 = -0.5, shown by P6 as 0%
    expect(percentComplete(task({ remain_drtn_hr_cnt: '60' })).pct).toBe(0);
  });

  it('caps at 100', () => {
    // (40 - -8) / 40 = 1.2
    expect(percentComplete(task({ remain_drtn_hr_cnt: '-8' })).pct).toBe(100);
  });

  it('is 0 for an unfinished zero-duration activity, not a division by zero', () => {
    const r = percentComplete(task({ target_drtn_hr_cnt: '0', remain_drtn_hr_cnt: '0' }));
    expect(r.pct).toBe(0);
  });

  it('is 0 when the remaining duration is blank', () => {
    expect(percentComplete(task({ remain_drtn_hr_cnt: '' })).pct).toBe(0);
  });
});

describe('percentComplete: a completed activity is 100 whatever its type says', () => {
  it('Duration type with a stale remaining duration', () => {
    expect(percentComplete(task({ status_code: 'TK_Complete', remain_drtn_hr_cnt: '40' })).pct).toBe(100);
  });

  it('Physical type whose stored percent was never set', () => {
    expect(percentComplete(task({ status_code: 'TK_Complete', complete_pct_type: 'CP_Phys', phys_complete_pct: '0' })).pct).toBe(100);
  });

  it('a completed zero-duration milestone', () => {
    expect(percentComplete(task({ status_code: 'TK_Complete', target_drtn_hr_cnt: '0', remain_drtn_hr_cnt: '0' })).pct).toBe(100);
  });
});

describe('percentComplete: Physical type (CP_Phys)', () => {
  it('is the stored physical percent, not the duration ratio', () => {
    // duration ratio would be (40 - 10) / 40 = 75; the scheduler typed 30
    const r = percentComplete(task({ complete_pct_type: 'CP_Phys', phys_complete_pct: '30', remain_drtn_hr_cnt: '10' }));
    expect(r.pct).toBe(30);
    expect(r.basis).toBe('physical');
  });

  it('keeps decimals', () => {
    expect(percentComplete(task({ complete_pct_type: 'CP_Phys', phys_complete_pct: '37.5' })).pct).toBe(37.5);
  });
});

describe('percentComplete: Units type (CP_Units)', () => {
  it('is actual units over actual plus remaining units', () => {
    // 30 / (30 + 90) = 0.25
    const r = percentComplete(task({ complete_pct_type: 'CP_Units', act_work_qty: '30', remain_work_qty: '90' }));
    expect(r.pct).toBe(25);
    expect(r.basis).toBe('units');
  });

  it('adds labor and nonlabor units together', () => {
    // (10 + 10) / (10 + 10 + 20 + 40) = 20 / 80 = 0.25
    const r = percentComplete(task({
      complete_pct_type: 'CP_Units',
      act_work_qty: '10', act_equip_qty: '10', remain_work_qty: '20', remain_equip_qty: '40'
    }));
    expect(r.pct).toBe(25);
  });

  it('falls back to the duration rule when the activity carries no units', () => {
    // no units at all; (40 - 30) / 40 = 0.25
    const r = percentComplete(task({ complete_pct_type: 'CP_Units', remain_drtn_hr_cnt: '30' }));
    expect(r.pct).toBe(25);
    expect(r.basis).toBe('units-as-duration');
  });
});

describe('percentComplete: a file that states no type', () => {
  it('reads the stored percent and says so', () => {
    const t = task({ phys_complete_pct: '50', remain_drtn_hr_cnt: '10' });
    delete t.complete_pct_type;
    const r = percentComplete(t);
    expect(r.pct).toBe(50);
    expect(r.basis).toBe('unstated');
  });
});

describe('describeProgressBasis', () => {
  it('counts the activities under each rule and states the completed rule', () => {
    const text = describeProgressBasis([
      task(), task(), task(),
      task({ complete_pct_type: 'CP_Phys' }),
      task({ complete_pct_type: 'CP_Units', act_work_qty: '1', remain_work_qty: '1' })
    ]);
    expect(text).toContain('3 by duration');
    expect(text).toContain('1 by physical');
    expect(text).toContain('1 by units');
    expect(text).toMatch(/completed activity counts as 100%/i);
    // house style: no em dash in anything a visitor reads
    expect(text).not.toContain('—');
  });

  it('names a units-type activity that had to be read by duration', () => {
    const text = describeProgressBasis([task({ complete_pct_type: 'CP_Units' })]);
    expect(text).toMatch(/1 units-type activity carries no units and is read by duration/);
  });

  it('names activities whose file states no type', () => {
    const t = task();
    delete t.complete_pct_type;
    expect(describeProgressBasis([t])).toMatch(/1 activity states no percent complete type/);
  });
});
