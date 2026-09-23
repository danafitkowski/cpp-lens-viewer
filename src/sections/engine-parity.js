import { h } from '../lib/dom.js';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

/**
 * Engine parity — what has been validated, and what has not.
 *
 * REWRITTEN 2026-08-12 after an adversarial audit of this section's own claims.
 * The first version published two headline figures that were each technically
 * true and both misleading, which is precisely the failure this section exists
 * to guard against:
 *
 *   "13 of 13" against P6, without saying the engine was CHANGED to match P6 on
 *   those same thirteen cases after the only blind run scored 6 of 13. It is a
 *   fitted result reported on its own training set.
 *
 *   "931 / 931" port agreement, without saying 64 further comparisons were
 *   SKIPPED rather than failed. Removing both guards, changing nothing else,
 *   the suite reported 931 / 995 with 34 of 45 fixtures failing.
 *
 *   Those are the figures AS THEY STOOD ON 2026-08-12 and are left here as the
 *   record of what was overstated. They are not the current numbers. Two engine
 *   defects were fixed after them, a transposed constraint-date column read and
 *   a missing SS/SF late-finish conversion in the backward pass, and the skip
 *   count fell from 64 to 6. The live figures are the constants below, each
 *   pinned to a real harness run by tests/unit/engine-parity.test.js.
 *
 * Both are stated properly below. Figures are guarded by
 * tests/unit/engine-parity.test.js against the engine's own sources.
 *
 * Built from the shell's existing kpiCard and dataTable helpers on purpose. A
 * first draft invented five class names (lens-kpi-row, lens-kpi-label,
 * lens-kpi-value, lens-kpi-sub, lens-note) that do not exist in shell.css, so it
 * would have rendered unstyled while looking correct in source.
 */
// Bumped 2026-09-23 from 2.9.46; before that 2026-09-22 from 2.9.45,
// 2026-09-21 from 2.9.44 and,
// earlier the same day, from 2.9.43 (2026-09-07 from 2.9.42; 2026-08-19 from
// 2.9.40; 2026-08-16 from 2.9.39).
// This is a COPY of the engine's SSOT
// (~/.claude/skills/_cpp_common/scripts/engine_version.py), which a browser
// bundle cannot read, and it had already drifted a release behind it. The copy
// is pinned to the SSOT by tests/unit/engine-parity.test.js, which was failing
// on exactly this before the bump — that test is the only thing that keeps this
// line honest, so do not restate the number anywhere else.
//
// This viewer does not carry the engine. No engine code is bundled or vendored
// here (the Deep Forensic path posts to the CPP server, src/mcp/client.js), so
// this string is a statement about the RELEASED engine the parity figures below
// were measured on, not about a copy shipped in this page. Nothing else needed
// changing for 2.9.46 but the crossval surface, which grew with the release:
// 46 -> 53 fixtures and 1009/1015 -> 1167/1183 executed/defined, the seven new
// fixtures exercising the retained-logic pass-through, SS_U and PO_SNAP rules.
// Skips went 6 -> 16 for the same reason the original 6 exist: four of the new
// fixtures carry completed activities and neither engine emits a signed-FF
// value there. The generated P6 comparison matrix still reports 13 of 13, with
// zero changed rows. Every one of those is checked against its source by that
// test rather than taken on trust, which is how the stale pair was found on
// 2026-09-21 — the deployed bundle told visitors 2.9.44 for the hours between
// the engine's release and that bump.
// 2.9.47 grew the surface again: 53 -> 82 fixtures and 1167/1183 -> 1957/2011,
// the 29 new fixtures exercising the unexpired lag off started and completed
// work, "lag from Actual Start" and SS/SF links into completed work. Skips went
// 16 -> 54, again all on completed activities (sixteen of the new fixtures carry
// one), and the P6 comparison matrix still reports 13 of 13 with zero changed
// rows.
const ENGINE_VERSION = '2.9.47';

// Layer 1 — two ports of the same algorithm, by the same author.
const CROSSVAL_FIXTURES = 82;
const CROSSVAL_EXECUTED = 1957;
const CROSSVAL_POSSIBLE = 2011;
const CROSSVAL_SKIPPED = 54;
const CROSSVAL_CLEAN_FIXTURES = 59;
const JS_UNIT_TESTS = 1315;
// c8 over cpm-engine.js running the crossval harness at the v2.9.47 tag,
// measured 2026-09-23: 5,035 of 11,085 statements.
const ENGINE_STATEMENT_COVERAGE = '45%';

