/**
 * CSV serialization, in one place.
 *
 * Moved here from sections/raw-tables.js, unchanged, when the comparison
 * registers gained CSV downloads: the formula-injection guard below is a
 * security control, and a second copy of it is a second thing to keep right.
 */

/**
 * Escape a single field value for CSV output.
 *
 * Two layers:
 *  1. CSV formula-injection guard (OWASP). XER field text is untrusted; a cell
 *     beginning with = @ + - (or a tab/CR formula-lead) is executed as a
 *     formula when the CSV is opened in Excel / Sheets / LibreOffice — e.g.
 *     =HYPERLINK / =cmd|'…' — a data-exfil / command-exec vector on the
 *     analyst's machine. CSV quoting does NOT prevent it (the app evaluates
 *     after unquoting). We neutralize with a leading apostrophe, which those
 *     apps render as inert text without showing the quote. Plain numbers
 *     (incl. negatives like "-40" total float) are left intact so numeric
 *     columns still sort/sum.
 *  2. RFC 4180 quoting for comma / quote / CR / LF.
 */
export function csvEscape(value) {
  let s = value == null ? '' : String(value);
  if (s.length > 0) {
    const c = s[0];
    const isFormulaLead =
      c === '=' || c === '@' || c === '\t' || c === '\r' ||
      ((c === '+' || c === '-') && !/^[+-]?\d+(?:\.\d+)?$/.test(s));
    if (isFormulaLead) s = "'" + s;
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCsv(fields, records) {
  const header = fields.map(csvEscape).join(',');
  const dataRows = records.map(r =>
    fields.map(f => csvEscape(r[f])).join(',')
  );
  return [header, ...dataRows].join('\r\n');
}
