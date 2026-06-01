/**
 * Anonymize a parsed XER model before it leaves the browser for the Deep
 * Forensic MCP. Replaces every identifying free-text field — names,
 * descriptions, titles, labels — with a stable opaque token (ACT_0001,
 * RSRC_0003, …) and scrubs the ERMHDR identity line. Returns the anonymized
 * model plus an `anon_map` (token → original) that NEVER leaves the browser;
 * only the SHA-256 of the map is sent to the MCP for receipt validation.
 *
 * Privacy contract: after anonymizeModel(), serializing the model with
 * writeXer() must contain NONE of the original name/description/label/identity
 * strings. The leak-detector test (tests/unit/anonymizer-leak.test.js) proves
 * this with sentinel values and fails loudly if a new identifying field is
 * ever added to the schema without being added here.
 *
 * What is STRIPPED (identifying free text):
 *   ERMHDR        export user + project/database name (the header identity line)
 *   PROJECT       proj_short_name, proj_long_name              (project name)
 *   PROJWBS       wbs_name, wbs_short_name                     (WBS labels)
 *   TASK          task_name, task_memo                         (activity names)
 *   TASKMEMO      task_memo                                    (notebook text)
 *   MEMOTYPE      memo_type                                    (notebook topics)
 *   UDFTYPE       udf_type_label                               (UDF field labels)
 *   UDFVALUE      udf_text                                     (UDF free text)
 *   ACTVTYPE      actv_code_type                               (code-type names)
 *   ACTVCODE      actv_code_name                               (code descriptions)
 *   RSRC          rsrc_name, rsrc_short_name, rsrc_title_name  (people/company)
 *   CALENDAR      clndr_name                                   (calendar names)
 *   OBS           obs_name                                     (org/people)
 *   ROLES         role_name, role_short_name                   (role names)
 *   PCATVAL       proj_catg_name, proj_catg_short_name         (project categories)
 *   RCATVAL       rsrc_catg_name, rsrc_catg_short_name         (resource categories)
 *
 * What is PRESERVED (opaque structural keys the forensic analysis joins on,
 * and non-identifying numerics): all *_id, activity/relationship codes used as
 * join keys (task_code, *_short_name where it's an ID), every date, duration,
 * float, status code, type code, constraint, lag, and calendar work-pattern
 * (clndr_data). LIMITATION, disclosed: structural codes are kept verbatim; if
 * an org embeds client names directly inside task_code or an *_id, that token
 * is preserved as a join key and is not scrubbed.
 */

// table → [identifying free-text fields to tokenize]
const STRIP_FIELDS = {
  PROJECT:  ['proj_short_name', 'proj_long_name', 'proj_url', 'web_site'],
  PROJWBS:  ['wbs_name', 'wbs_short_name'],
  TASK:     ['task_name', 'task_memo'],
  TASKMEMO: ['task_memo'],
  MEMOTYPE: ['memo_type'],
  UDFTYPE:  ['udf_type_label', 'udf_type_name'],
  UDFVALUE: ['udf_text'],
  ACTVTYPE: ['actv_code_type'],
  ACTVCODE: ['actv_code_name'],
  RSRC:     ['rsrc_name', 'rsrc_short_name', 'rsrc_title_name', 'email_addr', 'office_phone', 'guid'],
  CALENDAR: ['clndr_name'],
  OBS:      ['obs_name', 'obs_descr'],
  ROLES:    ['role_name', 'role_short_name'],
  PCATVAL:  ['proj_catg_name', 'proj_catg_short_name'],
  RCATVAL:  ['rsrc_catg_name', 'rsrc_catg_short_name'],
  // FX-002: tables P6 also emits with identifying free text / PII that the
  // original 15-table list missed (confirmed leaking verbatim into upload bytes).
  ACCOUNT:  ['acct_name', 'acct_short_name', 'acct_descr'],
  RISKTYPE: ['risk_type'],
  RISK:     ['risk_name', 'risk_desc'],
  TASKPROC: ['proc_name', 'proc_descr'],
  PCATTYPE: ['proj_catg_type'],
  RCATTYPE: ['rsrc_catg_type'],
};

