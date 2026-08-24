// @vitest-environment happy-dom
//
// STRUCTURAL GUARD — no comparison section may key A↔B matching on task_id.
//
// Two layers, because a rule that only exists in a docstring gets re-broken:
//
//   1. BEHAVIOURAL (self-maintaining). Renumbering every internal surrogate
//      task_id, while leaving task_code alone, is exactly what P6 does on
//      re-export and must be a NO-OP. Every registered section is rendered
//      against A-vs-A and A-vs-A-re-exported; any section whose output moves
//      is reading the surrogate. This covers sections that do not exist yet —
//      nobody has to remember to add them to a list.
//
//   2. STATIC. The specific broken idioms — building a lookup keyed on
//      String(x.task_id), or an identity resolver that tries 'task_id' before
//      'task_code' — are banned outright in src/sections.
//
// THE FIXTURE HAS TO CARRY THE DATA EACH SECTION READS.
// Layer 1 was built on SAMPLE_XER, which has no ACTVTYPE / ACTVCODE / TASKACTV
// tables at all. Narrative Flip reads exactly those three, so it rendered
// "0 flips" for both arms and the comparison was 0 === 0 — a section that keyed
// wholly on task_id passed that layer untouched. The fixture now runs through
// withActivityCodes(), and the "teeth" block below fails if the flip layer ever
// goes quiet again.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer, getTable, buildActivityCodeMap } from '@criticalpathpartners/lens-parser';
import { SECTIONS } from '../../src/sections/_registry.js';
import { SAMPLE_XER } from '../../src/sample/sample-schedule.js';
import { render as renderNarrativeFlip } from '../../src/sections/narrative-flip.js';
import { reexport, identityOverlap, assertDivergentSurrogates } from '../fixtures/reexport.js';
import { withActivityCodes } from '../fixtures/activity-codes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECTIONS_DIR = join(__dirname, '..', '..', 'src', 'sections');

/** SAMPLE_XER plus the activity-code tables the Compare-group sections read. */
const CODED_XER = withActivityCodes(SAMPLE_XER);

/** Read a KPI card's big number by its title. */
function kpi(el, title) {
  for (const card of el.querySelectorAll('.kpi')) {
    if (card.querySelector('.kpi-title')?.textContent === title) {
      return card.querySelector('.kpi-big')?.textContent;
    }
  }
  return null;
}

