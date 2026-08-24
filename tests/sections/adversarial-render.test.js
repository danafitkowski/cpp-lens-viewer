// @vitest-environment jsdom
//
// jsdom (not happy-dom) because one scenario parses P6 XML via parseP6Xml,
// and happy-dom's DOMParser silently HTML-parses an XML string. jsdom builds
// DOM for the section renderers identically, so the rest of the pass is
// unaffected.
//
// Adversarial render pass — hardening, not happy-path. The all-wired test
// proves every section renders on the CLEAN minimal fixture. This proves
// every section survives the shapes a real-world upload actually throws at it:
//
//   1. A P6 XML-parsed model (parseP6Xml output) — same logical data, but
//      built by a different code path than parseXer. Sections that assume
//      XER-only quirks can crash here.
//   2. A degenerate model — valid ERMHDR, ZERO tables. (User uploads a
//      truncated / header-only export.)
//   3. A "tables present but columns missing" model — every known table
//      exists but carries one junk field instead of the columns the section
//      reads. (P6 export profiles vary wildly in which columns they emit.)
//   4. An empty/just-created model.
//
// A section "passing" means render() returns a DOM node and does NOT throw.
// Rendering an empty-state or "no data" card is a PASS — crashing is a FAIL.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer, parseP6Xml, createEmptyModel } from '@criticalpathpartners/lens-parser';
import { SECTIONS } from '../../src/sections/_registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

// Known P6 tables the viewer's sections touch.
const KNOWN_TABLES = [
  'PROJECT', 'PROJWBS', 'TASK', 'TASKPRED', 'TASKRSRC', 'RSRC',
  'ACTVTYPE', 'ACTVCODE', 'TASKACTV', 'UDFTYPE', 'UDFVALUE',
  'CALENDAR', 'MEMOTYPE', 'TASKMEMO', 'POBS', 'RCATTYPE', 'RCATVAL',
];

function degenerateModel() {
  const m = createEmptyModel();
  m.ermhdr = { version: '24.12', exportdate: '2026-02-13', project: 'x', user: 'u', db: 'd' };
  m.filename = 'header-only.xer';
  return m; // ZERO tables
}

function tablesButNoFieldsModel() {
  const m = createEmptyModel();
  m.ermhdr = { version: '24.12', exportdate: '2026-02-13', project: 'x', user: 'u', db: 'd' };
  m.filename = 'sparse-columns.xer';
  // Every known table exists but carries ONE row with ONE junk column —
  // none of the fields any section actually reads.
  for (const t of KNOWN_TABLES) {
    m.tables[t] = { fields: ['junk_col'], records: [{ junk_col: 'x' }] };
  }
  return m;
}

const SCENARIOS = [
  {
    name: 'P6 XML-parsed model',
    model: () => parseP6Xml(readFileSync(join(FIX, 'minimal-3-task.xml'), 'utf-8')),
  },
  {
    name: 'degenerate (header-only, zero tables)',
    model: degenerateModel,
  },
  {
    name: 'tables present but columns missing',
    model: tablesButNoFieldsModel,
  },
  {
    name: 'empty model',
    model: () => createEmptyModel(),
  },
];

describe('adversarial render pass — no section may throw', () => {
  for (const scenario of SCENARIOS) {
    describe(scenario.name, () => {
      const A = scenario.model();
      for (const section of SECTIONS) {
        it(`${section.id} survives`, () => {
          let el;
          expect(() => { el = section.render({ A, B: null }); }).not.toThrow();
          expect(el).toBeDefined();
        });
      }
    });
  }
});

// FIXTURE-EXEMPT(two-model-identity): B is a header-only model with no TASK
// table at all, so there is no surrogate to diverge and no Activity ID to share.
// This pass asserts only that no section throws on a mismatched pair; it makes
// no claim about matching, so the divergent-surrogate precondition does not
// apply. Matching behaviour is pinned in identity-across-exports.test.js and
// cross-schedule-matching.test.js.
describe('adversarial compare pass — B is degenerate while A is real', () => {
  const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
  const B = degenerateModel();
  for (const section of SECTIONS) {
    it(`${section.id} survives mismatched A/B`, () => {
      let el;
      expect(() => { el = section.render({ A, B }); }).not.toThrow();
      expect(el).toBeDefined();
    });
  }
});
