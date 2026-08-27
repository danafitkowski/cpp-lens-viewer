// @vitest-environment happy-dom
//
// THE DEFECT CLASS: "8 hr/day" hard-coded under a label that says working days.
//
// P6 stores duration and float in HOURS. Six sections turned those hours into
// days by dividing by a baked-in 8 — `> 352`, `> 20 * 8`, `> 40 * 8`, `/ 8` —
// and then printed "44 wd", "> 20 working days", "> 40 working days" beside the
// answer. On a 10 hr/day calendar every one of those thresholds is off by 25%,
// and nothing on the page tells the reader. Two of them disagreed with each
// other on the same file: Executive Summary said "> 20 working days" at 160 hr
// while Schedule Quality's Long Duration card said it at 20 real days.
//
// The suite was green through all of it because every fixture was 8 hr/day,
// where the hard-code and the truth are the same number. That is the shape of
// bug this file exists to make impossible: fixtures whose calendar is NOT 8
// hr/day, so a wrong divisor cannot hide.
//
// ten-hour-thresholds.xer — one 10 hr/day calendar (day_hr_cnt = 10), 6 tasks
// chosen so every threshold in the class straddles the difference:
//
//   code   duration          total float       > 20 wd   > 40 wd   > 44 wd
//   T100   180 hr = 18 wd      0 hr =  0 wd      no        no        no
//   T110   210 hr = 21 wd      0 hr =  0 wd      YES       no        no
//   T120   360 hr = 36 wd    360 hr = 36 wd      YES       no        no
//   T130   410 hr = 41 wd    410 hr = 41 wd      YES       YES       no
//   T140   450 hr = 45 wd    450 hr = 45 wd      YES       YES       YES
//   T150    40 hr =  4 wd     40 hr =  4 wd      no        no        no
//
// Correct counts (working days on the file's own calendar) vs the counts the
// hard-coded 8 produced:
//
//   DCMA High Duration (> 44 wd)   1   vs 3   (> 352 hr caught 36 and 41 wd)
//   DCMA High Float    (> 44 wd)   1   vs 3
//   Summary long duration (> 20 wd) 4  vs 5   (> 160 hr caught the 18 wd one)
//   Risk long duration (> 40 wd)   2   vs 3   (> 320 hr caught the 36 wd one)
//   Sched Quality Long Duration    4   vs 5
//   Sched Quality Large Float      2   vs 3
//
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer, getTable, getCalendarMap } from '@criticalpathpartners/lens-parser';

import { render as renderDcma }        from '../../src/sections/dcma-lite.js';
import { render as renderRisk }        from '../../src/sections/risk-register.js';
import { render as renderSummary }     from '../../src/sections/summary.js';
import { render as renderQuality }     from '../../src/sections/schedule-quality.js';
import { render as renderConstraints } from '../../src/sections/constraints-float.js';
import { render as renderDistribution } from '../../src/sections/distribution.js';
import { traceChain } from '../../src/sections/path-explorer.js';
import { render as renderLookahead } from '../../src/sections/lookahead.js';
import { workingDayContext, P6_DEFAULT_HOURS_PER_DAY } from '../../src/sections/_shared/working-days.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

function load(name) {
  return parseXer(readFileSync(join(FIX, name), 'utf-8'), { filename: name });
}

function bigOf(el, title) {
  return [...el.querySelectorAll('.kpi')]
    .find(c => c.querySelector('.kpi-title')?.textContent === title)
    ?.querySelector('.kpi-big')?.textContent;
}

/** One row of the DCMA Lite metric table, by metric name. */
function metricRow(el, nameRe) {
  const tr = [...el.querySelectorAll('tbody tr')]
    .find(r => nameRe.test(r.children[0]?.textContent || ''));
  if (!tr) return null;
  return { name: tr.children[0].textContent, result: tr.children[1].textContent };
}

/** Rows of the risk table whose Rule column equals `rule`. */
function riskRows(el, rule) {
  return [...el.querySelectorAll('tbody tr')]
    .filter(r => (r.children[1]?.textContent || '') === rule);
}

/** The count cell of one Constraints/Float bucket row. */
function floatBucketCount(el, label) {
  const tr = [...el.querySelectorAll('tbody tr')]
    .find(r => (r.children[0]?.textContent || '') === label);
  return tr ? tr.children[1].textContent : null;
}

