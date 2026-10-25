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
// Bumped 2026-09-27 from 2.9.48, and earlier the same day from 2.9.47;
// before that 2026-09-23 from 2.9.46,
// 2026-09-22 from 2.9.45, 2026-09-21 from 2.9.44 and,
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
// 2.9.48 moved no figure on that surface: 82 fixtures, 1957/2011, 54 skips on
// 23 fixtures, and 13 of 13 in P6 with zero changed rows. The JavaScript suite
// went 1315 -> 1325 (LW-1..LW-6, and R-v298-B10 reading its figures from the
// harness summary). The fixtures card's sub-label still said "the other seven",
// right at 46 clean of 53 and wrong since 2.9.47 (59 of 82 leaves 23); it now
// computes the complement instead of spelling it out.
// 2.9.49 grew the surface: 82 -> 99 fixtures and 1957/2011 -> 2465/2539, the
// 17 new fixtures (F87-F103) exercising the Must Finish By, the resume date,
// completed-to-completed links and free float to a completed successor's
// stamp. Skips went 54 -> 74 on 23 -> 30 fixtures, again all mutual pairs on
// completed activities (seven of the new fixtures carry one), leaving 69
// clean. The JavaScript suite went 1325 -> 1345, and the P6 comparison matrix
// still reports 13 of 13 with zero changed rows.
// 2.9.50 grew the surface: 99 -> 101 fixtures and 2465/2539 -> 2623/2705, the
// 2 new fixtures (F104-F105, 11 activities each) pinning the Must Finish By
// under "opened projects" as P6 applied it. Skips went 74 -> 82 on 30 -> 32
// fixtures, all mutual pairs on completed activities (both new fixtures
// carry two), leaving 69 clean. The JavaScript suite went 1345 -> 1346, and
// the P6 comparison matrix still reports 13 of 13 with zero changed rows.
// 2.9.51 left the surface as it was (parseXER keeps completed activities;
// the harness hands computeCPM its networks directly). The JavaScript
// suite went 1346 -> 1352.
// 2.9.52 grew the surface: 101 -> 106 fixtures and 2623/2705 -> 3202/3288,
// the 5 new fixtures (F106-F110) pinning P6's "Use Expected Finish Dates"
// and finish constraints on work under way. Skips went 82 -> 86 on 32 -> 34
// fixtures, all mutual pairs on completed activities, leaving 72 clean. The
// JavaScript suite went 1352 -> 1371, and the P6 comparison matrix still
// reports 13 of 13 with zero changed rows.
// 2.9.53 grew the surface: 106 -> 108 fixtures and 3202/3288 -> 3482/3580,
// the 2 new fixtures (F111-F112) pinning an expected finish that leaves no
// working time, with and without resource assignments, as P6 schedules it.
// Skips went 86 -> 98 on 34 -> 36 fixtures, all mutual pairs on completed
// activities, leaving 72 clean. The JavaScript suite went 1371 -> 1377, and
// the P6 comparison matrix still reports 13 of 13 with zero changed rows.
// 2.9.54 grew the surface: 108 -> 112 fixtures and 3482/3580 -> 3814/3912,
// the 4 new fixtures (F113-F116) pinning constraints dated on time the
// calendar does not work, As Late As Possible by free float and a finish
// milestone held at a Friday close, as P6 schedules them. Skips stayed 98 on
// 36 fixtures (the new four have none), leaving 76 clean. The JavaScript
// suite went 1377 -> 1387, and the P6 comparison matrix still reports 13 of
// 13 with zero changed rows.
// 2.9.55 grew the surface: 112 -> 114 fixtures and 3814/3912 -> 3924/4022,
// the 2 new fixtures (F117-F118) the first to hand both engines a total float
// method, pinning the start float of work under way as P6 measures it (from
// the restart, not the actual start). Skips stayed 98 on 36 fixtures (the new
// two have none), leaving 78 clean. The JavaScript suite went 1387 -> 1391,
// and the P6 comparison matrix still reports 13 of 13 with zero changed rows.
// 2.9.56 changed what parseXER hands on (the scheduling options P6 applies by
// default when SCHEDOPTIONS is missing or blank), not the compared surface:
// 114 fixtures and 3924/4022 stand. The JavaScript suite went 1391 -> 1395.
// 2.9.57 grew the surface: 114 -> 116 fixtures and 3924/4022 -> 4244/4342,
// the 2 new fixtures (F119-F120) handing both engines an activity's external
// early start and external late finish, applied and ignored, as P6 schedules
// them. Skips stayed 98 on 36 fixtures (the new two have none), leaving 80
// clean. The JavaScript suite went 1395 -> 1402, and the P6 comparison matrix
// still reports 13 of 13 with zero changed rows.
// 2.9.58 grew the surface: 116 -> 119 fixtures and 4244/4342 -> 4675/4773,
// the 3 new fixtures (F121-F123) handing both engines the milestone shapes
// whose printed dates now follow P6 (a milestone prints the date of the
// instant it sits at), and the dates check now carries the printed finish
// dates. Skips stayed 98 on 36 fixtures, leaving 83 clean. The JavaScript
// suite went 1402 -> 1409, and the P6 comparison matrix still reports 13 of
// 13 with zero changed rows.
// 2.9.59 grew the surface: 119 -> 121 fixtures and 4675/4773 -> 4869/4967,
// the 2 new fixtures (F124-F125) handing both engines zero-length tasks and
// progress override's links into a started activity's finish (P6 parity on
// whole-day schedules). Skips stayed 98 on 36 fixtures, leaving 85 clean. The
// JavaScript suite went 1409 -> 1416, and the P6 comparison matrix still
// reports 13 of 13 with zero changed rows.
// 2.10.0 grew the surface: 121 -> 127 fixtures and 4869/4967 -> 5133/5233,
// the 6 new fixtures (F126-F131) handing both engines P6's hours and comparing
// the hours pass too (the engine schedules in hours and minutes). Skips went
// 98 -> 100 on 37 fixtures, leaving 90 clean. The JavaScript suite went
// 1416 -> 1435, and the P6 comparison matrix still reports 13 of 13 with zero
// changed rows.
// 2.10.1 grew the surface: 127 -> 136 fixtures and 5133/5233 -> 6994/6994,
// the 9 new fixtures (F132-F140) handing both engines resource dependent work,
// the float and critical set P6 prints, calendar-less float, a future actual
// finish and normalized constraints; every activity also compares its start
// and finish float. Skips went 100 -> 0: both engines now emit the signed
// free-float pair on completed activities, so all 136 fixtures are clean. The
// JavaScript suite went 1435 -> 1456, and the P6 comparison matrix still
// reports 13 of 13 with zero changed rows.
// 2.10.2 grew the surface: 136 -> 143 fixtures and 6994/6994 -> 7634/7634,
// the 7 new fixtures (F141-F147) handing both engines start constraints on
// work under way, As Late As Possible under way and past its late finish, and
// free float across a lag. Skips stay 0, so all 143 fixtures are clean. The
// JavaScript suite went 1456 -> 1461, and the P6 comparison matrix still
// reports 13 of 13 with zero changed rows.
// 2.10.3 grew the surface: 143 -> 151 fixtures and 7634/7634 -> 8745/8745,
// the 8 new fixtures (F148-F155) handing both engines a mandatory date before
// the data date, SS free float out of work under way, and SS / SF out of work
// under way under progress override. Skips stay 0, so all 151 fixtures are
// clean. The JavaScript suite went 1461 -> 1468, and the P6 comparison matrix
// still reports 13 of 13 with zero changed rows.
// 2.10.4 grew the surface: 151 -> 158 fixtures and 8745/8745 -> 9836/9836,
// the 7 new fixtures (F156-F162) handing both engines SS out of work under
// way under progress override laid from the data date, a constraint of a
// milestone's other end, a lead landing on a close, and an expected finish
// on a milestone. Skips stay 0, so all 158 fixtures are clean. The
// JavaScript suite went 1468 -> 1481, and the P6 comparison matrix still
// reports 13 of 13 with zero changed rows.
// 2.10.5 grew the surface: 158 -> 159 fixtures and 9836/9836 -> 9873/9873,
// the new fixture (F163) handing both engines a lag handed on in days under
// the successor lag calendar. Skips stay 0, so all 159 fixtures are clean.
// The JavaScript suite went 1481 -> 1485, and the P6 comparison matrix
// still reports 13 of 13 with zero changed rows.
// 2.10.6 grew the surface: 159 -> 162 fixtures and 9873/9873 -> 10350/10350,
// the new fixtures (F164-F166) handing both engines As Late As Possible work
// past a successor under way under progress override and a Mandatory Start or
// Finish against an earlier link bound. Skips stay 0, so all 162 fixtures are
// clean. The JavaScript suite went 1485 -> 1489, and the P6 comparison matrix
// still reports 13 of 13 with zero changed rows.
// 2.10.7 grew the surface: 162 -> 168 fixtures and 10350/10350 -> 11149/11149,
// the new fixtures (F167-F172) handing both engines a schedule dated 2013,
// As Late As Possible work under way over start-to-start and start-to-finish
// lags, and a start-to-start link out of completed work under "SS lag from
// Actual Start". Skips stay 0, so all 168 fixtures are clean. The JavaScript
// suite went 1489 -> 1498, and the P6 comparison matrix still reports 13 of 13
// with zero changed rows.
// 2.10.8 grew the surface: 168 -> 170 fixtures and 11149/11149 -> 11390/11390,
// the new fixtures (F173, F174) handing both engines a resume date after the
// data date under progress override, in hours and in whole days. Skips stay
// 0, so all 170 fixtures are clean. The JavaScript suite stays at 1498 (the
// release's rules are pinned by the P6 probe replays), and the P6 comparison
// matrix still reports 13 of 13 with zero changed rows.
// 2.10.9 grew the surface: 170 -> 172 fixtures and 11390/11390 -> 11612/11612,
// the new fixtures (F175, F176) handing both engines a start-to-start or
// start-to-finish lag off a suspended predecessor, forward and backward, in
// hours and in whole days. Skips stay 0, so all 172 fixtures are clean. The
// JavaScript suite stays at 1498 and the P6 comparison matrix still reports
// 13 of 13 with zero changed rows.
// 2.10.10 grew the surface: 172 -> 174 fixtures and 11612/11612 -> 11776/11776,
// the new fixtures handing both engines resource dependent work with an
// assignment that has no work: F177 with its start set by a finish
// requirement, F178 with no bound taken in the backward pass, in hours. Skips
// stay 0, so all 174 fixtures are clean. The JavaScript suite
// stays at 1498 and the P6 comparison matrix still reports 13 of 13 with
// zero changed rows.
// 2.10.11 grew the surface: 174 -> 183 fixtures and 11776/11776 -> 12887/12887,
// the new fixtures handing both engines no expected finish on As Late As
// Possible work (F179, F180), open-ended work under "Make open-ended
// activities critical" and its edges (F181 to F184), and an expected finish
// against a finish constraint on work not yet started (F185, F186), each in
// hours and in whole days, and the four relationship checks the Python
// reference now raises (F187). Skips stay 0, so all 183 fixtures are clean.
// The JavaScript suite stays at 1498 and the P6 comparison matrix still
// reports 13 of 13 with zero changed rows.
// 2.10.12 grew the surface: 183 -> 207 fixtures and 12887/12887 -> 17926/17926,
// the new fixtures handing both engines mandatory dates beside expected
// finishes and second constraints (F188 to F193, F197, F198, F203, F204), the
// Python reference's input checks (F194 to F196), As Late As Possible free
// float with and without "Calculate multiple float paths" (F197, F198, F201,
// F202) and the hours-pass rules for resource dependent work (F199, F200, F205
// to F211). Skips stay 0, so all 207 fixtures are clean. The JavaScript suite
// stays at 1498 and the P6 comparison matrix still reports 13 of 13 with zero
// changed rows.
// 2.10.13 grew the surface: 207 -> 233 fixtures and 17926/17926 -> 22189/22189,
// the new fixtures handing both engines the activity "Calculate multiple float
// paths" ends at (F212 to F215), two finish constraints on work under way (F217,
// F218), P6's float-type codes (F230 to F235) and the hours-pass rules for
// resource dependent work (F216, F219 to F229, F236, F237). Skips stay 0, so
// all 233 fixtures are clean. The JavaScript suite went 1498 -> 1500 (two
// float-type checks) and the P6 comparison matrix still reports 13 of 13 with
// zero changed rows.
// 2.10.14 changes what the engine records as the driver of work under way
// (TD-1) and moves no date: the surface stays at 233 fixtures and
// 22189/22189, the JavaScript suite went 1500 -> 1510 (T-TD1-1 to T-TD1-10)
// and the P6 comparison matrix still reports 13 of 13.
const ENGINE_VERSION = '2.10.14';

