/**
 * Anonymize a parsed XER model before it leaves the browser for the Deep
 * Forensic MCP. Replaces every identifying free-text field — names,
 * descriptions, titles, labels — with a stable opaque token (ACT_0001,
 * RSRC_0003, …) and scrubs the ERMHDR identity line. Returns the anonymized
 * model plus an `anon_map` (token → original) that NEVER leaves the browser;
 * only the SHA-256 of the map is sent to the MCP for receipt validation.
 *
 * TWO models (a current schedule and its baseline) must go through
 * anonymizeModelPair(), or through anonymizeModel() twice with one shared
 * createAnonContext(). Two separate calls build two independent maps and the
 * files then disagree about what every token means.
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
 *   EVERY TABLE   create_user, update_user                     (P6 edit stamps)
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

// GENERIC sweep for tables NOT in STRIP_FIELDS. The per-table map above is a
// hand-maintained list, and hand-maintained lists die quietly: POBS is not in
// it, and the viewer ships a separate manual button for POBS precisely because
// its pobs_name / pobs_descr carry the org chart in plain text. Any table the
// list does not know is now swept by FIELD-NAME PATTERN instead of passing
// through untouched — every column whose name says "this is prose or an
// identity" is tokenized; ids, dates, durations and codes are left alone, so
// schedule semantics survive. A table P6 grows next year is covered the day
// it appears.
const GENERIC_TEXT_FIELD = /(?:_name|_names|_descr|_description|_memo|_title|_label|_text|_note|_notes|_url|_addr|_phone|web_site|email|guid|logo)$/i;

// Fields stripped from EVERY table, whether or not the table is listed above.
// P6 stamps create_user/update_user on almost every row it writes, and the
// value is the P6 login or full display name, e.g. "Northgate Builders -
// J. Whitfield", on every activity in a TASK table. The per-table map above could
// never cover this: the columns are not a property of any one table, so each
// new table added to STRIP_FIELDS would have had to remember them again, and
// tables NOT in the map (there are many P6 emits) would leak regardless.
// A global sweep cannot miss a table.
const GLOBAL_STRIP_FIELDS = ['create_user', 'update_user'];

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
function rememberOriginal(map, baseKey, value) {
  if (value === undefined || value === null || value === '') return;
  let key = baseKey;
  let n = 1;
  while (key in map) {
    if (map[key] === value) return;  // already recorded under this key
    key = `${baseKey}_${++n}`;       // second model's header — keep both
  }
  map[key] = value;
}

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

  // Preserve originals locally (map never leaves the browser). Two models
  // anonymized under one context each carry their own header, so the keys are
  // de-duplicated rather than overwritten — the baseline's export user must not
  // erase the current schedule's from the local map.
  if (raw && raw[4]) rememberOriginal(map, 'ERMHDR_user', raw[4]);
  if (raw && raw[5]) rememberOriginal(map, 'ERMHDR_project', raw[5]);
  if (ermhdr.user) rememberOriginal(map, 'ERMHDR_user', ermhdr.user);
  if (ermhdr.project || ermhdr.database) {
    rememberOriginal(map, 'ERMHDR_project', ermhdr.project || ermhdr.database);
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

/**
 * Shared tokenisation context.
 *
 * Deep Forensic uploads TWO schedules — the current one and its baseline — and
 * they must be tokenised under ONE context or their tokens do not correspond:
 * ACT_0007 in the current file would name a different activity from ACT_0007 in
 * the baseline, so every output the Engine renders with a name beside a matched
 * Activity ID would be nonsense, and the SHA-256 receipt would cover only half
 * of what was uploaded. anonymizeModel() creates a private context when none is
 * passed, so single-model callers behave exactly as before.
 *
 *   map          token → original (never leaves the browser)
 *   tokenByValue table|field|original → token, so the same original string
 *                gets the same token in both models
 *   userTokens   create_user/update_user value → token, shared likewise
 */
export function createAnonContext() {
  // userTokens is keyed by a value out of the file (a P6 login), so it gets a
  // null prototype: a user literally named "constructor" must not read back as
  // an already-minted token.
  return { map: {}, tokenByValue: new Map(), userTokens: Object.create(null) };
}

/**
 * Token for one (table, field, value), minting a fresh one on first sight.
 *
 * On a fresh context the row counter is always free, so single-model output is
 * unchanged. When a second model is tokenised under the same context the probe
 * steps past tokens the first model already took, so a token can never carry
 * two different originals — which is what would silently corrupt the map, and
 * with it the receipt hash.
 */
