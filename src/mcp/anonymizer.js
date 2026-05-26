/**
 * Anonymize a parsed XER model. Strips activity/WBS names and similar
 * free-text fields, replacing them with stable opaque tokens
 * (ACT_0001, WBS_0001, etc.). Returns both the anonymized model and an
 * anon_map so the caller can restore the original strings locally after
 * receiving an MCP response.
 *
 * The map never leaves the browser — only the SHA-256 of it is sent to
 * the MCP for receipt validation.
 *
 * Fields stripped:
 *   TASK.task_name, TASK.task_memo (if present)
 *   PROJWBS.wbs_name, PROJWBS.wbs_short_name
 *   TASKMEMO.task_memo
 *   UDFVALUE.udf_text
 *   ACTVCODE.actv_code_name
 *
 * Fields PRESERVED (used as opaque identifiers):
 *   *_id, *_code, all dates, all durations, all status/type codes,
 *   relationship types and lags, calendar definitions.
 */

const STRIP_FIELDS = {
  TASK:     ['task_name', 'task_memo'],
  PROJWBS:  ['wbs_name', 'wbs_short_name'],
  TASKMEMO: ['task_memo'],
  UDFVALUE: ['udf_text'],
  ACTVCODE: ['actv_code_name']
};

const PREFIX = {
  TASK:     'ACT',
  PROJWBS:  'WBS',
  TASKMEMO: 'MEMO',
  UDFVALUE: 'UDF',
  ACTVCODE: 'CODE'
};

export function anonymizeModel(model) {
  const map = {};
  const out = JSON.parse(JSON.stringify(model));

  for (const [tableName, fieldList] of Object.entries(STRIP_FIELDS)) {
    const table = out.tables?.[tableName];
    if (!table?.records) continue;
    const prefix = PREFIX[tableName];
    let counter = 0;
    for (const rec of table.records) {
      counter++;
      const baseToken = `${prefix}_${String(counter).padStart(4, '0')}`;
      for (const f of fieldList) {
        if (rec[f] && rec[f] !== '') {
          const token = fieldList.length > 1 ? `${baseToken}_${f}` : baseToken;
          map[token] = rec[f];
          rec[f] = token;
        }
      }
    }
  }

  return { model: out, map };
}

export function deanonymizeRecords(records, map) {
  return records.map(rec => {
    const out = { ...rec };
    for (const [k, v] of Object.entries(out)) {
      if (typeof v === 'string' && map[v] != null) {
        out[k] = map[v];
      }
    }
    return out;
  });
}
