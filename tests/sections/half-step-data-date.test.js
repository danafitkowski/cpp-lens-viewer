// @vitest-environment happy-dom
//
// The Half-Step file must carry the UPDATE's data date, say what it is, and be
// named after the file the visitor loaded.
//
// The generator overlays five TASK progress fields onto a copy of the base
// schedule and never touched PROJECT, so the download kept the BASE schedule's
// data date while carrying the update's progress. Measured on the public
// demonstration pair: the export kept 2025-04-01 where the update's data date
// is 2025-07-01, with 83 completed activities overlaid. On the clean worked
// example pair it kept 2025-02-03 instead of 2025-03-31. The page gave no
// instruction that the file still had to be scheduled in P6.
//
// AACE RP 29R-03 MIP 3.4 describes the half-step as the prior update statused
// with the current update's progress and recalculated at the current data
// date. The viewer does not recalculate, so the honest deliverable is the
// overlay with the right data date plus a plain instruction to schedule it.
//
// The download was also named after the project INSIDE the file
// (proj_short_name), which is how a client's name ended up in a filename the
// visitor never chose.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, generateHalfStep, halfStepFilename } from '../../src/sections/half-step.js';
import { writeXer, parseXer } from '@criticalpathpartners/lens-parser';
import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';

const BASE_DD = '2026-02-02 08:00';
const UPDATE_DD = '2026-03-02 08:00';

function task(task_id, task_code, extra = {}) {
  return {
    task_id: String(task_id),
    task_code,
    task_name: `Activity ${task_code}`,
    proj_id: '1',
    status_code: 'TK_NotStart',
    phys_complete_pct: '0',
    target_drtn_hr_cnt: '40',
    remain_drtn_hr_cnt: '40',
    act_start_date: '',
    act_end_date: '',
    ...extra
  };
}

/** Base / prior export. Its PROJECT row carries its own data date. */
function base() {
  const tasks = [task(10, 'H100'), task(11, 'H110'), task(12, 'H120')];
  return {
    ermhdr: { raw: ['ERMHDR', '24.12', '2026-02-02', 'Project', 'u', 'User', 'db', 'Project Management', 'USD'] },
    filename: 'Site Baseline 01.xer',
    tables: {
      PROJECT: {
        fields: ['proj_id', 'proj_short_name', 'last_recalc_date', 'scd_end_date'],
        records: [{ proj_id: '1', proj_short_name: 'CONFIDENTIAL CLIENT', last_recalc_date: BASE_DD, scd_end_date: '2026-04-30 17:00' }]
      },
      TASK: { fields: Object.keys(tasks[0]), records: tasks },
      TASKPRED: {
        fields: ['task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'],
        records: [{ task_pred_id: '1', task_id: '11', pred_task_id: '10', pred_type: 'PR_FS', lag_hr_cnt: '0' }]
      }
    }
  };
}

/** The update: a separate, later export. H100 finished, H110 in progress. */
function update() {
  const A = reexport(base(), 5000);
  A.filename = 'Site Update 07.xer';
  A.tables.PROJECT.records[0].last_recalc_date = UPDATE_DD;
  const byCode = (c) => A.tables.TASK.records.find(t => t.task_code === c);
  Object.assign(byCode('H100'), { status_code: 'TK_Complete', remain_drtn_hr_cnt: '0',
                                  act_start_date: '2026-02-02 08:00', act_end_date: '2026-02-06 17:00' });
  Object.assign(byCode('H110'), { status_code: 'TK_Active', remain_drtn_hr_cnt: '16', act_start_date: '2026-02-23 08:00' });
  return A;
}

describe('Half-Step fixture', () => {
  it('is two separate exports of one schedule', () => {
    const overlap = assertDivergentSurrogates(update(), base(), { minSharedCodes: 3 });
    expect(overlap.sharedTaskIds).toBe(0);
  });
});