// Layer 2 — the engine against Primavera P6 itself.
const P6_VERSION = 'Primavera P6 23.12';
const P6_CASES_PASSED = 13;
const P6_CASES_TOTAL = 13;
const P6_BLIND_FIRST_PASS = 6;
const P6_FIELD_CELLS = 162;
const P6_REAL_COMPARISONS = 152;

export const PARITY_FACTS = {
  ENGINE_VERSION,
  CROSSVAL_FIXTURES,
  CROSSVAL_EXECUTED,
  CROSSVAL_POSSIBLE,
  CROSSVAL_SKIPPED,
  CROSSVAL_CLEAN_FIXTURES,
  JS_UNIT_TESTS,
  P6_CASES_PASSED,
  P6_CASES_TOTAL,
  P6_BLIND_FIRST_PASS,
  P6_FIELD_CELLS,
  P6_REAL_COMPARISONS
};

/** All thirteen P6-comparable cases. Never a subset. */
const P6_CASES = [
  ['01', 'FS chain', 'A to B to C, zero lag'],
  ['02', 'SS with lag', 'SS+5, successor start anchored 5 wd into the predecessor'],
  ['03', 'FF with lag', 'FF+3, finish anchored 3 wd after the predecessor finish'],
  ['04', 'SF edge case', 'SF+0, the least common P6 relationship type'],
  ['05', 'Negative float', 'Finish On or Before, earlier than the natural finish'],
  ['06', 'Multiple calendars', 'one activity Mon to Fri, the next Mon to Sat'],
  ['07', 'Statutory holidays', 'long activity across Family Day, Good Friday, Victoria Day'],
  ['08', 'In-progress, retained logic', 'successor anchored to the projected early finish'],
  ['09', 'Completed successor', 'backward pass must not pull back through a historical finish'],
  ['10', 'Out-of-sequence progress', 'successor actual start before the predecessor finished'],
  ['11', 'Mandatory start and finish', 'hard pins on both ends'],
  ['12', 'SNET and FNLT', 'the two most common P6 constraints'],
  ['13', 'ALAP', 'secondary as-late-as-possible constraint slides to late start']
];

/** The limits. These decide whether anything above is worth reading. */
const LIMITS = [
  ['Fitted, not blind',
   `The thirteen cases were captured from P6 once. That first blind run passed ${P6_BLIND_FIRST_PASS} of ${P6_CASES_TOTAL}. The seven gaps sorted into five families, and the engine was then changed to match the answers P6 had already given, across three commits. The current ${P6_CASES_PASSED} of ${P6_CASES_TOTAL} is therefore measured on the cases the engine was fitted to. No held-out case has been captured since, so the honest reading is that these thirteen behaviours are now correct, not that the next thirteen would pass first time.`],
  ['The port total skips comparisons',
   `The cross-validation harness runs ${CROSSVAL_EXECUTED} comparisons and all of them pass. A further ${CROSSVAL_SKIPPED} are skipped rather than failed, on the two signed free-float fields, 27 on ff_signed and 27 on ff_signed_working_days. All fifty-four fall on twenty-three fixtures where neither engine assigns the field, and every one of them involves a completed activity: a completed-and-uncompleted mix, an out-of-sequence completion, an activity carrying an actual finish with no actual start, the four retained-logic pass-through fixtures, and sixteen of the unexpired-lag fixtures added with engine v2.9.47. Counting the skips, agreement is ${CROSSVAL_EXECUTED} of ${CROSSVAL_POSSIBLE}, and ${CROSSVAL_CLEAN_FIXTURES} of ${CROSSVAL_FIXTURES} fixtures are free of any divergence. The headline is a count of comparisons run, not a pass rate.`],
  ['Same author, both ports',
   'The JavaScript engine and the Python reference are written and maintained by the same person. That catches transcription and refactor drift. It cannot catch a shared misreading of how P6 behaves, which is why the P6 comparison exists and why it carries more weight.'],
  ['Most of the engine has no second implementation',
   `The cross-validation exercises about ${ENGINE_STATEMENT_COVERAGE} of the engine's statements. The Monte Carlo path, the DCMA-14 health computation, fragnet insertion for time impact analysis, the Bayesian update and the statutory-holiday calendars have no Python counterpart and are not cross-validated at all. Float burndown and the topology hash do have Python counterparts and, since August 2026, are compared against them field by field on an internal extended harness that also covers the salvage and strategy surfaces. That harness is not in the public repository, so the comparison is not independently runnable, and none of the figures on this page include it.`],
  ['Small synthetic networks',
   'All eighty-two fixtures are hand-built, averaging under three activities and topping out at ten. No real schedule and no XER file is cross-validated. The thirteen P6 cases are the same shape, twenty-seven activities in total.'],
  ['Day granular',
   'The engine works in whole days. A sub-day lag rounds and raises an alert that is fatal in strict mode. P6 stores lags in hours, so that case cannot be compared field for field and is excluded from the matrix rather than counted as a pass.'],
  ['No resource levelling',
   'Levelling is not modelled. Dates are driven by logic and calendars only.']
];