// Layer 1 — two ports of the same algorithm, by the same author.
const CROSSVAL_FIXTURES = 233;
const CROSSVAL_EXECUTED = 22189;
const CROSSVAL_POSSIBLE = 22189;
const CROSSVAL_SKIPPED = 0;
const CROSSVAL_CLEAN_FIXTURES = 233;
const JS_UNIT_TESTS = 1510;
// c8 over cpm-engine.js running the crossval harness at the v2.10.14 tag,
// measured 2026-10-25: 8,992 of 14,798 statements (60.76%).
const ENGINE_STATEMENT_COVERAGE = '61%';

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
  ['The port total skips nothing',
   `The cross-validation harness runs ${CROSSVAL_EXECUTED} comparisons and all of them pass, and it skips none: agreement is ${CROSSVAL_EXECUTED} of ${CROSSVAL_POSSIBLE}, and ${CROSSVAL_CLEAN_FIXTURES} of ${CROSSVAL_FIXTURES} fixtures are free of any divergence. Through v2.10.0 one hundred comparisons were skipped rather than failed, on the two signed free-float fields of completed activities where neither implementation assigned the field; both have emitted it there since v2.10.1, and those comparisons run. The headline counts comparisons run; it is still not a pass rate over every behaviour, only over the fixtures listed.`],
  ['Same author, both ports',
   'The JavaScript engine and the Python reference are written and maintained by the same person. That catches transcription and refactor drift. It cannot catch a shared misreading of how P6 behaves, which is why the P6 comparison exists and why it carries more weight.'],
  ['Most of the engine has no second implementation',
   `The cross-validation exercises about ${ENGINE_STATEMENT_COVERAGE} of the engine's statements. The Monte Carlo path, the DCMA-14 health computation, fragnet insertion for time impact analysis, the Bayesian update and the statutory-holiday calendars have no Python counterpart and are not cross-validated at all. Float burndown and the topology hash do have Python counterparts and, since August 2026, are compared against them field by field on an internal extended harness that also covers the salvage and strategy surfaces. That harness is not in the public repository, so the comparison is not independently runnable, and none of the figures on this page include it.`],
  ['Small synthetic networks',
   'All two hundred and thirty-three fixtures are hand-built; most carry a handful of activities and the largest thirty-six. No real schedule and no XER file is cross-validated. The thirteen P6 cases are the same shape, twenty-seven activities in total.'],
  ['Day granular without hours',
   'Where the caller hands on P6\'s own hours the engine schedules in hours and minutes. Without them it works in whole days: a sub-day lag rounds and raises an alert that is fatal in strict mode. The thirteen matrix cases hand on days, so the sub-day lag case cannot be compared field for field and is excluded from the matrix rather than counted as a pass.'],
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
        sub: CROSSVAL_SKIPPED ? `${CROSSVAL_SKIPPED} comparisons skipped, not failed` : 'every comparison defined, none skipped',
        tone: 'ink'
      }),
      kpiCard({
        title: 'Fixtures with no divergence',
        big: `${CROSSVAL_CLEAN_FIXTURES} of ${CROSSVAL_FIXTURES}`,
        sub: CROSSVAL_FIXTURES - CROSSVAL_CLEAN_FIXTURES ? `the other ${CROSSVAL_FIXTURES - CROSSVAL_CLEAN_FIXTURES} carry mutual skips, not disagreements` : 'every fixture, with nothing skipped',
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
      h('p', {}, `On the two ports: the harness compares a JavaScript and a Python implementation field by field and reports ${CROSSVAL_EXECUTED} of ${CROSSVAL_EXECUTED}. That is the count of comparisons it actually ran, and since v2.10.1 it is every comparison the harness defines: none is skipped, so counted properly it is ${CROSSVAL_EXECUTED} of ${CROSSVAL_POSSIBLE}. Through v2.10.0 one hundred were skipped rather than compared, on completed activities where neither implementation emitted the signed free-float field; a skipped comparison is not a passing one, which is why those were counted apart.`),
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
