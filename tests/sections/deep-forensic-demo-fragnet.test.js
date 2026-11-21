// @vitest-environment happy-dom
//
// The flagship demo used to dead-end: with the built-in sample loaded (no
// baseline), Deep Forensic pre-selects Time Impact Analysis, and the first
// click on Run returned the raw Engine refusal "time-impact-analysis requires
// options.fragnets: ...". There is no fragnet UI, so the default click could
// never succeed. Two halves of the fix, both proven here:
//   (a) the sample submits a canned demo fragnet automatically (and says so in
//       the UI before the click), so the first click returns a real result;
//   (b) Engine schema refusals are translated to plain-language guidance for
//       every tool, so a user-loaded schedule gets told what to do instead of
//       shown a data structure they cannot enter.
// And since 21 Nov 2026 (audit finding: TIA and Collapsed As-Built were
// selectable for a user file the viewer cannot give their inputs), TIA is
// labelled demo only and runs on the sample alone, and Collapsed As-Built is
// labelled analyst / API only and never runs from the viewer. Both say so in
// the picker, before anything is uploaded.
//
// These runs go out anonymized (the default for every run). The demo fragnet
// still resolves: the anonymizer keeps task_code, which the fragnet ties use.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, translateEngineError, TOOL_UNAVAILABLE_TEXT } from '../../src/sections/deep-forensic.js';
import { SAMPLE_XER, SAMPLE_FILENAME, SAMPLE_DEMO_FRAGNETS } from '../../src/sample/sample-schedule.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

const sampleModel = () => parseXer(SAMPLE_XER, { filename: SAMPLE_FILENAME });
const userModel = () =>
  parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'), { filename: 'user-schedule.xer' });

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Drive the real Run button; resolve with the body posted to /lens/run. */
async function clickRun(el, { response } = {}) {
  let sent = null;
  globalThis.fetch = vi.fn(async (url, init) => {
    if (String(url).endsWith('/lens/run')) sent = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      statusText: '',
      text: async () => JSON.stringify(response || {
        jobId: 'J1', status: 'done',
        resultUrl: 'https://mcp.criticalpathpartners.ca/lens/r/J1'
      })
    };
  });
  const runBtn = [...el.querySelectorAll('button')].find(b => /run deep forensic/i.test(b.textContent));
  expect(runBtn, 'Run Deep Forensic button missing').toBeTruthy();
  runBtn.dispatchEvent(new Event('click'));
  const deadline = Date.now() + 5000;
  while (sent === null && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5));
  }
  if (sent === null) {
    const status = el.querySelector('#deep-forensic-status');
    throw new Error('nothing was posted to /lens/run. Status: ' + ((status && status.textContent.trim()) || '(empty)'));
  }
  // give the post-response handlers a tick to update the status area
  await new Promise(r => setTimeout(r, 20));
  return sent;
}

const statusText = (el) => (el.querySelector('#deep-forensic-status')?.textContent || '').trim();

describe('demo fragnet on the built-in sample', () => {

  it('pre-selects Time Impact Analysis when no baseline is loaded (the dead-end scenario)', () => {
    const el = render({ A: sampleModel(), B: null });
    const checked = el.querySelector('input[type="radio"]:checked');
    expect(checked?.value).toBe('time-impact-analysis');
  });

  it('announces the demo fragnet in the UI before the click', () => {
    const el = render({ A: sampleModel(), B: null });
    const card = el.querySelector('#deep-forensic-demo-fragnet');
    expect(card).toBeTruthy();
    expect(card.style.display).not.toBe('none');
    expect(card.textContent).toContain('Demo fragnet');
    expect(card.textContent).toContain('A4000');
  });

  it('hides the demo fragnet card when a tool other than TIA is selected', () => {
    const el = render({ A: sampleModel(), B: null });
    const radio = el.querySelector('input[type="radio"][value="schedule-risk-analysis"]');
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    expect(el.querySelector('#deep-forensic-demo-fragnet').style.display).toBe('none');
    // and re-selecting TIA brings it back
    const tia = el.querySelector('input[type="radio"][value="time-impact-analysis"]');
    tia.checked = true;
    tia.dispatchEvent(new Event('change'));
    expect(el.querySelector('#deep-forensic-demo-fragnet').style.display).not.toBe('none');
  });

  it('the first click on Run submits the canned fragnet, so the run can succeed', async () => {
    const el = render({ A: sampleModel(), B: null });
    const sent = await clickRun(el);
    expect(sent.tool).toBe('time-impact-analysis');
    expect(sent.options.fragnets).toEqual(SAMPLE_DEMO_FRAGNETS);
  });

  it('the canned fragnet still goes out with the run anonymized (the default)', async () => {
    const el = render({ A: sampleModel(), B: null });
    expect(el.querySelector('#deep-forensic-anon-toggle').checked).toBe(true);
    const sent = await clickRun(el);
    expect(sent.input.anonymized).toBe(true);
    expect(sent.options.fragnets).toEqual(SAMPLE_DEMO_FRAGNETS);
  });

  it('never renders the demo card, never offers TIA, and never sends the fragnet, for a user schedule', async () => {
    const el = render({ A: userModel(), B: null });
    expect(el.querySelector('#deep-forensic-demo-fragnet')).toBeNull();
    const tia = el.querySelector('input[type="radio"][value="time-impact-analysis"]');
    expect(tia.disabled).toBe(true);
    expect(tia.checked).toBe(false);
    const sent = await clickRun(el);
    expect(sent.tool).not.toBe('time-impact-analysis');
    expect(sent.options.fragnets).toBeUndefined();
  });
});

