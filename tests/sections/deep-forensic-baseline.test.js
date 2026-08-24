// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { parseXer, gunzipFromBase64 } from '@criticalpathpartners/lens-parser';
import { render, TOOLS } from '../../src/sections/deep-forensic.js';
import { runDeepForensic, ENGINE_TOOLS, toolRequiresBaseline } from '../../src/mcp/client.js';
import { anonymizeModel, anonymizeModelPair } from '../../src/mcp/anonymizer.js';
import { prefsStore } from '../../src/state/prefs.js';
import { assertDivergentSurrogates } from '../fixtures/reexport.js';

/**
 * The baseline was never sent.
 *
 * deep-forensic.js rendered with { A, B }, and its submit handler read only A.
 * The call to runDeepForensic omitted xerBaselineBase64 entirely, so the
 * transport's `xer_baseline_base64: opts.xerBaselineBase64 || null` sent null on
 * every run since the section shipped. The Engine's forensic-delay-analysis
 * adapter, handed one file, duplicates it as both snapshots — so every published
 * Deep Forensic windows analysis compared the current schedule against ITSELF:
 * a one-day analysis period, 0wd baseline-to-final slip, identical completions,
 * no slipped activities, no float movement, on two schedules that genuinely
 * finish on different dates.
 *
 * The old tests passed throughout, because none of them looked at the payload.
 *
 * The fixtures below carry the real-world condition on purpose: the same
 * activities appear in both files under the same task_code with DIFFERENT
 * task_id values (P6 reassigns the surrogate id on every export), and the two
 * files hold different activity SETS in different row order. That second part
 * is what makes the shared-anon-map assertion bite: with a fresh map per call,
 * row 3 of each file gets the same token for two different activities.
 */

const HDR = 'ERMHDR\t24.12\t2026-01-01\tProject\tadmin\tCLIENT_DB\tdb\tProject Management\tCAD';

function xerText(tasks) {
  return [
    HDR,
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tproj_long_name',
    '%R\t1\tPRJ\tSt Marys Civil Works',
    '%T\tPROJWBS',
    '%F\twbs_id\tproj_id\twbs_name\twbs_short_name',
    '%R\t10\t1\tCivil\tCIV',
    '%T\tTASK',
    '%F\ttask_id\tproj_id\twbs_id\tclndr_id\ttask_code\ttask_name\tstatus_code\t' +
      'target_start_date\ttarget_end_date\ttarget_drtn_hr_cnt',
    ...tasks.map(t => [
      '%R', t.task_id, '1', '10', '1', t.task_code, t.task_name,
      t.status_code || 'TK_NotStart', t.start, t.end, t.dur || '40'
    ].join('\t')),
    '%E',
  ].join('\n') + '\n';
}

// Current schedule (A). task_ids in the 5000s.
const CURRENT_XER = xerText([
  { task_id: '5001', task_code: 'A1000', task_name: 'Excavate Footings',      start: '2026-03-02 08:00', end: '2026-03-13 16:00' },
  { task_id: '5002', task_code: 'A1005', task_name: 'Mobilize Tower Crane',   start: '2026-03-16 08:00', end: '2026-03-20 16:00' },
  { task_id: '5003', task_code: 'A1010', task_name: 'Form and Pour Footings', start: '2026-03-23 08:00', end: '2026-04-10 16:00' },
  { task_id: '5004', task_code: 'A1020', task_name: 'Backfill and Compact',   start: '2026-04-13 08:00', end: '2026-04-24 16:00' },
]);

// Baseline (B). SAME activities by task_code, DIFFERENT task_ids (9000s), a
// different set (no A1005, an extra B9000) and therefore different row order.
const BASELINE_XER = xerText([
  { task_id: '9001', task_code: 'A1000', task_name: 'Excavate Footings',      start: '2026-02-02 08:00', end: '2026-02-13 16:00' },
  { task_id: '9002', task_code: 'A1010', task_name: 'Form and Pour Footings', start: '2026-02-16 08:00', end: '2026-03-06 16:00' },
  { task_id: '9003', task_code: 'A1020', task_name: 'Backfill and Compact',   start: '2026-03-09 08:00', end: '2026-03-20 16:00' },
  { task_id: '9004', task_code: 'B9000', task_name: 'Demolish Existing Shed', start: '2026-01-05 08:00', end: '2026-01-16 16:00' },
]);

const parseA = () => parseXer(CURRENT_XER, { filename: 'current.xer' });
const parseB = () => parseXer(BASELINE_XER, { filename: 'baseline.xer' });

