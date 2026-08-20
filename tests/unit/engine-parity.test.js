import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PARITY_FACTS } from '../../src/sections/engine-parity.js';

/**
 * The Engine Parity section quotes validation figures. This viewer holds a COPY
 * of numbers that live in the engine repository, so they can drift.
 *
 * The first version of these tests only checked that the copies matched the
 * engine's SSOT. They passed, and the section was still wrong, because the
 * numbers themselves were the wrong numbers to publish: "925 / 925" is the count
 * of comparisons the harness RAN, not a pass rate, and "13 of 13" was measured
 * on the cases the engine had been fitted to. Matching a misleading source
 * faithfully is not a safeguard.
 *
 * So these tests now pin the HONEST reading:
 *   - the skipped-comparison count is real and is derived from the harness code,
 *   - the section states the counted total and not just the executed one,
 *   - the section discloses that the P6 result is fitted, with the blind figure.
 */

const SSOT = join(homedir(), '.claude', 'skills', '_cpp_common', 'scripts',
                  'engine_version.py');
const ENGINE_DIR = join(homedir(), 'Projects', 'cpp-cpm-engine');
const MATRIX = join(ENGINE_DIR, 'validation', 'p6-comparison',
                    'comparison-matrix.md');
const CROSSVAL = join(ENGINE_DIR, 'cpm-engine.crossval.js');
const CROSSVAL_EXTENDED = join(homedir(), '.claude', 'skills', '_cpp_common',
                               'cpm-engine-js', 'cpm-engine.crossval-extended.js');

