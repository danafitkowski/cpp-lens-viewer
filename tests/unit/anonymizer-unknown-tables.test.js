import { describe, it, expect } from 'vitest';
import { anonymizeModel } from '../../src/mcp/anonymizer.js';

// ---------------------------------------------------------------------------
// The generic sweep for tables the hand-maintained STRIP_FIELDS list does not
// know (added 2026-08-28).
//
// The list-based scrubber had a fail-open hole: any table not in the list
// passed through with every field verbatim. It was not hypothetical — POBS is
// not in the list, its pobs_name / pobs_descr carry the org chart in plain
// text, and the viewer ships a separate manual "POBS Cleaner" button precisely
// because of it. A user who ran the anonymizer and NOT the POBS button handed
// a third party an "anonymized" XER with the org chart intact.
//
// The sweep tokenizes, in unknown tables, every field whose NAME matches the
// prose/identity pattern (_name, _descr, _memo, _url, email, phone, guid, ...)
// and leaves ids, dates, durations and codes alone.
// ---------------------------------------------------------------------------

function modelWithUnknownTable(name, fields, records) {
  return {
    ermhdr: ['ERMHDR', '19.12', '2024-01-01', 'Project', 'admin',
             'User Name', 'dbxdb', 'Project Management', 'USD'],
    tables: {
      [name]: { fields, records: records.map(r => ({ ...r })) },
    },
  };
}

describe('anonymizer — generic sweep over unknown tables', () => {
  it('tokenizes pobs_name and pobs_descr in a POBS table (the real leak)', () => {
    const m = modelWithUnknownTable('POBS',
      ['pobs_id', 'parent_pobs_id', 'pobs_name', 'pobs_descr'],
      [{ pobs_id: '1', parent_pobs_id: '', pobs_name: 'Northgate Builders Ltd',
         pobs_descr: 'Head office - commercial division' }]);
    const { model, map } = anonymizeModel(m);
    const rec = model.tables.POBS.records[0];
    expect(rec.pobs_name).not.toContain('Northgate');
    expect(rec.pobs_descr).not.toContain('Head office');
    // ids survive untouched
    expect(rec.pobs_id).toBe('1');
    // and the map can restore both
    expect(map[rec.pobs_name]).toBe('Northgate Builders Ltd');
    expect(map[rec.pobs_descr]).toBe('Head office - commercial division');
  });

  it('leaves non-identifying fields of unknown tables alone', () => {
    const m = modelWithUnknownTable('FUTURETBL',
      ['ftbl_id', 'seq_num', 'start_date', 'qty_cnt'],
      [{ ftbl_id: '7', seq_num: '3', start_date: '2024-05-01', qty_cnt: '12' }]);
    const { model } = anonymizeModel(m);
    expect(model.tables.FUTURETBL.records[0]).toEqual(
      { ftbl_id: '7', seq_num: '3', start_date: '2024-05-01', qty_cnt: '12' });
  });

  it('sweeps email/phone/url shaped fields wherever they appear', () => {
    const m = modelWithUnknownTable('CONTACTS',
      ['contact_id', 'contact_email', 'office_phone', 'proj_url'],
      [{ contact_id: '9', contact_email: 'jw@northgate.example',
         office_phone: '555-0100', proj_url: 'https://northgate.example/p6' }]);
    const { model } = anonymizeModel(m);
    const rec = model.tables.CONTACTS.records[0];
    expect(rec.contact_email).not.toContain('northgate');
    expect(rec.office_phone).not.toContain('555');
    expect(rec.proj_url).not.toContain('northgate');
    expect(rec.contact_id).toBe('9');
  });

  it('known tables keep their curated field list (no double handling)', () => {
    // TASK is in STRIP_FIELDS: task_name is scrubbed by the curated path and
    // the sweep must not run over it a second time with a different token.
    const m = {
      ermhdr: ['ERMHDR', '19.12', '2024-01-01', 'Project', 'admin',
               'User Name', 'dbxdb', 'Project Management', 'USD'],
      tables: {
        TASK: {
          fields: ['task_id', 'task_code', 'task_name'],
          records: [{ task_id: '1', task_code: 'A1000', task_name: 'Pour footing F3' }],
        },
      },
    };
    const { model, map } = anonymizeModel(m);
    const rec = model.tables.TASK.records[0];
    expect(rec.task_name).not.toContain('footing');
    expect(map[rec.task_name]).toBe('Pour footing F3');
    expect(rec.task_code).toBe('A1000');
  });
});