const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Drive the real Run button and return the JSON body posted to /lens/run. */
async function submit({ A, B, anonymize = true }) {
  prefsStore.set({ ...prefsStore.get(), anonymizeOnMcpUpload: anonymize });

  let sent = null;

  globalThis.fetch = vi.fn(async (url, init) => {
    if (String(url).endsWith('/lens/run')) {
      sent = JSON.parse(init.body);
    }
    return {
      ok: true,
      status: 200,
      statusText: '',
      text: async () => JSON.stringify({
        jobId: 'J1', status: 'done',
        resultUrl: 'https://mcp.criticalpathpartners.ca/lens/r/J1'
      })
    };
  });

  const el = render({ A, B });
  const runBtn = [...el.querySelectorAll('button')]
    .find(b => /run deep forensic/i.test(b.textContent));
  expect(runBtn, 'the Run Deep Forensic button is gone').toBeTruthy();
  runBtn.dispatchEvent(new Event('click'));

  // Poll rather than await a resolver: when the submission is refused (or
  // never happens) the test must say WHY, not sit until the 30s timeout.
  const deadline = Date.now() + 5000;
  while (sent === null && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5));
  }
  if (sent === null) {
    const status = el.querySelector('#deep-forensic-status');
    throw new Error(
      'nothing was posted to /lens/run. Status area said: ' +
      ((status && status.textContent.trim()) || '(empty)'));
  }
  return { sent, el };
}

/** task_code → row, from an uploaded (gzip+base64) XER payload. */
async function tasksByCode(b64) {
  const model = parseXer(await gunzipFromBase64(b64), { filename: 'wire.xer' });
  const byCode = new Map();
  for (const t of model.tables.TASK.records) byCode.set(t.task_code, t);
  return byCode;
}

beforeEach(() => {
  prefsStore.set({ ...prefsStore.get(), anonymizeOnMcpUpload: true });
});
afterEach(() => { vi.restoreAllMocks(); delete globalThis.fetch; });

describe('Deep Forensic — the baseline reaches the wire', () => {
  it('fixture sanity: the same activities carry different task_ids in the two files', () => {
    // Shared refusal first: no task_id in common, at least three task_codes.
    expect(assertDivergentSurrogates(parseA(), parseB(), { minSharedCodes: 3 }))
      .toEqual({ sharedCodes: 3, sharedTaskIds: 0 });

    const a = parseA().tables.TASK.records;
    const b = parseB().tables.TASK.records;
    const aById = new Map(a.map(t => [t.task_code, t.task_id]));
    const shared = b.filter(t => aById.has(t.task_code));
    expect(shared.length, 'fixtures share no activity codes').toBe(3);
    for (const t of shared) {
      expect(t.task_id,
        `task_code ${t.task_code} has the same task_id in both files — the ` +
        'fixture no longer reproduces a real pair of P6 exports')
        .not.toBe(aById.get(t.task_code));
    }
  });

  it('submits a non-null xer_baseline_base64 that really is the baseline file', async () => {
    const { sent } = await submit({ A: parseA(), B: parseB() });

    expect(sent.input.xer_baseline_base64,
      'the baseline was not submitted — the Engine compared the schedule ' +
      'against itself, which is what produced 0wd of slip on two schedules ' +
      'with different completion dates').toBeTruthy();
    expect(typeof sent.input.xer_baseline_base64).toBe('string');
    expect(sent.input.xer_baseline_base64).not.toBe(sent.input.xer_base64);

    const current  = await tasksByCode(sent.input.xer_base64);
    const baseline = await tasksByCode(sent.input.xer_baseline_base64);

    // The baseline payload is B, not a second copy of A.
    expect([...current.keys()].sort()).toEqual(['A1000', 'A1005', 'A1010', 'A1020']);
    expect([...baseline.keys()].sort()).toEqual(['A1000', 'A1010', 'A1020', 'B9000']);
    expect(current.get('A1000').task_id).toBe('5001');
    expect(baseline.get('A1000').task_id).toBe('9001');
    expect(baseline.get('A1000').target_end_date).toContain('2026-02-13');
  });

  it('with a baseline loaded, the windows analysis is the tool that runs', async () => {
    const { sent } = await submit({ A: parseA(), B: parseB() });
    expect(sent.tool).toBe('forensic-delay-analysis');
    expect(toolRequiresBaseline(sent.tool)).toBe(true);
  });

  it('says what each tool does with the baseline, including the two that ignore it', () => {
    const el = render({ A: parseA(), B: parseB() });
    expect(el.textContent).toMatch(/Baseline: loaded/i);
    for (const tool of TOOLS) {
      expect(el.textContent,
        `the picker does not say what ${tool.id} does with a loaded baseline`)
        .toContain(ENGINE_TOOLS[tool.id].baselineUse);
    }
    // Monte Carlo and collapsed as-built do not read it — say so rather than
    // letting a loaded baseline imply it was used.
    expect(el.textContent).toMatch(/not read/i);
  });

  it('both files are anonymized under ONE map, so a task_code means the same thing in each', async () => {
    const { sent } = await submit({ A: parseA(), B: parseB() });
    expect(sent.input.anonymized).toBe(true);

    const current  = await tasksByCode(sent.input.xer_base64);
    const baseline = await tasksByCode(sent.input.xer_baseline_base64);

    // Names really were scrubbed on both files.
    for (const row of [...current.values(), ...baseline.values()]) {
      expect(row.task_name).toMatch(/^ACT_\d{4}_task_name$/);
    }
    expect(await gunzipFromBase64(sent.input.xer_base64)).not.toContain('Excavate Footings');
    expect(await gunzipFromBase64(sent.input.xer_baseline_base64)).not.toContain('Excavate Footings');

    // Same activity → same token in both files. Two independent anonymizeModel
    // calls give A1010 ACT_0003 in the current file and ACT_0002 in the
    // baseline, because the token is minted from the row counter.
    for (const code of ['A1000', 'A1010', 'A1020']) {
      expect(baseline.get(code).task_name,
        `activity ${code} carries a different anonymous name in the baseline ` +
        'than in the current file — the two files were tokenized under ' +
        'separate maps').toBe(current.get(code).task_name);
    }

    // …and no token may mean two different activities across the pair. Under
    // separate maps, ACT_0002 is "Mobilize Tower Crane" in the current file and
    // "Form and Pour Footings" in the baseline.
    const onlyInCurrent  = current.get('A1005').task_name;
    const onlyInBaseline = baseline.get('B9000').task_name;
    expect(onlyInCurrent).not.toBe(onlyInBaseline);
    const currentTokens = new Set([...current.values()].map(r => r.task_name));
    expect(currentTokens.has(onlyInBaseline),
      'a token in the baseline names a different activity in the current ' +
      'file — the anon map collided').toBe(false);
  });

  it('the reported SHA-256 covers the map that anonymized BOTH files', async () => {
    const { sent } = await submit({ A: parseA(), B: parseB() });

    const pairMap = anonymizeModelPair(parseA(), parseB()).map;
    const aOnlyMap = anonymizeModel(parseA()).map;

    expect(sent.input.anon_map_sha256,
      'no anon-map hash was reported').toBeTruthy();
    expect(sent.input.anon_map_sha256).toBe(sha256Hex(JSON.stringify(pairMap)));
    expect(sent.input.anon_map_sha256,
      'the receipt hash covers only the current schedule, so it does not ' +
      'describe what was actually uploaded').not.toBe(sha256Hex(JSON.stringify(aOnlyMap)));
  });

  it('sends the raw baseline when anonymization is off', async () => {
    const { sent } = await submit({ A: parseA(), B: parseB(), anonymize: false });
    expect(sent.input.anonymized).toBe(false);
    expect(sent.input.xer_baseline_base64).toBeTruthy();
    const wire = await gunzipFromBase64(sent.input.xer_baseline_base64);
    expect(wire).toContain('Demolish Existing Shed');
    expect(wire).toContain('9004');
  });
});