// Short, stable token prefixes per table. Falls back to the table name.
const PREFIX = {
  PROJECT: 'PROJ', PROJWBS: 'WBS', TASK: 'ACT', TASKMEMO: 'MEMO',
  MEMOTYPE: 'MTYP', UDFTYPE: 'UDFT', UDFVALUE: 'UDF', ACTVTYPE: 'ATYP',
  ACTVCODE: 'CODE', RSRC: 'RSRC', CALENDAR: 'CAL', OBS: 'OBS',
  ROLES: 'ROLE', PCATVAL: 'PCAT', RCATVAL: 'RCAT',
  ACCOUNT: 'ACCT', RISKTYPE: 'RTYP', RISK: 'RISK', TASKPROC: 'PROC',
  PCATTYPE: 'PCTT', RCATTYPE: 'RCTT',
};

function prefixFor(tableName) {
  return PREFIX[tableName] || tableName.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'X';
}

/**
 * Scrub the ERMHDR identity line. The header carries the P6 export username
 * and the project/database name — both identifying. We rebuild a neutral
 * 9-field ERMHDR keeping only the non-identifying version / export date /
 * currency, and we neutralize BOTH the `raw` array (which writeXer emits
 * verbatim when present) AND every named field across the XER and XML model
 * shapes, so no header identity survives regardless of writeXer's branch.
 */
function scrubErmhdr(ermhdr, map) {
  if (!ermhdr || typeof ermhdr !== 'object') return ermhdr;
  const raw = Array.isArray(ermhdr.raw) ? ermhdr.raw : null;
  const version    = ermhdr.version    || (raw && raw[1]) || '';
  const exportDate = ermhdr.export_date || ermhdr.exportdate || (raw && raw[2]) || '';
  // FX-001: currency is the LAST ERMHDR field. parseHeader positionally labels a
  // legacy 6-field header, so on a modern 9-field export `ermhdr.currency` is
  // actually the PROJECT NAME. Derive currency from the true raw slot by length
  // and never trust the named field when raw is present — otherwise the project
  // name leaks into neutralRaw[8] and uploads to the server.
  const currency = raw
    ? (raw.length >= 9 ? (raw[8] || '') : (raw.length === 6 ? (raw[5] || '') : ''))
    : (ermhdr.currency || '');

  // Preserve originals locally (map never leaves the browser).
  if (raw && raw[4]) map.ERMHDR_user = raw[4];
  if (raw && raw[5]) map.ERMHDR_project = raw[5];
  if (ermhdr.user && !map.ERMHDR_user) map.ERMHDR_user = ermhdr.user;
  if ((ermhdr.project || ermhdr.database) && !map.ERMHDR_project) {
    map.ERMHDR_project = ermhdr.project || ermhdr.database;
  }

  // Neutral 9-field header in the canonical P6 layout. Slots 4 (user) and
  // 5 (project/db name) are the identity fields → 'anon'. Keep version[1],
  // date[2], the constant 'Project'/'Project Management' module strings, and
  // currency[last].
  const neutralRaw = [
    'ERMHDR', version, exportDate, 'Project', 'anon', 'anon',
    'db', 'Project Management', currency,
  ];
  return {
    raw: neutralRaw,
    version,
    export_date: exportDate,
    exportdate: exportDate,   // XML-shape alias
    user: 'anon',
    database: 'anon',
    project: 'anon',          // XML-shape alias
    db: 'anon',               // XML-shape alias
    currency,
  };
}

export function anonymizeModel(model) {
  const map = {};
  const out = JSON.parse(JSON.stringify(model));

  // 1. Header identity.
  out.ermhdr = scrubErmhdr(out.ermhdr, map);

  // 2. Identifying free-text fields across all tables.
  for (const [tableName, fieldList] of Object.entries(STRIP_FIELDS)) {
    const table = out.tables?.[tableName];
    if (!table?.records) continue;
    const prefix = prefixFor(tableName);
    let counter = 0;
    for (const rec of table.records) {
      counter++;
      const baseToken = `${prefix}_${String(counter).padStart(4, '0')}`;
      for (const f of fieldList) {
        if (rec[f] !== undefined && rec[f] !== null && rec[f] !== '') {
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

// Exported for the leak-detector test and any caller that wants to assert the
// privacy contract at runtime.
export const ANON_STRIP_FIELDS = STRIP_FIELDS;
