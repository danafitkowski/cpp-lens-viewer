// @vitest-environment happy-dom
//
// Stored-XSS regression guard. An XER is untrusted input: a malicious or
// careless schedule can carry markup in any free-text field (task_name,
// wbs_name, project name, resource name, …). The viewer must render those as
// inert text, never as live DOM. This proves it across the sections that
// display the most field text, and fails loudly if a future change ever pipes
// field data through innerHTML / an SVG markup string / a javascript: URL.
import { describe, it, expect, beforeEach } from 'vitest';
import { SECTIONS } from '../../src/sections/_registry.js';

// A spread of classic payloads in every field a section might render.
const XSS = '<script>window.__xss=1</script><img src=x onerror="window.__xss=1">';
const JS_URL = 'javascript:window.__xss=1';

function poisonedModel() {
  const tbl = (records) => ({ fields: Object.keys(records[0]), records });
  return {
    ermhdr: { version: '24.12', export_date: '2026-01-01', user: XSS, database: XSS, currency: 'USD' },
    filename: XSS,
    tables: {
      PROJECT:  tbl([{ proj_id: '1', proj_short_name: XSS, proj_long_name: XSS, last_recalc_date: '2026-01-01 08:00', plan_end_date: '2026-06-01 17:00' }]),
      PROJWBS:  tbl([{ wbs_id: '10', proj_id: '1', wbs_name: XSS, wbs_short_name: XSS, parent_wbs_id: '' }]),
      TASK:     tbl([
        { task_id: '1000', task_code: XSS, task_name: XSS, wbs_id: '10', clndr_id: '1', task_type: 'TT_Task', status_code: 'TK_NotStart', target_drtn_hr_cnt: '40', total_float_hr_cnt: '0', target_start_date: '2026-01-01 08:00', target_end_date: '2026-01-07 17:00', cstr_type: XSS, cstr_date: JS_URL },
        { task_id: '1001', task_code: 'A2', task_name: JS_URL, wbs_id: '10', clndr_id: '1', task_type: 'TT_Mile', status_code: 'TK_Complete', target_drtn_hr_cnt: '0', total_float_hr_cnt: '8', target_start_date: '2026-01-08 08:00', target_end_date: '2026-01-08 17:00' },
      ]),
      TASKPRED: tbl([{ task_pred_id: '1', task_id: '1001', pred_task_id: '1000', proj_id: '1', pred_type: 'PR_FS', lag_hr_cnt: '0' }]),
      RSRC:     tbl([{ rsrc_id: '1', rsrc_name: XSS, rsrc_short_name: XSS, rsrc_title_name: XSS, rsrc_type: 'RT_Labor' }]),
      TASKRSRC: tbl([{ taskrsrc_id: '1', task_id: '1000', rsrc_id: '1', target_qty: '40' }]),
      CALENDAR: tbl([{ clndr_id: '1', clndr_name: XSS, day_hr_cnt: '8', clndr_data: '' }]),
      ACTVTYPE: tbl([{ actv_code_type_id: '1', actv_code_type: XSS }]),
      ACTVCODE: tbl([{ actv_code_id: '1', actv_code_type_id: '1', short_name: XSS, actv_code_name: XSS }]),
      TASKACTV: tbl([{ task_id: '1000', actv_code_id: '1', actv_code_type_id: '1' }]),
      UDFTYPE:  tbl([{ udf_type_id: '1', udf_type_label: XSS, table_name: 'TASK', logical_data_type: 'UDF_TEXT' }]),
      UDFVALUE: tbl([{ udf_type_id: '1', fk_id: '1000', udf_text: XSS }]),
    },
  };
}

describe('stored-XSS safety — untrusted XER field text never becomes live DOM', () => {
  const A = poisonedModel();

  beforeEach(() => { delete window.__xss; });

  for (const section of SECTIONS) {
    it(`${section.id} renders XSS payloads inert`, () => {
      let el;
      expect(() => { el = section.render({ A, B: null }); }).not.toThrow();

      // 1. No <script> element was ever created from field data.
      expect(el.querySelectorAll('script').length, `${section.id} created a <script>`).toBe(0);
      // 2. No element carries an onerror/onload handler attribute from the payload.
      expect(el.querySelector('[onerror], [onload]'), `${section.id} created an event-handler element`).toBeNull();
      // 3. No <img src=x> smuggled in from the payload.
      const imgs = [...el.querySelectorAll('img')];
      expect(imgs.some(i => (i.getAttribute('src') || '') === 'x'), `${section.id} created a payload <img>`).toBe(false);
      // 4. No anchor/resource with a javascript: URL sourced from field data.
      const jsUrls = [...el.querySelectorAll('a[href], [src]')]
        .some(n => /^javascript:/i.test(n.getAttribute('href') || n.getAttribute('src') || ''));
      expect(jsUrls, `${section.id} created a javascript: URL`).toBe(false);
    });
  }

  it('the payload script never executes during rendering', () => {
    for (const section of SECTIONS) {
      try { section.render({ A, B: null }); } catch { /* covered above */ }
    }
    expect(window.__xss).toBeUndefined();
  });
});