function readIf(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Read a file that lives OUTSIDE this repository, or skip the test.
 *
 * Four of the checks below compare the published figures against the engine's
 * own sources: ~/.claude/skills/_cpp_common/scripts/engine_version.py and
 * ~/Projects/cpp-cpm-engine. Neither is present on a CI runner, and neither is
 * present in a clean clone of this repo.
 *
 * These checks used to open with `if (!src) return;`. A test that returns early
 * reports PASS, so on a runner all four announced green while asserting nothing
 * at all — the parity figures looked guarded when nothing was comparing them to
 * anything. Skipping is the honest report: it asserts exactly as much as the
 * early return did, and says so out loud.
 *
 * ctx.skip() throws, so nothing after this call runs when the source is absent.
 */
function readSsotOrSkip(ctx, path, label) {
  const src = readIf(path);
  if (src === null) {
    console.warn(
      `[engine-parity] SKIP: ${label} not found at ${path}. ` +
      'This check compares the published figures against the engine repo, ' +
      'which is not checked out here. The figures are NOT verified against ' +
      'the engine SSOT in this run.');
    ctx.skip();
  }
  return src;
}

describe('engine parity figures', () => {
  it('matches the engine version declared in the engine SSOT', (ctx) => {
    const src = readSsotOrSkip(ctx, SSOT, 'engine_version.py (engine SSOT)');
    const m = src.match(/^ENGINE_VERSION\s*=\s*'([^']+)'/m);
    expect(m, 'engine_version.py no longer declares ENGINE_VERSION').toBeTruthy();
    expect(PARITY_FACTS.ENGINE_VERSION).toBe(m[1]);
  });

  it('matches the crossval counts declared in the SSOT', (ctx) => {
    const src = readSsotOrSkip(ctx, SSOT, 'engine_version.py (engine SSOT)');

    // This used to parse CROSSVAL_PASS as the ratio '925/925'. That constant
    // is now a sentence, precisely because the bare ratio could be misread as
    // full coverage, and the SSOT publishes the four counts as numbers
    // instead. Reading the numbers is what this test always wanted: both
    // sides of the old ratio were the EXECUTED count, so the defined total
    // and the skipped total were never pinned against the SSOT at all. They
    // are now.
    const num = (name) => {
      const m = src.match(new RegExp(`^${name}\\s*=\\s*(\\d+)`, 'm'));
      expect(m, `engine_version.py no longer declares ${name}. Re-point this ` +
                'test at the SSOT\'s current shape rather than dropping the ' +
                'assertion.').toBeTruthy();
      return Number(m[1]);
    };

    expect(PARITY_FACTS.CROSSVAL_FIXTURES).toBe(num('CROSSVAL_FIXTURES'));
    expect(PARITY_FACTS.CROSSVAL_EXECUTED).toBe(num('CROSSVAL_EXECUTED'));
    expect(PARITY_FACTS.CROSSVAL_POSSIBLE).toBe(num('CROSSVAL_DEFINED'));
    expect(PARITY_FACTS.CROSSVAL_SKIPPED).toBe(num('CROSSVAL_SKIPPED'));
    expect(PARITY_FACTS.JS_UNIT_TESTS).toBe(num('JS_UNIT_TEST_COUNT'));
  });

  it('matches the generated P6 comparison matrix', (ctx) => {
    const src = readSsotOrSkip(ctx, MATRIX, 'comparison-matrix.md (engine repo)');
    const cases = src.match(/Cases fully passing \| \*\*(\d+) \/ (\d+)\*\*/);
    expect(cases, 'comparison-matrix.md metric table changed shape').toBeTruthy();
    expect(PARITY_FACTS.P6_CASES_PASSED).toBe(Number(cases[1]));
    expect(PARITY_FACTS.P6_CASES_TOTAL).toBe(Number(cases[2]));
  });

  it('the skipped-comparison total is arithmetically consistent', () => {
    const { CROSSVAL_EXECUTED, CROSSVAL_POSSIBLE, CROSSVAL_SKIPPED } = PARITY_FACTS;
    expect(CROSSVAL_EXECUTED + CROSSVAL_SKIPPED).toBe(CROSSVAL_POSSIBLE);
    expect(CROSSVAL_SKIPPED).toBeGreaterThan(0);
  });

  it('the harness still SKIPS comparisons rather than failing them', (ctx) => {
    // This is the finding the honest wording rests on. If the guards are ever
    // removed and the Python port made to emit the field, the section must be
    // rewritten, and this failing test is the prompt to do it.
    const src = readSsotOrSkip(ctx, CROSSVAL,
                               'cpm-engine.crossval.js (engine repo)');
    const guarded = src.match(
      /if \(a\.ff_signed_working_days !== undefined && b\.ff_signed_working_days !== undefined &&\s*\n\s*a\.ff_signed_working_days !== null && b\.ff_signed_working_days !== null\)/);
    expect(guarded,
      'The ff_signed_working_days guard has changed. The published wording says ' +
      `${PARITY_FACTS.CROSSVAL_SKIPPED} comparisons are skipped rather than failed. ` +
      'Re-derive the counts by removing the guard and re-running the harness, ' +
      'then update the section and these figures.').toBeTruthy();
  });

  it('the internal extended harness still covers float burndown and the topology hash', (ctx) => {
    // The limits table says these two routines are compared JS-vs-Python on an
    // internal extended harness (added 2026-08-19 after the 2026-08-16 audit
    // found them uncompared). If those fixtures are ever removed, the wording
    // overstates coverage again, and this failing test is the prompt to fix it.
    const src = readSsotOrSkip(ctx, CROSSVAL_EXTENDED,
                               'cpm-engine.crossval-extended.js (skills tree)');
    expect(src, 'extended harness lost its topology-hash fixtures')
      .toMatch(/fn: 'topology'/);
    expect(src, 'extended harness lost its float-burndown fixtures')
      .toMatch(/fn: 'burndown'/);
    expect(src).toContain('computeTopologyHash');
    expect(src).toContain('computeFloatBurndown');
  });

  it('never claims more agreement than it counts', () => {
    expect(PARITY_FACTS.P6_CASES_PASSED)
      .toBeLessThanOrEqual(PARITY_FACTS.P6_CASES_TOTAL);
    expect(PARITY_FACTS.CROSSVAL_EXECUTED)
      .toBeLessThanOrEqual(PARITY_FACTS.CROSSVAL_POSSIBLE);
    expect(PARITY_FACTS.CROSSVAL_CLEAN_FIXTURES)
      .toBeLessThanOrEqual(PARITY_FACTS.CROSSVAL_FIXTURES);
    // The blind first pass is the honesty anchor: it must stay below the fitted
    // figure, otherwise the disclosure has been quietly softened.
    expect(PARITY_FACTS.P6_BLIND_FIRST_PASS)
      .toBeLessThan(PARITY_FACTS.P6_CASES_PASSED);
  });
});