describe('TIA is demo only, Collapsed As-Built is analyst / API only', () => {
  const card = (el, id) => el.querySelector(`#deep-forensic-tool-${id}`).closest('.lens-card');
  const badge = (el, id) => card(el, id).querySelector('.deep-forensic-availability');

  it('labels both in the picker, for the sample and for a user file', () => {
    for (const A of [sampleModel(), userModel()]) {
      const el = render({ A, B: null });
      expect(badge(el, 'time-impact-analysis').textContent).toBe('Demo only');
      expect(card(el, 'time-impact-analysis').textContent).toContain('built-in sample schedule and its demo fragnet');
      expect(badge(el, 'collapsed-as-built').textContent).toBe('Analyst / API only');
      expect(card(el, 'collapsed-as-built').textContent).toContain('delay-event inputs the viewer cannot collect');
      // The tools the viewer can run carry no such label.
      for (const id of ['forensic-delay-analysis', 'claim-workbench', 'schedule-risk-analysis']) {
        expect(badge(el, id)).toBeNull();
      }
    }
  });

  it('on a user file, both are disabled with a plain reason before anything is uploaded', () => {
    // A baseline is loaded so that baseline availability cannot be what
    // disables them. Nothing is submitted or matched across the two models.
    // FIXTURE-EXEMPT(two-model-identity): the pair is never compared; only the picker's disabled state with a baseline loaded is read.
    const el = render({ A: userModel(), B: userModel() });
    for (const [id, key] of [['time-impact-analysis', 'demo'], ['collapsed-as-built', 'analyst']]) {
      const radio = el.querySelector(`#deep-forensic-tool-${id}`);
      expect(radio.disabled, `${id} is selectable for a user file`).toBe(true);
      expect(card(el, id).querySelector('.deep-forensic-blocked-reason').textContent)
        .toBe(TOOL_UNAVAILABLE_TEXT[key]);
    }
    expect(TOOL_UNAVAILABLE_TEXT.demo).toMatch(/needs a fragnet/);
    expect(TOOL_UNAVAILABLE_TEXT.analyst).toMatch(/needs a list of delay events/);
  });

  it('on the sample, TIA is selectable and Collapsed As-Built is still not', () => {
    const el = render({ A: sampleModel(), B: null });
    expect(el.querySelector('#deep-forensic-tool-time-impact-analysis').disabled).toBe(false);
    expect(el.querySelector('#deep-forensic-tool-collapsed-as-built').disabled).toBe(true);
  });

  it('a forced selection of an unavailable tool never goes out as that tool', async () => {
    const el = render({ A: userModel(), B: null });
    const cab = el.querySelector('#deep-forensic-tool-collapsed-as-built');
    // Even with the disabled attribute stripped (devtools), the change handler
    // does not take the selection.
    cab.disabled = false;
    cab.checked = true;
    cab.dispatchEvent(new Event('change'));
    const sent = await clickRun(el);
    expect(sent.tool).not.toBe('collapsed-as-built');
  });
});

describe('Engine schema errors reach the user as guidance, not raw schema', () => {
  it('a schema refusal on a user schedule shows plain-language guidance', async () => {
    // TIA can no longer be submitted for a user file, so the UI path is shown
    // with a refusal from a tool that can run: the generic translation.
    const el = render({ A: userModel(), B: null });
    await clickRun(el, {
      response: {
        jobId: 'J9', status: 'failed', resultUrl: '',
        errors: ['claim-workbench requires options.evidence_index: list of {path, kind}']
      }
    });
    const status = statusText(el);
    expect(status).toContain('evidence_index');
    expect(status).toContain('cannot collect yet');
    expect(status).not.toContain('requires options.evidence_index');
    expect(status).not.toContain('{path, kind}');
  });

  it('translateEngineError covers every known "requires options" refusal', () => {
    const fragnets = translateEngineError(
      'time-impact-analysis requires options.fragnets: list of {id, name, liability, activities, ties}');
    expect(fragnets).toContain('fragnet');
    expect(fragnets).toContain('sample schedule');

    const delayEvents = translateEngineError(
      'collapsed-as-built requires options.delay_events: list of {event_id, affected_activities, impact_days}');
    expect(delayEvents).toContain('delay events');
    expect(delayEvents).not.toContain('event_id');

    // A refusal shape the Engine has not shipped yet still gets a translation
    // that names the missing input, instead of falling through raw.
    const future = translateEngineError('some-tool requires options.impact_windows: list of {...}');
    expect(future).toContain('impact_windows');
    expect(future).not.toContain('list of');
  });

  it('passes a non-schema error through untranslated', () => {
    expect(translateEngineError('The Engine rejected the submission (HTTP 500). Try again shortly.')).toBeNull();
    expect(translateEngineError('')).toBeNull();
    expect(translateEngineError(undefined)).toBeNull();
  });
});
