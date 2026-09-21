// @vitest-environment happy-dom
//
// "Actual Finishes to Date" must stop at the data date.
//
// The card took the last point of the cumulative actual curve, and the curve
// was built from every act_end_date in the file with no cutoff. On the public
// demonstration file (data date 2025-07-01) it showed 113 beside that date,
// while 31 activities have an actual finish on or before it; the other 82
// finish dates are later than the data date. The actual curve ran on past the
// data date for the same reason, and the forecast line started from its end.
//
// THE FIXTURE (synthetic; data date 2026-03-02 08:00)
//
//   code  actual finish        planned finish
//   E1    2026-02-06 17:00     02-06
//   E2    2026-02-20 17:00     02-13
//   E3    2026-03-02 17:00     02-27   ON the data date: counts as "to date"
//   E4    2026-03-05 17:00     03-06   after the data date
//   E5    2026-03-10 17:00     03-13   after the data date
//   E6    not finished         03-20
//   L1    level of effort, actual finish 03-10: outside this section's population
//
//   Actual finishes to date   E1 E2 E3           = 3   (the old card said 5)
//   Actual finish dates after the data date      = 2   (E4 E5; L1 is not counted)
//   Planned by the data date  E1 E2 E3           = 3   so SPI proxy = 3 / 3 = 1.00
import { describe, it, expect } from 'vitest';
import { render, computeEvm } from '../../src/sections/evm.js';

function task(task_id, task_code, target_end_date, act_end_date, extra = {}) {
  return {
    task_id: String(task_id),
    task_code,
    task_name: `Activity ${task_code}`,
    proj_id: '1',
    task_type: 'TT_Task',
    status_code: act_end_date ? 'TK_Complete' : 'TK_NotStart',
    target_end_date,
    act_end_date,
    ...extra
  };
}

function model(dataDate = '2026-03-02 08:00') {
  const tasks = [
    task(1, 'E1', '2026-02-06 17:00', '2026-02-06 17:00'),
    task(2, 'E2', '2026-02-13 17:00', '2026-02-20 17:00'),
    task(3, 'E3', '2026-02-27 17:00', '2026-03-02 17:00'),
    task(4, 'E4', '2026-03-06 17:00', '2026-03-05 17:00'),
    task(5, 'E5', '2026-03-13 17:00', '2026-03-10 17:00'),
    task(6, 'E6', '2026-03-20 17:00', ''),
    task(7, 'L1', '2026-03-20 17:00', '2026-03-10 17:00', { task_type: 'TT_LOE' })
  ];
  return {
    ermhdr: { raw: ['ERMHDR', '24.12', '2026-03-02', 'Project', 'u', 'User', 'db', 'Project Management', 'USD'] },
    filename: 'synthetic-evm.xer',
    tables: {
      PROJECT: {
        fields: ['proj_id', 'proj_short_name', 'last_recalc_date', 'scd_end_date'],
        records: [{ proj_id: '1', proj_short_name: 'SYN', last_recalc_date: dataDate, scd_end_date: '2026-03-20 17:00' }]
      },
      TASK: { fields: Object.keys(tasks[0]), records: tasks }
    }
  };
}

function card(el, title) {
  return [...el.querySelectorAll('.kpi')].find(c => c.querySelector('.kpi-title')?.textContent === title);
}

const DATA_DATE_MS = Date.UTC(2026, 2, 2);

describe('EVM / S-Curves Lite stops "to date" figures at the data date', () => {
  it('Actual Finishes to Date counts finishes on or before the data date: 3, not 5', () => {
    const el = render({ A: model(), B: null });
    expect(card(el, 'Actual Finishes to Date').querySelector('.kpi-big').textContent).toBe('3');
  });

  it('the card says what it counts', () => {
    const el = render({ A: model(), B: null });
    expect(card(el, 'Actual Finishes to Date').querySelector('.kpi-sub').textContent)
      .toMatch(/on or before the data date/);
  });

  it('the actual curve ends on the data date', () => {
    const { actualCurve } = computeEvm(model());
    expect(actualCurve.at(-1)).toEqual({ x: DATA_DATE_MS, y: 3 });
    expect(actualCurve.every(p => p.x <= DATA_DATE_MS)).toBe(true);
  });

  it('the forecast line starts from the last actual finish to date, not from a future one', () => {
    const { forecastCurve } = computeEvm(model());
    expect(forecastCurve[0]).toEqual({ x: DATA_DATE_MS, y: 3 });
  });

  it('SPI proxy is actual over planned at the data date: 3 / 3', () => {
    const el = render({ A: model(), B: null });
    expect(card(el, 'SPI Proxy').querySelector('.kpi-big').textContent).toBe('1.00');
  });

  it('shows one warning line with the count of actual finish dates after the data date', () => {
    const el = render({ A: model(), B: null });
    const lines = el.querySelectorAll('.lens-evm-cutoff');
    expect(lines.length).toBe(1);
    expect(lines[0].textContent).toContain('2 actual finish dates fall after the data date (2026-03-02)');
    expect(lines[0].textContent).not.toContain('—');
  });

  it('shows no warning line when every actual finish is on or before the data date', () => {
    const el = render({ A: model('2026-03-31 08:00'), B: null });
    expect(el.querySelectorAll('.lens-evm-cutoff').length).toBe(0);
    expect(card(el, 'Actual Finishes to Date').querySelector('.kpi-big').textContent).toBe('5');
  });
});
