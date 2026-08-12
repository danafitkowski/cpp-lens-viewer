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

function readIf(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

describe('engine parity figures', () => {
  it('matches the engine version declared in the engine SSOT', () => {
    const src = readIf(SSOT);
    if (!src) return;
    const m = src.match(/^ENGINE_VERSION\s*=\s*'([^']+)'/m);
    expect(m, 'engine_version.py no longer declares ENGINE_VERSION').toBeTruthy();
    expect(PARITY_FACTS.ENGINE_VERSION).toBe(m[1]);
  });

  it('matches the fixture count and executed-check count in the SSOT', () => {
    const src = readIf(SSOT);
    if (!src) return;
    const fixtures = src.match(/^CROSSVAL_FIXTURES\s*=\s*(\d+)/m);
    const pass = src.match(/^CROSSVAL_PASS\s*=\s*'(\d+)\/(\d+)'/m);
    const jsUnits = src.match(/^JS_UNIT_TEST_COUNT\s*=\s*(\d+)/m);
    expect(fixtures && pass && jsUnits).toBeTruthy();
    expect(PARITY_FACTS.CROSSVAL_FIXTURES).toBe(Number(fixtures[1]));
    // The SSOT's "925/925" is the EXECUTED count on both sides of the slash.
    expect(PARITY_FACTS.CROSSVAL_EXECUTED).toBe(Number(pass[1]));
    expect(PARITY_FACTS.JS_UNIT_TESTS).toBe(Number(jsUnits[1]));
  });

  it('matches the generated P6 comparison matrix', () => {
    const src = readIf(MATRIX);
    if (!src) return;
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

  it('the harness still SKIPS comparisons rather than failing them', () => {
    // This is the finding the honest wording rests on. If the guards are ever
    // removed and the Python port made to emit the field, the section must be
    // rewritten, and this failing test is the prompt to do it.
    const src = readIf(CROSSVAL);
    if (!src) return;
    const guarded = src.match(
      /if \(a\.ff_signed_working_days !== undefined && b\.ff_signed_working_days !== undefined &&\s*\n\s*a\.ff_signed_working_days !== null && b\.ff_signed_working_days !== null\)/);
    expect(guarded,
      'The ff_signed_working_days guard has changed. The published wording says ' +
      `${PARITY_FACTS.CROSSVAL_SKIPPED} comparisons are skipped rather than failed. ` +
      'Re-derive the counts by removing the guard and re-running the harness, ' +
      'then update the section and these figures.').toBeTruthy();
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
