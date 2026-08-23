import { describe, it, expect } from 'vitest';
import { anonymizeModel, deanonymizeRecords, ANON_STRIP_FIELDS } from '../../src/mcp/anonymizer.js';
import { writeXer, parseXer } from '@criticalpathpartners/lens-parser';

// Every identifying value carries a distinctive "LEAK_" sentinel. After
// anonymizeModel + writeXer (exactly what the Deep Forensic modal uploads),
// NONE of these may survive into the bytes that leave the browser.
const SENTINEL = 'LEAK_';

function fullModel() {
  const tbl = (records) => ({ fields: Object.keys(records[0]), records });
  return {
    ermhdr: {
      raw: ['ERMHDR', '24.12', '2026-01-01', 'Project', 'LEAK_user', 'LEAK_projectdb', 'db', 'Project Management', 'USD'],
      version: '24.12', export_date: '2026-01-01',
      user: 'LEAK_user', database: 'LEAK_projectdb', currency: 'USD',
    },
    filename: 'secret-client.xer',
    tables: {
      PROJECT:  tbl([{ proj_id: '1', proj_short_name: 'LEAK_pshort', proj_long_name: 'LEAK_plong', proj_url: 'LEAK_url', web_site: 'LEAK_site', last_recalc_date: '2026-01-01 08:00' }]),
      PROJWBS:  tbl([{ wbs_id: '10', proj_id: '1', wbs_name: 'LEAK_wbsname', wbs_short_name: 'LEAK_wbsshort' }]),
      // create_user/update_user are the P6 edit stamps. Real exports carry the
      // scheduler's login or full display name here on EVERY row. The original
      // fixture omitted the columns entirely, which is why the leak detector
      // reported clean while the field shipped verbatim to the server.
      TASK:     tbl([{ task_id: '1000', task_code: 'A100', task_name: 'LEAK_taskname', task_memo: 'LEAK_taskmemo', status_code: 'TK_NotStart', target_drtn_hr_cnt: '40', create_user: 'LEAK_createuser', update_user: 'LEAK_updateuser' }]),
      // TASKPRED is deliberately NOT in STRIP_FIELDS: it holds no free text of
      // its own, only join keys. It still carries the edit stamps, so it proves
      // the sweep reaches tables the per-table map never lists.
      TASKPRED: tbl([{ task_pred_id: '1', task_id: '1000', pred_task_id: '1001', pred_type: 'PR_FS', lag_hr_cnt: '0', create_user: 'LEAK_predcreateuser', update_user: 'LEAK_predupdateuser' }]),
      TASKMEMO: tbl([{ memo_id: '1', task_id: '1000', task_memo: 'LEAK_notebooktext' }]),
      MEMOTYPE: tbl([{ memo_type_id: '1', memo_type: 'LEAK_memotopic' }]),
      UDFTYPE:  tbl([{ udf_type_id: '1', udf_type_label: 'LEAK_udflabel', udf_type_name: 'LEAK_udftypename', table_name: 'TASK' }]),
      UDFVALUE: tbl([{ udf_type_id: '1', fk_id: '1000', udf_text: 'LEAK_udftext' }]),
      ACTVTYPE: tbl([{ actv_code_type_id: '1', actv_code_type: 'LEAK_codetype' }]),
      ACTVCODE: tbl([{ actv_code_id: '1', actv_code_type_id: '1', short_name: 'ENG', actv_code_name: 'LEAK_codename' }]),
      RSRC:     tbl([{ rsrc_id: '1', rsrc_short_name: 'LEAK_rsrcshort', rsrc_name: 'LEAK_rsrcname', rsrc_title_name: 'LEAK_rsrctitle', email_addr: 'LEAK_email', office_phone: 'LEAK_phone', guid: 'LEAK_guid' }]),
      CALENDAR: tbl([{ clndr_id: '1', clndr_name: 'LEAK_calname', day_hr_cnt: '8', clndr_data: '() 0||CalendarData()' }]),
      OBS:      tbl([{ obs_id: '1', obs_name: 'LEAK_obsname', obs_descr: 'LEAK_obsdescr' }]),
      ROLES:    tbl([{ role_id: '1', role_name: 'LEAK_rolename', role_short_name: 'LEAK_roleshort' }]),
      PCATVAL:  tbl([{ proj_catg_id: '1', proj_catg_name: 'LEAK_pcatname', proj_catg_short_name: 'LEAK_pcatshort' }]),
      RCATVAL:  tbl([{ rsrc_catg_id: '1', rsrc_catg_name: 'LEAK_rcatname', rsrc_catg_short_name: 'LEAK_rcatshort' }]),
      ACCOUNT:  tbl([{ acct_id: '1', acct_name: 'LEAK_acctname', acct_short_name: 'LEAK_acctshort', acct_descr: 'LEAK_acctdescr' }]),
      RISKTYPE: tbl([{ risk_type_id: '1', risk_type: 'LEAK_risktype' }]),
      RISK:     tbl([{ risk_id: '1', risk_name: 'LEAK_riskname', risk_desc: 'LEAK_riskdesc' }]),
      TASKPROC: tbl([{ proc_id: '1', task_id: '1000', proc_name: 'LEAK_procname', proc_descr: 'LEAK_procdescr' }]),
      PCATTYPE: tbl([{ proj_catg_type_id: '1', proj_catg_type: 'LEAK_pcattype' }]),
      RCATTYPE: tbl([{ rsrc_catg_type_id: '1', rsrc_catg_type: 'LEAK_rcattype' }]),
    },
  };
}

