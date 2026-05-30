// @vitest-environment node
//
// Large-XER COMPUTE performance guard (10,000 activities / 9,999 relationships).
//
// Scope note: this guards the compute path (parse + cross-reference maps),
// which is pure JS and representative of real-world cost. It deliberately does
// NOT time section *rendering* — rendering needs a DOM, and happy-dom's
// simulated DOM is pathologically slow at building thousands of nodes (it
// hangs on a 10k render in a way a real browser never would, so its timings
// would be misleading). Render correctness at scale / on hostile shapes is
// covered by tests/sections/adversarial-render.test.js, and every list
// section caps its row output (schedule-viewer 500, gantt 200, raw-tables
// 5000, lookahead 100/wk, path-explorer 5000) so no section emits 10k DOM
// nodes in a real browser.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer, buildPredecessorMap, buildWbsMap } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');
const XER = readFileSync(join(FIX, 'large-10k.xer'), 'utf-8');

// Generous budgets — measured ~33ms parse / ~3ms predMap on a 2023 laptop.
// Set ~30x over measured so the guard catches an O(n^2) regression (which
// would balloon into seconds) without flaking on a slow CI box.
const PARSE_BUDGET_MS = 1000;
const XREF_BUDGET_MS = 500;

describe('large-XER compute performance (10k activities)', () => {
  it(`parses 10k activities under ${PARSE_BUDGET_MS}ms`, () => {
    const t0 = performance.now();
    const A = parseXer(XER, { filename: 'large-10k.xer' });
    const dt = performance.now() - t0;
    expect(A.tables.TASK.records.length).toBe(10000);
    expect(A.tables.TASKPRED.records.length).toBe(9999);
    expect(dt, `parse took ${dt.toFixed(0)}ms`).toBeLessThan(PARSE_BUDGET_MS);
  });

  it(`builds predecessor + WBS maps under ${XREF_BUDGET_MS}ms (guards against O(n^2))`, () => {
    const A = parseXer(XER);
    const t0 = performance.now();
    const pred = buildPredecessorMap(A);
    const wbs = buildWbsMap(A);
    const dt = performance.now() - t0;
    // Sanity: the maps are actually populated (a no-op map would pass the timer).
    expect(Object.keys(pred.predecessors).length + Object.keys(pred.successors).length).toBeGreaterThan(0);
    expect(wbs).toBeDefined();
    expect(dt, `cross-ref maps took ${dt.toFixed(0)}ms`).toBeLessThan(XREF_BUDGET_MS);
  });
});
