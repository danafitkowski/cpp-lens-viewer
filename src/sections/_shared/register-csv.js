import { h } from '../../lib/dom.js';
import { download } from '../../lib/download.js';
import { buildCsv } from '../../lib/csv.js';

/**
 * A "download the full register" button for a table the screen truncates.
 *
 * The comparison tables cap what they draw (500 field changes, 200 of
 * everything else) and say so in their footer, on screen and in print. That is
 * honest about the page and useless for the rows it left out: "Showing 500 of
 * 1525 rows" on the public demonstration pair, and no way to get the other
 * 1,025. The cap stays, because 1,500 table rows is not a readable screen. The
 * register itself is now one click away, complete.
 *
 * Every row carries the two file names it compares, so the CSV still says what
 * it is a register OF after it has left this page. Cells go through the same
 * writer as the Raw Tables export, spreadsheet-formula guard included.
 *
 * Returns null for an empty register: there is nothing to download, and a
 * button that produces a header row and nothing else is noise.
 *
 * @param {object}   args
 * @param {string}   args.label     button text, stating the row count
 * @param {string}   args.filename
 * @param {string[]} args.fields    column headings, in order
 * @param {object[]} args.rows      one object per row, keyed by those headings
 * @param {object|null} args.A      current model (for its file name)
 * @param {object|null} args.B      baseline model (for its file name)
 * @returns {HTMLElement|null}
 */
export function registerCsvButton({ label, filename, fields, rows, A, B }) {
  if (!rows || rows.length === 0) return null;
  const current  = (A && A.filename) || '';
  const baseline = (B && B.filename) || '';
  return h('button', {
    class: 'lens-register-csv',
    type: 'button',
    style: { padding: '6px 12px', margin: '0 0 10px', border: '1px solid #0F2540', borderRadius: '4px',
             background: '#FFFFFF', color: '#0F2540', cursor: 'pointer', fontWeight: '700', fontSize: '12px' },
    onclick() {
      const csv = buildCsv(
        ['Current file', 'Baseline file', ...fields],
        rows.map(r => ({ 'Current file': current, 'Baseline file': baseline, ...r }))
      );
      download(csv, filename, 'text/csv');
    }
  }, label);
}

/** "1 added activity", "600 field changes". */
export function countNoun(n, one, many) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