const CASE_COLS = [
  { key: 'n', label: '#' },
  { key: 'name', label: 'Behaviour isolated' },
  { key: 'what', label: 'What it tests' },
  { key: 'verdict', label: 'vs P6' }
];

const LIMIT_COLS = [
  { key: 'limit', label: 'Limit' },
  { key: 'means', label: 'What it means' }
];

export function render() {
  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Engine parity'),

    h('div', { class: 'kpi-grid' }, [
      kpiCard({
        title: 'Against P6, fitted',
        big: `${P6_CASES_PASSED} of ${P6_CASES_TOTAL}`,
        sub: `first blind run: ${P6_BLIND_FIRST_PASS} of ${P6_CASES_TOTAL}`,
        tone: 'ink'
      }),
      kpiCard({
        title: 'Port agreement, counted',
        big: `${CROSSVAL_EXECUTED} of ${CROSSVAL_POSSIBLE}`,
        sub: `${CROSSVAL_SKIPPED} comparisons skipped, not failed`,
        tone: 'ink'
      }),
      kpiCard({
        title: 'Fixtures with no divergence',
        big: `${CROSSVAL_CLEAN_FIXTURES} of ${CROSSVAL_FIXTURES}`,
        sub: 'the other seven carry mutual skips, not disagreements',
        tone: 'ink'
      }),
      kpiCard({
        title: 'Engine version',
        big: ENGINE_VERSION,
        sub: 'the version this viewer ships',
        tone: 'ink'
      })
    ]),

    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Read the two numbers differently'),
      h('p', {}, 'The P6 figure and the port-agreement figure answer different questions, and neither is a simple pass rate. This section was rewritten after its own first version published both of them in a way that flattered the engine.'),
      h('p', {}, `On P6: thirteen small schedules were built to isolate one scheduling behaviour each, imported into ${P6_VERSION}, and scheduled there by a human operator pressing F9. P6's answers were recorded field by field and pinned as data, ${P6_FIELD_CELLS} cells across twenty-seven activities, of which ${P6_REAL_COMPARISONS} are genuine engine-computed against P6-computed comparisons; the rest are actual dates carried through, or blanks. The first run against those pinned answers passed ${P6_BLIND_FIRST_PASS} of ${P6_CASES_TOTAL}. The engine was then corrected and now passes all thirteen. That is a real cross-tool test and it is also a fitted one.`),
      h('p', {}, `On the two ports: the harness compares a JavaScript and a Python implementation field by field and reports ${CROSSVAL_EXECUTED} of ${CROSSVAL_EXECUTED}. That is the count of comparisons it actually ran. ${CROSSVAL_SKIPPED} more were skipped rather than compared, every one on a completed activity where NEITHER implementation emits the signed free-float field, so there is nothing to verify and no port gap behind them; a skipped comparison is still not a passing one. Counted properly it is ${CROSSVAL_EXECUTED} of ${CROSSVAL_POSSIBLE}.`),
      h('p', {}, 'No parity claim is made beyond the ground these cases cover.')
    ]),

    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'The thirteen cases, every one listed'),
      dataTable({
        columns: CASE_COLS,
        rows: P6_CASES.map(([n, name, what]) =>
          ({ n, name, what, verdict: 'match' }))
      }),
      h('p', {}, 'Every case matches P6 on every field checked, after the corrections described above.')
    ]),

    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'What this does not cover'),
      h('p', {}, 'Worth reading before quoting any number above.'),
      dataTable({
        columns: LIMIT_COLS,
        rows: LIMITS.map(([limit, means]) => ({ limit, means }))
      }),
      h('p', {}, 'The comparison covers the CPM engine. It says nothing about the browser-side sections of this viewer, which read your file and present it; those are not part of the P6 comparison and make no claim to it. It is also not a review of your schedule against a contract or against the project record, and it is not a delay analysis.')
    ])
  ]);
}
