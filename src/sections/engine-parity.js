import { h } from '../lib/dom.js';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

/**
 * Engine parity — what has been validated, and what has not.
 *
 * Every figure here comes from the engine repository rather than from memory,
 * and `tests/engine-parity.test.js` asserts these constants still match the
 * engine's own single source of truth. A viewer quoting a validation number the
 * engine has moved past is worse than one quoting none.
 *
 * Built from the shell's existing kpiCard and dataTable helpers on purpose. A
 * first draft invented five class names (lens-kpi-row, lens-kpi-label,
 * lens-kpi-value, lens-kpi-sub, lens-note) that do not exist in shell.css, so it
 * would have rendered unstyled while looking correct in source.
 */
const ENGINE_VERSION = '2.9.39';

// Layer 1 — two independent implementations of the same algorithm.
const CROSSVAL_FIXTURES = 45;
const CROSSVAL_CHECKS = '925 / 925';
const JS_UNIT_TESTS = 1134;

// Layer 2 — the engine against Primavera P6 itself.
const P6_VERSION = 'Primavera P6 23.12';
const P6_CASES_PASSED = 13;
const P6_CASES_TOTAL = 13;
const P6_FIELD_CHECKS = 27;

export const PARITY_FACTS = {
  ENGINE_VERSION,
  CROSSVAL_FIXTURES,
  CROSSVAL_CHECKS,
  JS_UNIT_TESTS,
  P6_CASES_PASSED,
  P6_CASES_TOTAL,
  P6_FIELD_CHECKS
};

/** All thirteen P6-comparable cases. Never a subset: the point of publishing a
 *  matrix is that a reader sees the awkward cases as well as the easy ones. */
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

/** The published limits. These are the reason the rest is worth anything. */
const LIMITS = [
  ['Day granular',
   'The engine works in whole days. A sub-day lag rounds and raises an alert that is fatal in strict mode. P6 stores lags in hours, so on that case the two cannot be compared field for field at all, and it is excluded from the matrix rather than counted as a pass.'],
  ['No resource levelling',
   'Levelling is not modelled. Dates are driven by logic and calendars only.'],
  ['One free-float asymmetry',
   'Free float carries a single documented asymmetry against P6, published in the engine repository rather than left for someone to discover.'],
  ['Two cases P6 cannot construct',
   'A sub-day lag, and a relationship pointing at an activity that does not exist. Both are documented as engine limitations instead of being quietly dropped from the denominator.']
];

// dataTable keys each cell by column.key off a row OBJECT. Passing arrays with
// label-only columns renders a table of empty cells that looks fine in source.
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
        title: 'Against P6',
        big: `${P6_CASES_PASSED} of ${P6_CASES_TOTAL}`,
        sub: `${P6_FIELD_CHECKS} field checks, ${P6_VERSION}`,
        tone: 'green'
      }),
      kpiCard({
        title: 'Implementation parity',
        big: CROSSVAL_CHECKS,
        sub: `${CROSSVAL_FIXTURES} fixtures, JavaScript against Python`,
        tone: 'green'
      }),
      kpiCard({
        title: 'Engine unit tests',
        big: JS_UNIT_TESTS,
        sub: 'run on every release',
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
      h('h3', {}, 'Two separate questions'),
      h('p', {}, 'Whether two independent implementations of the same algorithm agree with each other, and whether the engine agrees with Primavera P6. They are answered separately because they are not the same claim, and the second is both the one that matters and the harder one to make.'),
      h('p', {}, `Thirteen small schedules were built to isolate one scheduling behaviour each, imported into ${P6_VERSION}, and scheduled there by a human operator pressing F9. P6's answers were recorded field by field and pinned as data. The engine was then run on the same thirteen inputs and compared against those pinned answers.`),
      h('p', {}, 'The first comparison passed six of thirteen. The seven gaps sorted into five families, each was fixed in both implementations against the answers P6 had already given, and the fix history is public. The matrix now stands at thirteen of thirteen, and it is regenerated from the case data rather than kept by hand, so it cannot drift away from the results it summarises.'),
      h('p', {}, 'No parity claim is made beyond the ground these thirteen cases cover.')
    ]),

    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'The thirteen cases, every one listed'),
      dataTable({
        columns: CASE_COLS,
        rows: P6_CASES.map(([n, name, what]) =>
          ({ n, name, what, verdict: 'match' }))
      })
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