describe('anonymizer leak detector — no identifying value reaches the wire', () => {
  it('no sentinel survives anonymize → writeXer (the exact upload path)', () => {
    const { model } = anonymizeModel(fullModel());
    const wire = writeXer(model);
    const hits = wire.split('\n')
      .map((line, i) => ({ i, line }))
      .filter(({ line }) => line.includes(SENTINEL));
    expect(
      hits,
      `LEAK survived to upload bytes on lines: ${hits.map(h => `${h.i}:${h.line.slice(0, 80)}`).join(' | ')}`
    ).toHaveLength(0);
  });

  it('scrubs the ERMHDR identity line (user + project/db name)', () => {
    const { model } = anonymizeModel(fullModel());
    const wire = writeXer(model);
    const header = wire.split('\n')[0];
    expect(header.startsWith('ERMHDR')).toBe(true);
    expect(header).not.toContain('LEAK_user');
    expect(header).not.toContain('LEAK_projectdb');
    // version + currency (non-identifying) are preserved.
    expect(header).toContain('24.12');
    expect(header).toContain('USD');
  });

  it('FX-001: 9-field ERMHDR project name does not leak via the currency slot (real parseXer path)', () => {
    // Go through the REAL parser: parseHeader positionally labels a legacy
    // 6-field header, so on a 9-field export ermhdr.currency becomes the PROJECT
    // NAME. anonymize + writeXer is the exact upload path — the name must not survive.
    const xer = [
      'ERMHDR\t24.12\t2026-01-01\tProject\tLEAK_exportuser\tLEAK_SECRETPROJECT\tdb\tProject Management\tCAD',
      '%T\tPROJECT',
      '%F\tproj_id\tproj_short_name\tproj_long_name',
      '%R\t1\tPS\tProject Sample',
      '%E',
    ].join('\n') + '\n';
    const model = parseXer(xer, { filename: 'client.xer' });
    const { model: anon } = anonymizeModel(model);
    const wire = writeXer(anon);
    const header = wire.split('\n')[0];
    expect(wire).not.toContain('LEAK_SECRETPROJECT'); // project name never leaves the browser
    expect(wire).not.toContain('LEAK_exportuser');
    expect(header).toContain('CAD');                   // true currency (last slot) preserved
    expect(header.startsWith('ERMHDR')).toBe(true);
  });

  it('strips the project name (PROJECT.proj_long_name / proj_short_name)', () => {
    const { model, map } = anonymizeModel(fullModel());
    const p = model.tables.PROJECT.records[0];
    expect(p.proj_long_name).not.toContain(SENTINEL);
    expect(p.proj_short_name).not.toContain(SENTINEL);
    expect(p.proj_id).toBe('1'); // join key preserved
    // original recoverable locally
    expect(Object.values(map)).toContain('LEAK_plong');
  });

  it('strips P6 edit stamps (create_user / update_user) on every table', () => {
    const { model, map } = anonymizeModel(fullModel());
    const task = model.tables.TASK.records[0];
    const pred = model.tables.TASKPRED.records[0];

    expect(task.create_user).not.toContain(SENTINEL);
    expect(task.update_user).not.toContain(SENTINEL);
    // TASKPRED is not in STRIP_FIELDS; the global sweep must still reach it.
    expect(pred.create_user).not.toContain(SENTINEL);
    expect(pred.update_user).not.toContain(SENTINEL);

    // Join keys on that same row survive untouched.
    expect(pred.task_id).toBe('1000');
    expect(pred.pred_type).toBe('PR_FS');

    // Recoverable locally, like every other scrubbed value.
    expect(Object.values(map)).toContain('LEAK_createuser');
    expect(Object.values(map)).toContain('LEAK_predupdateuser');
  });

  it('gives one token per distinct editor, not one per row', () => {
    const model = fullModel();
    const rows = model.tables.TASK.records;
    for (let i = 0; i < 5; i++) {
      rows.push({ ...rows[0], task_id: String(2000 + i), task_code: `B${i}`,
                  create_user: 'LEAK_sameperson', update_user: 'LEAK_sameperson' });
    }
    const { model: anon } = anonymizeModel(model);
    const tokens = new Set(anon.tables.TASK.records.slice(1).map(r => r.create_user));
    expect(tokens.size).toBe(1);
    expect([...tokens][0]).not.toContain(SENTINEL);
  });

  it('strips resource names (people / company) in RSRC', () => {
    const { model } = anonymizeModel(fullModel());
    const r = model.tables.RSRC.records[0];
    expect(r.rsrc_name).not.toContain(SENTINEL);
    expect(r.rsrc_short_name).not.toContain(SENTINEL);
    expect(r.rsrc_title_name).not.toContain(SENTINEL);
    expect(r.rsrc_id).toBe('1'); // join key preserved
  });

  it('preserves structural join keys + work patterns (analysis still works)', () => {
    const { model } = anonymizeModel(fullModel());
    expect(model.tables.TASK.records[0].task_code).toBe('A100');
    expect(model.tables.TASK.records[0].status_code).toBe('TK_NotStart');
    expect(model.tables.ACTVCODE.records[0].short_name).toBe('ENG');
    expect(model.tables.CALENDAR.records[0].clndr_data).toContain('CalendarData');
  });

  it('round-trips: every stripped field restores from the map', () => {
    const original = fullModel();
    const { model, map } = anonymizeModel(original);
    for (const [tableName, fields] of Object.entries(ANON_STRIP_FIELDS)) {
      const table = model.tables[tableName];
      if (!table) continue;
      const restored = deanonymizeRecords(table.records, map);
      for (const f of fields) {
        const orig = original.tables[tableName].records[0][f];
        if (orig) expect(restored[0][f]).toBe(orig);
      }
    }
  });

  it('every STRIP_FIELDS table that exists in the model is fully covered', () => {
    // Guard: if a new identifying field is added to a record but not to
    // ANON_STRIP_FIELDS, the leak test above catches it. This asserts the
    // table list itself stayed in sync with the fullModel fixture.
    const m = fullModel();
    for (const tableName of Object.keys(ANON_STRIP_FIELDS)) {
      expect(m.tables[tableName], `fixture missing coverage for ${tableName}`).toBeDefined();
    }
  });
});