describe('Half-Step carries the update\'s data date', () => {
  it('the exported PROJECT row holds the update\'s data date, not the base schedule\'s', () => {
    const out = generateHalfStep(update(), base());
    expect(out.tables.PROJECT.records[0].last_recalc_date).toBe(UPDATE_DD);
  });

  it('the written XER parses back with that data date', () => {
    const back = parseXer(writeXer(generateHalfStep(update(), base())));
    expect(back.tables.PROJECT.records[0].last_recalc_date).toBe(UPDATE_DD);
    // and the rest of the base PROJECT row is untouched
    expect(back.tables.PROJECT.records[0].scd_end_date).toBe('2026-04-30 17:00');
  });

  it('does not mutate the base model it was given', () => {
    const B = base();
    generateHalfStep(update(), B);
    expect(B.tables.PROJECT.records[0].last_recalc_date).toBe(BASE_DD);
  });

  it('records both data dates for the page to show', () => {
    const meta = generateHalfStep(update(), base())._halfStepMeta;
    expect(meta.dataDateBase).toBe(BASE_DD);
    expect(meta.dataDateUpdated).toBe(UPDATE_DD);
    expect(meta.dataDateCarried).toBe(true);
  });

  it('keeps the base data date, and says so, when the update states none', () => {
    const A = update();
    A.tables.PROJECT.records[0].last_recalc_date = '';
    const out = generateHalfStep(A, base());
    expect(out.tables.PROJECT.records[0].last_recalc_date).toBe(BASE_DD);
    expect(out._halfStepMeta.dataDateCarried).toBe(false);
    const el = render({ A, B: base() });
    expect(el.querySelector('.lens-half-step-instruction').textContent)
      .toMatch(/states no data date, so the file keeps the base schedule's, 2026-02-02/);
  });

  it('writes the data date even when the base PROJECT table never declared the column', () => {
    const B = base();
    B.tables.PROJECT.fields = ['proj_id', 'proj_short_name'];
    delete B.tables.PROJECT.records[0].last_recalc_date;
    const back = parseXer(writeXer(generateHalfStep(update(), B)));
    expect(back.tables.PROJECT.records[0].last_recalc_date).toBe(UPDATE_DD);
  });
});

describe('Half-Step tells the visitor what to do with the file', () => {
  it('the section says: import, confirm the data date, schedule (F9), the viewer does not recalculate', () => {
    const el = render({ A: update(), B: base() });
    const text = el.querySelector('.lens-half-step-instruction').textContent;
    expect(text).toMatch(/import/i);
    expect(text).toContain('confirm the data date reads 2026-03-02');
    expect(text).toContain('schedule (F9)');
    expect(text).toMatch(/does not recalculate/);
    expect(text).toContain('2026-02-02');           // the base data date it replaced
    expect(text).not.toContain('—');
  });

  it('the download preview carries the same instruction', () => {
    const el = render({ A: update(), B: base() });
    [...el.querySelectorAll('button')].find(b => b.textContent === 'Show preview').click();
    const preview = el.querySelector('.lens-half-step-preview').textContent;
    expect(preview).toContain('Data date in this file: 2026-03-02');
    expect(preview).toContain('schedule (F9)');
    expect(preview).toMatch(/does not recalculate/);
  });

  it('warns when the update\'s data date is earlier than the base schedule\'s', () => {
    // The two files loaded the wrong way round.
    const A = update();
    A.tables.PROJECT.records[0].last_recalc_date = '2026-01-05 08:00';
    const el = render({ A, B: base() });
    expect(el.querySelector('.lens-half-step-instruction').textContent)
      .toMatch(/earlier than the base schedule's/);
  });
});

describe('Half-Step download is named after the loaded file', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('uses the updated file\'s own name, not the project name inside it', () => {
    expect(halfStepFilename(update())).toBe('Site-Update-07-half-step.xer');
  });

  it('strips any extension the viewer accepts, and path characters', () => {
    expect(halfStepFilename({ filename: 'update.XML' })).toBe('update-half-step.xer');
    expect(halfStepFilename({ filename: 'plan v2.mpp' })).toBe('plan-v2-half-step.xer');
    // separators and leading dots go; what is left cannot name another folder
    expect(halfStepFilename({ filename: '..\\evil/../name.xer' })).toBe('evil..name-half-step.xer');
  });

  it('falls back to a neutral name when the model has no filename', () => {
    expect(halfStepFilename({ filename: '' })).toBe('schedule-half-step.xer');
    expect(halfStepFilename(null)).toBe('schedule-half-step.xer');
  });

  it('the button downloads under that name, and the project name appears nowhere in it', () => {
    const anchors = [];
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') { anchors.push(el); el.click = vi.fn(); }
      return el;
    });
    if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test';
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

    const el = render({ A: update(), B: base() });
    [...el.querySelectorAll('button')].find(b => /Download Half-Step XER/.test(b.textContent)).click();
    expect(anchors.length).toBe(1);
    expect(anchors[0].download).toBe('Site-Update-07-half-step.xer');
    expect(anchors[0].download.toLowerCase()).not.toContain('confidential');
  });
});