const TEN = 'ten-hour-thresholds.xer';
const UNUSABLE = 'unusable-day-hours.xer';
const LAG = 'ten-hour-lag.xer';

// ─────────────────────────────────────────────────────────────────────────────
// The fixtures have to be what the rest of this file claims, or every assertion
// below is vacuous — an 8 hr/day fixture cannot tell a right divisor from a
// wrong one.
// ─────────────────────────────────────────────────────────────────────────────
describe('the fixtures are not 8 hr/day', () => {
  it('ten-hour-thresholds.xer states day_hr_cnt = 10 and resolves to 10', () => {
    const A = load(TEN);
    const rows = getTable(A, 'CALENDAR');
    expect(rows.length).toBe(1);
    expect(rows[0].day_hr_cnt).toBe('10');
    expect(Number(getCalendarMap(A)['C10'].hours_per_day)).toBe(10);
    expect(Number(getCalendarMap(A)['C10'].hours_per_day)).not.toBe(P6_DEFAULT_HOURS_PER_DAY);
  });

  it('every activity in it resolves to that calendar, so nothing falls back', () => {
    const A = load(TEN);
    const cal = workingDayContext(A);
    const d = cal.disclose(getTable(A, 'TASK'));
    expect(d.hoursPerDay).toEqual([10]);
    expect(d.fallback).toBe(0);
    expect(d.warning).toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// One threshold at a time, on the 10 hr/day file.
// ─────────────────────────────────────────────────────────────────────────────
describe('DCMA Lite counts High Float / High Duration in working days', () => {
  it('High Duration > 44 wd catches the 45 wd activity, not the 36 and 41 wd ones', () => {
    const el = renderDcma({ A: load(TEN), B: null });
    const row = metricRow(el, /High Duration/);
    expect(row).toBeTruthy();
    expect(row.name).toContain('44 wd');
    expect(row.result).toBe('16.7%');   // 1 of 6
    expect(row.result).not.toBe('50.0%'); // 3 of 6 — the `> 352` hard-code
  });

  it('High Float > 44 wd catches the 45 wd float, not the 36 and 41 wd ones', () => {
    const el = renderDcma({ A: load(TEN), B: null });
    const row = metricRow(el, /High Float/);
    expect(row).toBeTruthy();
    expect(row.name).toContain('44 wd');
    expect(row.result).toBe('16.7%');
    expect(row.result).not.toBe('50.0%');
  });

  it('the threshold moves only when the activity really crosses 44 working days', () => {
    // 440 hr is 44 wd exactly — not over. 450 hr is 45 wd — over. Under the
    // hard-code both were "over" from 353 hr upward.
    const A = load(TEN);
    const t = A.tables.TASK.records.find(x => x.task_code === 'T140');

    t.target_drtn_hr_cnt = '440';
    expect(metricRow(renderDcma({ A, B: null }), /High Duration/).result).toBe('0.0%');

    t.target_drtn_hr_cnt = '450';
    expect(metricRow(renderDcma({ A, B: null }), /High Duration/).result).toBe('16.7%');
  });

  it('names the divisor the two working-day metrics were applied at', () => {
    const el = renderDcma({ A: load(TEN), B: null });
    expect(el.textContent).toMatch(/10 hr per day/);
    expect(el.textContent).toMatch(/CALENDAR\.day_hr_cnt/);
  });
});

describe('Risk Register counts Long duration in working days', () => {
  it('flags the 41 and 45 wd activities, not the 36 wd one', () => {
    const el = renderRisk({ A: load(TEN), B: null });
    const rows = riskRows(el, 'Long duration');
    expect(rows.length).toBe(2);
    expect(rows.length).not.toBe(3); // the `40 * 8` hard-code
    const codes = rows.map(r => r.children[2].textContent).sort();
    expect(codes).toEqual(['T130', 'T140']);
  });

  it('says 40 working days and means 40 working days', () => {
    const el = renderRisk({ A: load(TEN), B: null });
    expect(el.textContent).toMatch(/> 40 working days/);
    expect(el.textContent).toMatch(/10 hr per day/);
  });

  it('a 40 wd activity is not flagged and a 41 wd one is', () => {
    const A = load(TEN);
    const t = A.tables.TASK.records.find(x => x.task_code === 'T130');

    t.target_drtn_hr_cnt = '400';  // exactly 40 wd
    expect(riskRows(renderRisk({ A, B: null }), 'Long duration').length).toBe(1);

    t.target_drtn_hr_cnt = '410';  // 41 wd
    expect(riskRows(renderRisk({ A, B: null }), 'Long duration').length).toBe(2);
  });
});

describe('Executive Summary counts long duration in working days', () => {
  it('reports 4 activities over 20 working days, not the 5 the `20 * 8` test found', () => {
    const el = renderSummary({ A: load(TEN), B: null });
    expect(el.textContent).toMatch(/4 activities have duration > 20 working days/);
    expect(el.textContent).not.toMatch(/5 activities have duration > 20 working days/);
  });

  it('discloses the divisor beside the count', () => {
    const el = renderSummary({ A: load(TEN), B: null });
    expect(el.textContent).toMatch(/converted at 10 hr per day/);
  });
});

describe('Schedule Quality still agrees with itself after the class fix', () => {
  it('Long Duration is 4 and Large Float is 2 on the 10 hr/day file', () => {
    const el = renderQuality({ A: load(TEN), B: null });
    expect(bigOf(el, 'Long Duration')).toBe('4');
    expect(bigOf(el, 'Large Float')).toBe('2');
  });
});

describe('the two sections that both say "> 20 working days" now agree', () => {
  it('Executive Summary and Schedule Quality report the same count', () => {
    // They disagreed by construction: summary tested `> 20 * 8` hours, schedule
    // quality tested `> 20` days on the calendar. On this file that is 5 vs 4.
    //
    // LIMIT, STATED PLAINLY: this fixture has no TT_LOE / TT_WBS rows, so it
    // isolates the divisor. The two sections still differ in SCOPE — schedule
    // quality counts LOE/WBS rows and summary does not — which is a separate
    // question and is pinned on the real QA pair at the bottom of this file.
    const A = load(TEN);
    const quality = Number(bigOf(renderQuality({ A, B: null }), 'Long Duration'));
    const summaryText = renderSummary({ A, B: null }).textContent;
    const m = /(\d+) activities have duration > 20 working days/.exec(summaryText);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBe(quality);
    expect(quality).toBe(4);
  });
});

describe('Constraints / Float buckets on the activity calendar', () => {
  it('a 36 working-day float lands in 21 – 40 wd, not 41+', () => {
    // 360 hr / 8 = 45 → the old arithmetic would have put it in 41+.
    const el = renderConstraints({ A: load(TEN), B: null });
    expect(floatBucketCount(el, '21 – 40 wd')).toBe('1');
    expect(floatBucketCount(el, '41+ wd')).toBe('2');
  });

  it('discloses its divisor too', () => {
    const el = renderConstraints({ A: load(TEN), B: null });
    expect(el.textContent).toMatch(/10 hr per day/);
  });
});

describe('Distribution discloses the divisor its day buckets used', () => {
  it('names 10 hr per day', () => {
    const el = renderDistribution({ A: load(TEN), B: null });
    expect(el.textContent).toMatch(/10 hr per day/);
  });
});

describe('3-Week Lookahead prints OD / RD / TF in working days', () => {
  it('the one activity in the window reads 36 days, not 45', () => {
    // Data date 02-Mar-2026. T120 runs 27-Feb to 21-Apr, so it is the only
    // activity overlapping week 1. Its 360 hr is 36 days on the file's 10 hr/day
    // calendar and 45 at a baked-in 8.
    const el = renderLookahead({ A: load(TEN), B: null });
    const row = [...el.querySelectorAll('tbody tr')]
      .find(r => r.children[0]?.textContent === 'T120');
    expect(row).toBeTruthy();
    expect(row.children[4].textContent).toBe('36');      // OD
    expect(row.children[4].textContent).not.toBe('45');
    expect(row.children[7].textContent).toBe('36');      // TF
  });

  it('names the divisor those day columns were produced at', () => {
    const el = renderLookahead({ A: load(TEN), B: null });
    expect(el.textContent).toMatch(/10 hr per day/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Path Explorer converts RELATIONSHIP LAG, not a duration, and it does not print
// the number — it uses it to decide which predecessor is driving. A wrong
// divisor there does not show up as a wrong label, it shows up as the wrong
// activity on the trace, which is worse.
//
// ten-hour-lag.xer: L120 starts 02-Mar and has two candidate drivers.
//   L100 ends 21-Feb, its relationship carries an 80 hr lag
//   L110 ends 25-Feb, no lag
// 80 hr is 8 days on the file's 10 hr/day calendar and 10 days at a baked-in 8.
//   at 10 hr/day: L100's threshold is 22-Feb, it ends 21-Feb → eligible, 1 day
//                 clear; L110 is 5 days clear → L100 drives.
//   at  8 hr/day: L100's threshold is 20-Feb, it ends 21-Feb → not eligible at
//                 all → L110 drives.
// ─────────────────────────────────────────────────────────────────────────────
describe('Path Explorer converts relationship lag on the activity calendar', () => {
  it('the fixture really is 10 hr/day with an 80 hr lag on one link', () => {
    const A = load(LAG);
    expect(getTable(A, 'CALENDAR')[0].day_hr_cnt).toBe('10');
    const rels = getTable(A, 'TASKPRED');
    expect(rels.find(r => r.pred_task_id === '1').lag_hr_cnt).toBe('80');
    expect(rels.find(r => r.pred_task_id === '2').lag_hr_cnt).toBe('0');
  });

  it('traces back through the lagged predecessor, not the unlagged one', () => {
    const chain = traceChain(load(LAG), '3', 'backward');
    expect(chain.length).toBeGreaterThan(0);
    expect(chain[0].task_code).toBe('L100');
    expect(chain[0].task_code).not.toBe('L110'); // what `lagHrs / 8` picked
  });

  it('and picks the other one when the calendar really is 8 hr/day', () => {
    // Same file, same lag, calendar restated as 8 hr/day: now 80 hr IS 10 days
    // and L100 genuinely falls outside the threshold. The trace is supposed to
    // change — that is the point, and it is why the divisor cannot be a constant.
    const A = load(LAG);
    A.tables.CALENDAR.records[0].day_hr_cnt = '8';
    const chain = traceChain(A, '3', 'backward');
    expect(chain[0].task_code).toBe('L110');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE DISCLOSURE HOLE.
//
// The old check was `if (calMap[t.clndr_id]) return false;` — it warned only
// when the CALENDAR row was ABSENT. getCalendarMap substitutes 8 for a blank or
// unparsable day_hr_cnt, and durationHoursToDays substitutes 8 again for a zero,
// so a calendar row that exists and states nothing usable produced a silent
// guess that looked exactly like a real 8 hr/day calendar. The worst case — a
// file where every calendar row is present and none of them states a usable
// day_hr_cnt — reported completely clean.
// ─────────────────────────────────────────────────────────────────────────────
describe('a calendar row that exists but states no usable day_hr_cnt is disclosed', () => {
  it('the fixture really does carry present-but-unusable calendar rows', () => {
    const A = load(UNUSABLE);
    const raw = Object.fromEntries(getTable(A, 'CALENDAR').map(c => [c.clndr_id, c.day_hr_cnt]));
    expect(raw.CBLANK).toBe('');      // blank
    expect(raw.CZERO).toBe('0');      // zero
    expect(raw.CJUNK).toBe('n/a');    // not a number
    expect(raw.C10).toBe('10');

    // And the old present-check cannot tell any of them from a real calendar:
    // getCalendarMap hands back an object for all four.
    const calMap = getCalendarMap(A);
    for (const id of ['C10', 'CBLANK', 'CZERO', 'CJUNK']) {
      expect(calMap[id]).toBeTruthy();
    }
  });

  it('the context splits missing from unusable instead of calling both fine', () => {
    const A = load(UNUSABLE);
    const d = workingDayContext(A).disclose(getTable(A, 'TASK'));
    expect(d.unusable).toBe(3);        // CBLANK, CZERO, CJUNK
    expect(d.missing).toBe(1);         // CGONE
    expect(d.fallback).toBe(4);
    expect(d.hoursPerDay).toEqual([10]);
    expect(d.unusableValues).toEqual(['(blank)', '0', 'n/a']);
  });

  it('the worst case — every calendar present, none usable — no longer reports clean', () => {
    // Point every activity at a calendar row that IS in the file. Under the old
    // present-only check this file produced no warning at all while four of the
    // five activities were being converted at a guessed 8 hr/day.
    const A = load(UNUSABLE);
    for (const t of A.tables.TASK.records) t.clndr_id = 'CBLANK';

    const d = workingDayContext(A).disclose(getTable(A, 'TASK'));
    expect(d.missing).toBe(0);          // nothing is "not in this file" any more
    expect(d.unusable).toBe(5);
    expect(d.hoursPerDay).toEqual([]);  // no divisor came off the file at all
    expect(d.warning).toBeTruthy();

    const el = renderQuality({ A, B: null });
    expect(el.textContent).toMatch(/states no usable hours per day/);
    expect(el.textContent).toMatch(/day_hr_cnt \(blank\)/);
    expect(el.textContent).toMatch(/No activity in this file resolves to a CALENDAR record with a usable day_hr_cnt/);
  });

  it('the warning names both failure modes when both are present', () => {
    const el = renderQuality({ A: load(UNUSABLE), B: null });
    expect(el.textContent).toMatch(/1 activity names a calendar that is not in this file/);
    expect(el.textContent).toMatch(/3 activities resolve to a CALENDAR record that states no usable hours per day/);
    expect(el.textContent).toMatch(/day_hr_cnt \(blank\), 0, n\/a/);
  });

  it('every section that converts hours carries the same warning', () => {
    const A = load(UNUSABLE);
    const renders = {
      'Schedule Quality':   renderQuality({ A, B: null }),
      'DCMA Lite':          renderDcma({ A, B: null }),
      'Risk Register':      renderRisk({ A, B: null }),
      'Constraints/Float':  renderConstraints({ A, B: null }),
      'Distribution':       renderDistribution({ A, B: null }),
      'Executive Summary':  renderSummary({ A, B: null }),
      '3-Week Lookahead':   renderLookahead({ A, B: null })
    };
    for (const [name, el] of Object.entries(renders)) {
      expect(el.textContent, `${name} must disclose the guessed divisor`)
        .toMatch(/P6 default 8 hr per day/);
    }
  });

  it('a fully resolved file raises no warning — the disclosure is not noise', () => {
    for (const el of [
      renderQuality({ A: load(TEN), B: null }),
      renderDcma({ A: load(TEN), B: null }),
      renderRisk({ A: load(TEN), B: null }),
      renderConstraints({ A: load(TEN), B: null }),
      renderDistribution({ A: load(TEN), B: null }),
      renderSummary({ A: load(TEN), B: null }),
      renderLookahead({ A: load(TEN), B: null })
    ]) {
      expect(el.textContent).not.toMatch(/P6 default 8 hr per day/);
      expect(el.textContent).not.toMatch(/states no usable hours per day/);
      expect(el.querySelector('.lens-warn')).toBeFalsy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The fix must be a correction, not a rescale: on a genuine 8 hr/day file every
// count has to stay exactly where it was.
// ─────────────────────────────────────────────────────────────────────────────
describe('an 8 hr/day file is unchanged by the fix', () => {
  it('minimal-3-task.xer still reports the same counts', () => {
    const A = load('minimal-3-task.xer');
    const q = renderQuality({ A, B: null });
    expect(bigOf(q, 'Long Duration')).toBe('0');
    expect(bigOf(q, 'Large Float')).toBe('0');
    expect(q.textContent).toMatch(/8 hr per day/);
    expect(q.querySelector('.lens-warn')).toBeFalsy();

    const d = renderDcma({ A, B: null });
    expect(metricRow(d, /High Duration/).result).toBe('0.0%');
    expect(metricRow(d, /High Float/).result).toBe('0.0%');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REAL QA PAIR — Georgian College current vs baseline.
// Skipped when the files are not on this machine; LENS_QA_XER_DIR overrides.
// ─────────────────────────────────────────────────────────────────────────────
import { QA_DIR } from '../qa-corpus.js';
const QA_CURRENT = `${QA_DIR}/Georgian-College-current.xer`;
const QA_BASELINE = `${QA_DIR}/Georgian-College-baseline.xer`;
const HAVE_QA = existsSync(QA_CURRENT) && existsSync(QA_BASELINE);

describe.skipIf(!HAVE_QA)('real QA pair — working-day thresholds', () => {
  const A = HAVE_QA ? parseXer(readFileSync(QA_CURRENT, 'latin1')) : null;
  const B = HAVE_QA ? parseXer(readFileSync(QA_BASELINE, 'latin1')) : null;

  it('both exports carry exactly one calendar, stating 8 hr/day', () => {
    // Stated plainly because it is the reason the counts below do not move:
    // this project is uniformly 8 hr/day, so the hard-coded divisor and the
    // calendar divisor are the same number here. The fix is proved on the 10
    // hr/day fixtures above, not on this file.
    for (const model of [A, B]) {
      const cals = getTable(model, 'CALENDAR');
      expect(cals.length).toBe(1);
      expect(cals[0].clndr_id).toBe('7023');
      expect(cals[0].day_hr_cnt).toBe('8');
    }
  });

  it('every activity in both exports resolves to that calendar', () => {
    for (const model of [A, B]) {
      const d = workingDayContext(model).disclose(getTable(model, 'TASK'));
      expect(d.hoursPerDay).toEqual([8]);
      expect(d.missing).toBe(0);
      expect(d.unusable).toBe(0);
      expect(d.warning).toBe(null);
    }
  });

  it('the counts are exactly what they were — the fix rescales nothing at 8 hr/day', () => {
    // 404 non-LOE/WBS activities in current, 327 in baseline.
    const cur = workingDayContext(A);
    const bas = workingDayContext(B);
    const over = (ctx, model, field, wd) => getTable(model, 'TASK')
      .filter(t => !['TT_LOE', 'TT_WBS'].includes(t.task_type))
      .filter(t => { const v = ctx.workingDays(t, field); return v != null && v > wd; })
      .length;

    expect(over(cur, A, 'total_float_hr_cnt', 44)).toBe(149);  // DCMA High Float
    expect(over(cur, A, 'target_drtn_hr_cnt', 44)).toBe(40);   // DCMA High Duration
    expect(over(cur, A, 'target_drtn_hr_cnt', 20)).toBe(76);   // Summary / Sched Quality
    expect(over(cur, A, 'target_drtn_hr_cnt', 40)).toBe(42);   // Risk long duration
    expect(over(cur, A, 'total_float_hr_cnt', 40)).toBe(162);  // Sched Quality Large Float

    expect(over(bas, B, 'total_float_hr_cnt', 44)).toBe(161);
    expect(over(bas, B, 'target_drtn_hr_cnt', 44)).toBe(52);
    expect(over(bas, B, 'target_drtn_hr_cnt', 20)).toBe(74);
    expect(over(bas, B, 'target_drtn_hr_cnt', 40)).toBe(54);
    expect(over(bas, B, 'total_float_hr_cnt', 40)).toBe(163);
  });

  it('the sections render those same counts on the real file', () => {
    const q = renderQuality({ A, B: null });
    // 77 and 163, not 76 and 162: Schedule Quality counts Long Duration and
    // Large Float over ALL 405 TASK rows, while every other section here drops
    // TT_LOE / TT_WBS first. This export carries exactly one such row —
    // A1880 "Suspended Metal Soffits", TT_WBS, 2080 hr = 260 wd, float 504 hr =
    // 63 wd — and it clears both thresholds. That gap is a SCOPE difference,
    // not a divisor one, and it is pinned here so it cannot move unnoticed.
    expect(bigOf(q, 'Long Duration')).toBe('77');
    expect(bigOf(q, 'Large Float')).toBe('163');
    expect(q.textContent).toMatch(/8 hr per day/);

    // 404 non-LOE/WBS activities: 149/404 = 36.9%, 40/404 = 9.9%.
    const d = renderDcma({ A, B: null });
    expect(metricRow(d, /High Float/).result).toBe('36.9%');
    expect(metricRow(d, /High Duration/).result).toBe('9.9%');

    expect(riskRows(renderRisk({ A, B: null }), 'Long duration').length).toBe(42);
    expect(renderSummary({ A, B: null }).textContent)
      .toMatch(/76 activities have duration > 20 working days/);
  });

  it('the one activity behind the 77 / 76 gap is a TT_WBS row, not a divisor error', () => {
    // Naming it rather than waving at it: if this ever becomes a divisor
    // difference the assertion below stops holding and the gap has to be
    // re-explained rather than re-accepted.
    const cur = workingDayContext(A);
    const all = getTable(A, 'TASK');
    const over20 = all.filter(t => {
      const v = cur.workingDays(t, 'target_drtn_hr_cnt');
      return v != null && v > 20;
    });
    const loe = over20.filter(t => ['TT_LOE', 'TT_WBS'].includes(t.task_type));
    expect(over20.length).toBe(77);
    expect(loe.length).toBe(1);
    expect(loe[0].task_code).toBe('A1880');
    expect(loe[0].task_type).toBe('TT_WBS');
    expect(cur.workingDays(loe[0], 'target_drtn_hr_cnt')).toBe(260);
  });
});