/** Every .js file under src/sections, including _shared. Derived, never listed. */
function sectionSourceFiles(dir = SECTIONS_DIR, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sectionSourceFiles(full, acc);
    else if (entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. BEHAVIOURAL — a re-export must change nothing
// ─────────────────────────────────────────────────────────────────────────────

describe('renumbering the surrogate task_id is a no-op for every section', () => {
  // A and B are the SAME export twice — deliberately. That arm is the control:
  // a section keyed on task_id matches everything here and nothing against BRe,
  // so the two texts diverge and the guard fires. Make both arms re-exports and
  // a task_id-keyed section matches nothing in either, the texts agree, and the
  // guard goes quiet. The pair that must be divergent is B vs BRe, asserted below.
  const A = parseXer(CODED_XER, { filename: 'A.xer' });
  const B = parseXer(CODED_XER, { filename: 'B.xer' });
  const BRe = reexport(parseXer(CODED_XER, { filename: 'B.xer' }));

  it('the fixture really is a re-export: every task_id moved, every task_code stayed', () => {
    const overlap = assertDivergentSurrogates(B, BRe, {
      minSharedCodes: B.tables.TASK.records.length
    });
    expect(overlap.sharedTaskIds).toBe(0);
    expect(overlap.sharedCodes).toBe(B.tables.TASK.records.length);
    expect(identityOverlap(B, BRe)).toEqual(overlap);
  });

  it('the re-export kept its relationship endpoints internally consistent', () => {
    const ids = new Set(BRe.tables.TASK.records.map(t => String(t.task_id)));
    for (const r of BRe.tables.TASKPRED.records) {
      expect(ids.has(String(r.task_id))).toBe(true);
      expect(ids.has(String(r.pred_task_id))).toBe(true);
    }
  });

  it('the re-export renumbered the activity-code assignments too', () => {
    // TASKACTV.task_id is a surrogate reference like any other. Leaving it
    // behind is precisely what made every activity read as a narrative flip.
    const ids = new Set(BRe.tables.TASK.records.map(t => String(t.task_id)));
    const taskactv = getTable(BRe, 'TASKACTV');
    expect(taskactv.length).toBeGreaterThan(0);
    for (const ta of taskactv) {
      expect(ids.has(String(ta.task_id)), `TASKACTV row ${ta.task_id} has no TASK row`).toBe(true);
    }
  });

  for (const section of SECTIONS) {
    it(`${section.id} renders identically against B and re-exported B`, () => {
      const plain = section.render({ A, B });
      const renumbered = section.render({ A, B: BRe });
      expect(renumbered.textContent).toBe(plain.textContent);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1b. THE FIXTURE ITSELF — prove the Narrative Flip layer can move at all
//
// A guard that cannot fail reports clean. Layer 1 ran Narrative Flip against a
// fixture with no activity codes in it, so both arms rendered "0 flips" and the
// equality held for the wrong reason. These three tests fail the moment the
// fixture loses its code tables or the section stops reading them.
// ─────────────────────────────────────────────────────────────────────────────

describe('the Narrative Flip layer of this guard has teeth', () => {
  const A = parseXer(CODED_XER, { filename: 'A.xer' });
  const B = parseXer(CODED_XER, { filename: 'B.xer' });

  it('the fixture carries real activity-code assignments', () => {
    expect(getTable(A, 'ACTVTYPE').length).toBeGreaterThan(0);
    expect(getTable(A, 'ACTVCODE').length).toBeGreaterThan(0);
    expect(getTable(A, 'TASKACTV').length).toBeGreaterThan(0);
    // and they survive the parser's join, which is what the section consumes
    expect(Object.keys(buildActivityCodeMap(A)).length).toBe(getTable(A, 'TASK').length);
  });

  it('the section reports a real shared population, not an empty one', () => {
    const el = renderNarrativeFlip({ A, B });
    expect(kpi(el, 'Shared activities compared')).toBe(String(getTable(A, 'TASK').length));
    expect(kpi(el, 'Total flips detected')).toBe('0');
    expect(kpi(el, 'Unchanged activities')).toBe(String(getTable(A, 'TASK').length));
  });

  it('moving one code assignment DOES produce a flip', () => {
    // If this ever reads 0, the section is blind to the data the guard renders
    // and "identical output" above means nothing.
    const moved = parseXer(CODED_XER, { filename: 'B.xer' });
    getTable(moved, 'TASKACTV')[0].actv_code_id = 'AC2';
    const el = renderNarrativeFlip({ A, B: moved });
    expect(Number(kpi(el, 'Total flips detected'))).toBeGreaterThan(0);
    expect(el.textContent).toContain('CIVIL');
    expect(el.textContent).toContain('ELEC');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. STATIC — the broken idioms are banned in source
// ─────────────────────────────────────────────────────────────────────────────

const BANNED = [
  {
    // aById[String(t.task_id)] = t   — the Half-Step bug, verbatim
    re: /\[\s*String\(\s*\w+(?:\.\w+)*\.task_id\s*\)\s*\]\s*=/,
    why: 'builds an object lookup keyed on the export-specific task_id'
  },
  {
    // map.set(String(t.task_id), t)
    re: /\.set\(\s*String\(\s*\w+(?:\.\w+)*\.task_id\s*\)\s*,/,
    why: 'builds a Map keyed on the export-specific task_id'
  },
  {
    // new Set(rows.map(t => String(t.task_id)))  used as a cross-model key set
    re: /new Set\(\s*\w+(?:\.\w+)*\.map\(\s*\w+\s*=>\s*String\(\s*\w+\.task_id\s*\)\s*\)\s*\)/,
    why: 'builds a key Set from the export-specific task_id'
  },
  {
    // getFirstField(t, ['task_id', ...]) as an identity resolver
    re: /getFirstField\(\s*\w+\s*,\s*\[\s*['"]task_id['"]\s*,\s*['"]task_code['"]/,
    why: 'resolves identity with task_id ahead of task_code'
  },
  {
    // const id = t.task_id || t.task_code   — the Narrative Flip bug, verbatim
    re: /\w+\s*=\s*\w+\.task_id\s*\|\|\s*\w+\.task_code/,
    why: 'prefers task_id over task_code when picking an activity key'
  }
];

describe('no section reinvents surrogate-keyed matching', () => {
  const files = sectionSourceFiles();

  it('finds the section sources to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    const rel = relative(SECTIONS_DIR, file).replace(/\\/g, '/');
    it(`${rel} contains no surrogate-keyed index`, () => {
      const src = readFileSync(file, 'utf-8');
      const hits = BANNED.filter(b => b.re.test(src)).map(b => b.why);
      expect(hits, `${rel}: ${hits.join('; ')} — use _shared/identity.js instead`).toEqual([]);
    });
  }

  it('identity.js is the only place the code-then-id fallback is written', () => {
    // Exactly one implementation. Anything else is a copy waiting to drift.
    const implementers = sectionSourceFiles().filter(f => {
      const src = readFileSync(f, 'utf-8');
      return /task_code[\s\S]{0,120}?matched_on/.test(src);
    }).map(f => relative(SECTIONS_DIR, f).replace(/\\/g, '/'));
    expect(implementers).toEqual(['_shared/identity.js']);
  });

  it('every Compare-group section imports identity from the shared module', () => {
    // Sections that take a B model and match against it must not roll their own.
    const compareSections = ['half-step.js', 'narrative-flip.js', 'period-reporting.js', 'gantt.js'];
    for (const name of compareSections) {
      const src = readFileSync(join(SECTIONS_DIR, name), 'utf-8');
      expect(src, `${name} must import from _shared/identity.js`).toMatch(/from '\.\/_shared\/identity\.js'/);
    }
    const diff = readFileSync(join(SECTIONS_DIR, '_shared', 'diff-models.js'), 'utf-8');
    expect(diff).toMatch(/from '\.\/identity\.js'/);
  });
});