function tokenFor(ctx, tableName, field, value, prefix, counter, multiField) {
  const vkey = `${tableName} ${field} ${value}`;
  const existing = ctx.tokenByValue.get(vkey);
  if (existing) return existing;
  let n = counter;
  let token;
  for (;;) {
    const base = `${prefix}_${String(n).padStart(4, '0')}`;
    token = multiField ? `${base}_${field}` : base;
    if (!(token in ctx.map)) break;
    n++;
  }
  ctx.map[token] = value;
  ctx.tokenByValue.set(vkey, token);
  return token;
}

/**
 * @param {object} model  parsed XER model
 * @param {object} [ctx]  shared context from createAnonContext() — pass the
 *                        SAME one for the current schedule and its baseline
 * @returns {{ model: object, map: object, ctx: object }}
 */
export function anonymizeModel(model, ctx = createAnonContext()) {
  const map = ctx.map;
  const out = JSON.parse(JSON.stringify(model));

  // 1. Header identity.
  out.ermhdr = scrubErmhdr(out.ermhdr, map);

  // 2. Identifying free-text fields across all tables.
  for (const [tableName, fieldList] of Object.entries(STRIP_FIELDS)) {
    const table = out.tables?.[tableName];
    if (!table?.records) continue;
    const prefix = prefixFor(tableName);
    const multiField = fieldList.length > 1;
    let counter = 0;
    for (const rec of table.records) {
      counter++;
      for (const f of fieldList) {
        if (rec[f] !== undefined && rec[f] !== null && rec[f] !== '') {
          rec[f] = tokenFor(ctx, tableName, f, rec[f], prefix, counter, multiField);
        }
      }
    }
  }

  // 2b. Generic sweep over every table the per-table list does not know.
  for (const [tableName, table] of Object.entries(out.tables || {})) {
    if (STRIP_FIELDS[tableName]) continue;    // already handled, field by field
    if (!table?.records || !table?.fields) continue;
    const sweepFields = table.fields.filter(f => GENERIC_TEXT_FIELD.test(f));
    if (!sweepFields.length) continue;
    const prefix = prefixFor(tableName);
    const multiField = sweepFields.length > 1;
    let counter = 0;
    for (const rec of table.records) {
      counter++;
      for (const f of sweepFields) {
        if (rec[f] !== undefined && rec[f] !== null && rec[f] !== '') {
          rec[f] = tokenFor(ctx, tableName, f, rec[f], prefix, counter, multiField);
        }
      }
    }
  }

  // 3. User stamps, every table. Tokenised by DISTINCT VALUE rather than by
  //    row: a schedule has a handful of editors and tens of thousands of rows,
  //    so a per-row token would bloat the map without hiding anything more.
  //    Same value in, same token out, so "who touched what" survives the scrub
  //    as a structural fact while the person stays anonymous.
  const userTokens = ctx.userTokens;
  for (const table of Object.values(out.tables || {})) {
    if (!table?.records) continue;
    for (const rec of table.records) {
      for (const f of GLOBAL_STRIP_FIELDS) {
        const v = rec[f];
        if (v === undefined || v === null || v === '') continue;
        if (!userTokens[v]) {
          let n = Object.keys(userTokens).length + 1;
          let token = `USER_${String(n).padStart(3, '0')}`;
          while (token in map) token = `USER_${String(++n).padStart(3, '0')}`;
          userTokens[v] = token;
          map[token] = v;
        }
        rec[f] = userTokens[v];
      }
    }
  }

  return { model: out, map, ctx };
}

/**
 * Anonymize a current schedule and its baseline under ONE map.
 *
 * This is the only correct way to prepare a two-file Deep Forensic submission:
 * calling anonymizeModel twice builds two independent maps, and the two files
 * then disagree about what every token means. Returns the single map that
 * covers BOTH models, which is the map whose SHA-256 must be reported.
 *
 * @param {object} current          the current / updated model (A)
 * @param {object|null} [baseline]  the baseline / prior model (B), if loaded
 * @returns {{ current: object, baseline: object|null, map: object, ctx: object }}
 */
export function anonymizeModelPair(current, baseline) {
  const ctx = createAnonContext();
  const a = anonymizeModel(current, ctx);
  const b = baseline ? anonymizeModel(baseline, ctx) : null;
  return { current: a.model, baseline: b ? b.model : null, map: ctx.map, ctx };
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
export const ANON_GLOBAL_STRIP_FIELDS = GLOBAL_STRIP_FIELDS;
