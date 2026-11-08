// DCMA parity (2026-11-07, DCMA phase 2).
//
// CPP's three DCMA engines (the validator, the health dashboard and this
// screen) measure the fourteen checks as one shared definition writes them:
// tests/fixtures/dcma_parity/DCMA_DEFINITION.md, vendored byte-for-byte from
// CPP's common skill references with the synthetic fixtures and the results
// worked out by hand from that text (expected.json). Each engine's suite checks
// itself against the same fixtures.
//
// Lens's scope (fixtures README, "Engine scope"): checks 1 to 11 are scored,
// #12 only as a FAIL (a logic loop, or a completion pinned by a mandatory
// constraint), so #13 and #14 are expected NOT SCORED here and #12 is expected
// NOT SCORED unless the fixture expects FAIL. #12 is compared on status only.
//
// One `it` per (fixture, check), so a failure names both.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { computeMetrics, NOT_SCORED } from '../../src/sections/dcma-lite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures', 'dcma_parity');
const expected = JSON.parse(readFileSync(join(FIX, 'expected.json'), 'utf-8'));

function load(name) {
  return parseXer(readFileSync(join(FIX, name), 'utf-8'), { filename: name });
}

/** The status this screen must give, under Lens's engine scope. */
function lensStatus(check, status, by) {
  if (check === '13' || check === '14') return NOT_SCORED;
  // A #12 result the 600-day test decides (by: 'test') needs a recalculation,
  // which this screen does not run: NOT SCORED here (definition #12).
  if (check === '12') return (status === 'FAIL' && by !== 'test') ? 'FAIL' : NOT_SCORED;
  return status === 'NS' ? NOT_SCORED : status;
}

const results = new Map();
function resultsFor(name) {
  if (!results.has(name)) {
    const fx = expected[name];
    results.set(name, computeMetrics(load(fx.current), fx.baseline ? load(fx.baseline) : null));
  }
  return results.get(name);
}

describe('DCMA parity fixtures', () => {
  it('expected.json lists the twenty-two fixtures', () => {
    expect(Object.keys(expected).sort()).toEqual([
      'p10_late_no_baseline', 'p11_short_day', 'p12_exact_095', 'p13_unrelated_baseline', 'p14_durations',
      'p15_no_forecasts', 'p16_as_built_mandatory', 'p17_shift_hours', 'p18_empty_calendar', 'p19_calendar_mix', 'p1_logic', 'p20_cross_project_links', 'p21_zero_duration', 'p22_mandatory_mid_path', 'p2_activities', 'p3_pair', 'p4_cycle', 'p5_mandatory',
      'p6_two_projects', 'p7_as_built', 'p8_no_links', 'p9_data_date'
    ]);
  });

  for (const [name, fx] of Object.entries(expected)) {
    describe(name, () => {
      for (const [check, want] of Object.entries(fx.checks)) {
        const status = lensStatus(check, want.status, want.by);
        it(`#${check}: ${status}${status !== NOT_SCORED && want.num != null ? ` ${want.num} of ${want.den}` : ''}`, () => {
          const m = resultsFor(name).metrics[Number(check) - 1];
          expect(m, `#${check} row`).toBeTruthy();
          expect(m.status, `${name} #${check} status (${m.result} | ${m.count})`).toBe(status);
          if (status === NOT_SCORED) {
            expect(m.num, `${name} #${check} num`).toBeNull();
            expect(m.den, `${name} #${check} den`).toBeNull();
          } else if (check !== '12') {
            expect(m.num, `${name} #${check} num (${m.count})`).toBe(want.num);
            expect(m.den, `${name} #${check} den (${m.count})`).toBe(want.den);
          }
        });
      }
    });
  }
});

describe('every result is PASS, FAIL or NOT SCORED, with numeric counts when scored', () => {
  for (const name of Object.keys(expected)) {
    it(name, () => {
      for (const m of resultsFor(name).metrics) {
        expect(['PASS', 'FAIL', NOT_SCORED], m.name).toContain(m.status);
        if (m.status === NOT_SCORED) {
          expect(m.num, m.name).toBeNull();
          expect(m.den, m.name).toBeNull();
        } else if (!/^Critical Path Test/.test(m.name)) {
          expect(Number.isInteger(m.num), m.name).toBe(true);
          expect(Number.isInteger(m.den) && m.den > 0, m.name).toBe(true);
        }
      }
    });
  }
});

// The vendored copies must not drift from CPP's canonical files. The canonical
// folder (~/.claude/skills/_cpp_common, or $CPP_SKILLS_ROOT/_cpp_common) exists
// only on the maintainer's machine, so this is skipped in CI.
const CANON = join(process.env.CPP_SKILLS_ROOT || join(homedir(), '.claude', 'skills'), '_cpp_common');
const VENDORED = [
  ...Object.values(expected).flatMap(fx => [fx.current, fx.baseline]).filter(Boolean)
    .map(f => [f, join(CANON, 'tests', 'fixtures', 'dcma_parity', f)]),
  ['expected.json', join(CANON, 'tests', 'fixtures', 'dcma_parity', 'expected.json')],
  ['README.md', join(CANON, 'tests', 'fixtures', 'dcma_parity', 'README.md')],
  ['DCMA_DEFINITION.md', join(CANON, 'references', 'DCMA_DEFINITION.md')],
  ['dcma_definition.json', join(CANON, 'references', 'dcma_definition.json')]
];

describe.skipIf(!existsSync(CANON))('the vendored fixtures are byte-identical to the canonical ones', () => {
  for (const [file, source] of [...new Map(VENDORED)]) {
    it(basename(file), () => {
      const mine = readFileSync(join(FIX, file));
      const theirs = readFileSync(source);
      expect(mine.equals(theirs), `${file} differs from ${source}`).toBe(true);
    });
  }
});