describe('Deep Forensic — a two-file analysis cannot be submitted with one file', () => {
  it('disables the baseline-requiring tools when no baseline is loaded', () => {
    const el = render({ A: parseA(), B: null });
    for (const tool of TOOLS) {
      const radio = el.querySelector(`#deep-forensic-tool-${tool.id}`);
      expect(radio, `radio for ${tool.id} is gone`).toBeTruthy();
      expect(radio.disabled,
        `${tool.id} requiresBaseline=${toolRequiresBaseline(tool.id)} but its ` +
        `radio is ${radio.disabled ? '' : 'not '}disabled with no baseline loaded`)
        .toBe(toolRequiresBaseline(tool.id));
      if (radio.disabled) expect(radio.checked).toBe(false);
    }
    expect(el.textContent).toMatch(/Requires a baseline XER/i);
    expect(el.textContent).toMatch(/Baseline: none loaded/i);
  });

  it('never posts a baseline-requiring tool with a null baseline', async () => {
    const { sent } = await submit({ A: parseA(), B: null });
    expect(sent.input.xer_baseline_base64).toBeNull();
    expect(toolRequiresBaseline(sent.tool),
      `${sent.tool} needs two schedules and was submitted with one`).toBe(false);
  });

  it('the transport refuses the run before any request leaves the browser', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => { calls++; return { ok: true, status: 200, text: async () => '{}' }; });
    await expect(runDeepForensic({ tool: 'forensic-delay-analysis', xerBase64: 'x' }))
      .rejects.toThrow(/baseline/i);
    expect(calls, 'a two-file analysis was submitted with one file').toBe(0);
  });

  it('every offered tool states whether it needs a baseline', () => {
    for (const tool of TOOLS) {
      const spec = ENGINE_TOOLS[tool.id];
      expect(spec,
        `${tool.id} is offered in the picker but is missing from ENGINE_TOOLS, ` +
        'so nothing knows whether it may run on one file').toBeDefined();
      expect(typeof spec.requiresBaseline,
        `${tool.id} does not declare requiresBaseline as a boolean`).toBe('boolean');
      expect(typeof spec.baselineUse).toBe('string');
    }
    expect(Object.keys(ENGINE_TOOLS).sort(),
      'the Engine tool contract and the tool picker have drifted apart')
      .toEqual(TOOLS.map(t => t.id).sort());
  });
});
