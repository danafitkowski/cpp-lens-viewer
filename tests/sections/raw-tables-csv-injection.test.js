// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render } from '../../src/sections/raw-tables.js';
import * as dl from '../../src/lib/download.js';

// Build a model whose TASK rows carry CSV-formula-injection payloads, click
// the export button, and inspect the CSV string handed to download().
function modelWith(records) {
  return { tables: { TASK: { fields: Object.keys(records[0]), records } } };
}

function exportedCsv(records) {
  let captured = '';
  const spy = vi.spyOn(dl, 'download').mockImplementation((text) => { captured = text; });
  try {
    const el = render({ A: modelWith(records), B: null });
    document.body.appendChild(el);
    const btn = [...el.querySelectorAll('button')].find(b => /download/i.test(b.textContent));
    btn.click();
    document.body.removeChild(el);
  } finally { spy.mockRestore(); }
  return captured;
}

describe('Raw Tables CSV export — formula-injection neutralized', () => {
  it("prefixes = @ + formula leads with an apostrophe", () => {
    const csv = exportedCsv([
      { task_id: '1', task_name: '=HYPERLINK("http://evil","clickme")' },
      { task_id: '2', task_name: '@SUM(A1:A9)' },
      { task_id: '3', task_name: '+1+cmd' },
      { task_id: '4', task_name: '=cmd|\'/c calc\'!A1' },
    ]);
    // No raw cell may begin a formula. Check each data line's task_name cell.
    const lines = csv.split('\r\n').slice(1); // drop header
    for (const line of lines) {
      // task_name is the 2nd column; find the part after the first comma
      const after = line.slice(line.indexOf(',') + 1);
      // strip an optional opening quote from RFC-4180 quoting
      const firstChar = after.replace(/^"/, '')[0];
      expect(['=', '@', '+'].includes(firstChar), `cell still starts with formula char: ${after.slice(0,20)}`).toBe(false);
    }
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'@SUM");
  });

  it('leaves legitimate negative numbers intact (no apostrophe on -40)', () => {
    const csv = exportedCsv([{ task_id: '1', total_float_hr_cnt: '-40' }]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain('-40');
    expect(dataLine).not.toContain("'-40");
  });

  it('still applies RFC-4180 quoting for commas/quotes/newlines', () => {
    const csv = exportedCsv([{ task_id: '1', task_name: 'Pour, set, cure' }]);
    expect(csv).toContain('"Pour, set, cure"');
  });

  it('neutralizes a "-" lead that is NOT a plain number', () => {
    const csv = exportedCsv([{ task_id: '1', task_name: '-2+3+cmd|x' }]);
    expect(csv).toContain("'-2+3+cmd");
  });
});
