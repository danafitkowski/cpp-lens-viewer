// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/udf-explorer.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('UDF Explorer', () => {
  it('renders empty-state when no XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders 4 KPI cards when XER is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'with-udfs.xer'), 'utf-8'));
    const el = render({ A, B: null });
    const kpis = el.querySelectorAll('.kpi');
    expect(kpis.length).toBe(4);
  });

  it('shows at least 1 UDFTYPE row in the type list when with-udfs.xer is loaded', () => {
    const A = parseXer(readFileSync(join(FIX, 'with-udfs.xer'), 'utf-8'));
    const el = render({ A, B: null });
    // with-udfs.xer has 2 UDFTYPE rows
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(el.textContent).toContain('task_note');
  });

  it('buckets UDFVALUE rows with a dangling udf_type_id into an Unknown/Orphaned row and reconciles the KPI total', () => {
    // udf-orphan-and-overflow.xer has a UDFVALUE row with udf_type_id = U99,
    // which has no matching UDFTYPE row (dangling FK).
    const A = parseXer(readFileSync(join(FIX, 'udf-orphan-and-overflow.xer'), 'utf-8'));
    const el = render({ A, B: null });

    // The orphaned value must not silently vanish — it should surface in a
    // synthetic "Unknown / Orphaned UDF Type" bucket.
    expect(el.textContent).toContain('Unknown / Orphaned UDF Type');

    // The "Total UDF Values" KPI must reconcile with the sum of the type
    // table's Value-count column (including the orphaned bucket row).
    const kpis = [...el.querySelectorAll('.kpi')];
    const totalKpi = kpis.find(k => k.textContent.includes('Total UDF Values'));
    const totalValues = Number(totalKpi.querySelector('.kpi-big').textContent);

    const nonKpiCards = [...el.querySelectorAll('.lens-card')].filter(c => !c.classList.contains('kpi'));
    const typeCard = nonKpiCards[0];
    const countCells = [...typeCard.querySelectorAll('tbody tr')].map(tr => Number(tr.children[3].textContent));
    const sumOfTypeCounts = countCells.reduce((a, b) => a + b, 0);

    expect(totalValues).toBe(14); // 11 (U1) + 2 (U2) + 1 (orphaned U99)
    expect(sumOfTypeCounts).toBe(totalValues);
  });

  it('shows a "showing 10 of N" note in the sample card header only when a type has more than 10 sample values', () => {
    const A = parseXer(readFileSync(join(FIX, 'udf-orphan-and-overflow.xer'), 'utf-8'));
    const el = render({ A, B: null });

    // U1 / "Task Note" has 11 UDFVALUE rows -> capped at 10 samples, note expected.
    const h4s = [...el.querySelectorAll('h4')];
    const taskNoteHeader = h4s.find(h4 => h4.textContent.includes('Task Note'));
    expect(taskNoteHeader.textContent).toMatch(/showing 10 of 11/i);

    // U2 / "Cost Code" has only 2 UDFVALUE rows -> no truncation, no note.
    const costCodeHeader = h4s.find(h4 => h4.textContent.includes('Cost Code'));
    expect(costCodeHeader.textContent).not.toMatch(/showing/i);
  });
});
