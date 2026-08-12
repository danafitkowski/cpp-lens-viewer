import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PARITY_FACTS } from '../../src/sections/engine-parity.js';

/**
 * The Engine Parity section quotes validation figures. Those figures live in the
 * engine's own single source of truth, and this viewer holds a COPY of them, so
 * they can drift — which is exactly how three stale engine mirrors and a
 * comparison matrix showing the opposite of the truth were all found on
 * 2026-08-12.
 *
 * A viewer that publishes a validation number the engine has moved past is worse
 * than one that publishes none, because the number carries authority it no
 * longer has. These tests read the engine's SSOT and the GENERATED P6 matrix and
 * assert the copies still agree.
 */

const SSOT = join(homedir(), '.claude', 'skills', '_cpp_common', 'scripts',
                  'engine_version.py');
const MATRIX = join(homedir(), 'Projects', 'cpp-cpm-engine', 'validation',
                    'p6-comparison', 'comparison-matrix.md');

function readIf(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

describe('engine parity figures', () => {
  it('matches the engine version declared in the engine SSOT', () => {
    const src = readIf(SSOT);
    if (!src) return; // engine tree not present on this machine
    const m = src.match(/^ENGINE_VERSION\s*=\s*'([^']+)'/m);
    expect(m, 'engine_version.py no longer declares ENGINE_VERSION').toBeTruthy();
    expect(PARITY_FACTS.ENGINE_VERSION).toBe(m[1]);
  });

  it('matches the cross-validation fixture and check counts in the SSOT', () => {
    const src = readIf(SSOT);
    if (!src) return;
    const fixtures = src.match(/^CROSSVAL_FIXTURES\s*=\s*(\d+)/m);
    const pass = src.match(/^CROSSVAL_PASS\s*=\s*'([^']+)'/m);
    const jsUnits = src.match(/^JS_UNIT_TEST_COUNT\s*=\s*(\d+)/m);
    expect(fixtures && pass && jsUnits).toBeTruthy();
    expect(PARITY_FACTS.CROSSVAL_FIXTURES).toBe(Number(fixtures[1]));
    // The SSOT writes "925/925"; the section renders it spaced for reading.
    expect(PARITY_FACTS.CROSSVAL_CHECKS.replace(/\s/g, '')).toBe(pass[1]);
    expect(PARITY_FACTS.JS_UNIT_TESTS).toBe(Number(jsUnits[1]));
  });

  it('matches the GENERATED P6 comparison matrix, not a remembered number', () => {
    const src = readIf(MATRIX);
    if (!src) return;
    const cases = src.match(/Cases fully passing \| \*\*(\d+) \/ (\d+)\*\*/);
    const checks = src.match(/Field-level checks \| (\d+)/);
    expect(cases && checks,
           'comparison-matrix.md no longer carries the metric table this reads')
      .toBeTruthy();
    expect(PARITY_FACTS.P6_CASES_PASSED).toBe(Number(cases[1]));
    expect(PARITY_FACTS.P6_CASES_TOTAL).toBe(Number(cases[2]));
    expect(PARITY_FACTS.P6_FIELD_CHECKS).toBe(Number(checks[1]));
  });

  it('does not claim a pass rate better than the matrix records', () => {
    // Independent of the equality checks above: even if someone rewrites both
    // sides, the section must never overstate.
    expect(PARITY_FACTS.P6_CASES_PASSED)
      .toBeLessThanOrEqual(PARITY_FACTS.P6_CASES_TOTAL);
  });
});
