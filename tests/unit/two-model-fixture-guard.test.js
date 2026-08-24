// STRUCTURAL GUARD — no test may compare two models on a fixture whose two
// sides carry the same task_id values.
//
// WHAT WENT WRONG
// ---------------
// A 526-test suite was fully green while the shipped viewer matched 0 of 318
// activities, reported 655 added / 535 deleted relationships on a pair sharing
// 472, and called 313 of 318 activities a narrative flip. Not one of those
// numbers was wrong in the tests, because the fixtures were wrong: nearly every
// A-vs-B suite parsed one file twice, or built both models from the same
// literal ids. P6 reassigns the surrogate task_id on every export, so matching
// on task_id is correct on those fixtures and worthless in production. A test
// that passes while the product is broken IS the bug.
//
// THE RULE THIS ENFORCES
// ----------------------
// Any test file that compares two models must prove its pair at RUNTIME with
// assertDivergentSurrogates() from tests/fixtures/reexport.js — the one place
// that refuses a pair sharing a task_id, and refuses a pair sharing no
// task_code. There is no allowlist of "known good" files: the set of files to
// check is derived from the tree on every run, so a suite added tomorrow is
// covered without anyone remembering to register it.
//
// A file with a legitimate reason to compare a degenerate pair declares it in
// its own source with a FIXTURE-EXEMPT(two-model-identity) comment carrying the
// reason. The exemption lives next to the fixture it excuses, never in a list
// here that would drift out of sight of the code it governs.
//
// LIMIT, STATED PLAINLY: this checks that a file proves ONE pair. A file that
// proves one pair and hand-rolls a second is not caught here — the runtime
// helper is what makes a proven pair impossible to fake, and this test is what
// makes running it impossible to skip.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = join(__dirname, '..');

/** Every *.test.js under tests/. Derived from the tree, never listed. */
function testFiles(dir = TESTS_DIR, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(full, acc);
    else if (entry.name.endsWith('.test.js')) acc.push(full);
  }
  return acc;
}

/**
 * Ways a test file hands two models to something that matches them A-against-B.
 * `B: null` / `B: undefined` is a single-model render and is not a comparison.
 */
const COMPARISON_SITES = [
  { re: /\{\s*A\s*,\s*B\s*\}/, what: 'render({ A, B })' },
  { re: /\bB\s*:\s*(?!null\b|undefined\b)[A-Za-z_$(]/, what: 'B: <model>' },
  {
    re: /\b(?:diffModels|generateHalfStep|buildActivities)\s*\(\s*[A-Za-z_$][^)]*,/,
    what: 'diffModels / generateHalfStep / buildActivities called with two models'
  }
];

/** Import of the one sanctioned two-model fixture builder. */
const IMPORTS_BUILDER = /from\s+'(?:\.\.\/)+fixtures\/reexport\.js'/;
/** The runtime refusal that proves a pair is two exports and not one file twice. */
const PROVES_PAIR = /\bassertDivergentSurrogates\s*\(/;
/** In-file exemption, with its reason on the same comment. */
const EXEMPTION = /FIXTURE-EXEMPT\(two-model-identity\):\s*(.+)/;

/**
 * Classify one test file's source.
 *
 * @param {string} src
 * @returns {{ compares: string[], provesPair: boolean, importsBuilder: boolean, exemptReason: string|null }}
 */
export function classify(src) {
  const match = EXEMPTION.exec(src);
  return {
    compares: COMPARISON_SITES.filter(s => s.re.test(src)).map(s => s.what),
    provesPair: PROVES_PAIR.test(src),
    importsBuilder: IMPORTS_BUILDER.test(src),
    exemptReason: match ? match[1].trim() : null
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The detector itself, before it is trusted on real files
// ─────────────────────────────────────────────────────────────────────────────

describe('the two-model fixture detector can actually fire', () => {
  it('flags a fixture that gives both models the same task_id', () => {
    // Exactly the shape that shipped: one fixture parsed twice, no proof.
    const planted = `
      import { render } from '../../src/sections/xer-comparison.js';
      const A = parseXer(readFileSync(FIX));
      const B = parseXer(readFileSync(FIX));
      it('renders', () => { render({ A, B }); });
    `;
    const v = classify(planted);
    expect(v.compares.length).toBeGreaterThan(0);
    expect(v.provesPair).toBe(false);
    expect(v.exemptReason).toBe(null);
  });

  it('flags the object-literal form too', () => {
    const planted = `const el = render({ A: parseXer(X), B: parseXer(X) });`;
    expect(classify(planted).compares.length).toBeGreaterThan(0);
  });

  it('flags a two-model call to the diff helpers', () => {
    expect(classify('const d = diffModels(current, baseline);').compares.length).toBeGreaterThan(0);
  });

  it('does NOT flag a single-model render', () => {
    const single = `
      const A = parseXer(X);
      it('renders', () => { render({ A, B: null }); });
      it('renders empty', () => { render({ A: null, B: null }); });
    `;
    expect(classify(single).compares).toEqual([]);
  });

  it('accepts a file that proves its pair', () => {
    const good = `
      import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js';
      const A = parseXer(X); const B = reexport(parseXer(X));
      it('sanity', () => { assertDivergentSurrogates(A, B); });
      it('renders', () => { render({ A, B }); });
    `;
    const v = classify(good);
    expect(v.compares.length).toBeGreaterThan(0);
    expect(v.provesPair).toBe(true);
    expect(v.importsBuilder).toBe(true);
  });

  it('accepts an exemption only when it states a reason', () => {
    expect(classify('// FIXTURE-EXEMPT(two-model-identity):').exemptReason).toBe(null);
    expect(classify('// FIXTURE-EXEMPT(two-model-identity): B has no TASK table at all.').exemptReason)
      .toBe('B has no TASK table at all.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The tree
// ─────────────────────────────────────────────────────────────────────────────

describe('every two-model comparison proves its fixture is a real export pair', () => {
  const files = testFiles();
  const comparisons = files.filter(f => classify(readFileSync(f, 'utf-8')).compares.length > 0);

  it('the scan sees the test tree', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('the scan finds the comparison suites — a detector matching nothing reports clean', () => {
    // If a refactor renames the call sites, this number collapses and the whole
    // guard silently stops guarding. It must never fall to zero unnoticed.
    expect(comparisons.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of comparisons) {
    const rel = relative(TESTS_DIR, file).replace(/\\/g, '/');
    it(`${rel} proves its two-model fixture diverges`, () => {
      const v = classify(readFileSync(file, 'utf-8'));

      if (v.exemptReason !== null) {
        expect(v.exemptReason.length,
          `${rel}: FIXTURE-EXEMPT(two-model-identity) needs a reason, not a bare marker`)
          .toBeGreaterThan(20);
        return;
      }

      expect(v.importsBuilder,
        `${rel} compares two models (${v.compares.join('; ')}) but does not import the shared ` +
        "fixture builder. Add: import { reexport, assertDivergentSurrogates } from '../fixtures/reexport.js'")
        .toBe(true);

      expect(v.provesPair,
        `${rel} compares two models (${v.compares.join('; ')}) without calling ` +
        'assertDivergentSurrogates(A, B). Two exports of one project share task_code and NO ' +
        'task_id — a fixture that shares task_id lets a surrogate-keyed matcher pass here and ' +
        'match nothing in production. Prove the pair, or declare a ' +
        'FIXTURE-EXEMPT(two-model-identity): <reason> in this file.')
        .toBe(true);
    });
  }
});
