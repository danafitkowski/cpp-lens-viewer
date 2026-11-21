// @vitest-environment happy-dom
//
// Audit finding, 21 Nov 2026 (High): the Deep Forensic screen said "your
// activity names never leave the browser" whatever the anonymize box said;
// turning the box off was saved to localStorage and stayed off for every later
// session; and nothing warned before an upload with names in it. Pinned here:
//   1. anonymization is on after a reload, even if an older build saved it off;
//   2. turning it off is never saved;
//   3. an identifiable run needs an explicit confirm of a warning that says what
//      is uploaded, who can open the report, and how long it is kept, and
//      nothing is posted before that confirm;
//   4. it switches back on after that run;
//   5. the screen's copy is true in both states.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer, gunzipFromBase64 } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_XER = readFileSync(join(__dirname, '..', 'fixtures', 'minimal-3-task.xer'), 'utf-8');
const userModel = () => parseXer(USER_XER, { filename: 'user-schedule.xer' });

const KEY = 'cpp-lens-prefs-v1';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  localStorage.removeItem(KEY);
  vi.resetModules();
});

/** A fresh page load: modules re-evaluated, so prefs.js reads localStorage again. */
async function freshLoad() {
  vi.resetModules();
  const prefs = await import('../../src/state/prefs.js');
  const section = await import('../../src/sections/deep-forensic.js');
  return { ...prefs, ...section };
}

function mockEngine() {
  const posted = [];
  globalThis.fetch = vi.fn(async (url, init) => {
    if (String(url).endsWith('/lens/run')) posted.push(JSON.parse(init.body));
    return {
      ok: true, status: 200, statusText: '',
      text: async () => JSON.stringify({
        jobId: 'J1', status: 'done', resultUrl: 'https://mcp.criticalpathpartners.ca/lens/r/J1'
      })
    };
  });
  return posted;
}

const runButton = (el) => [...el.querySelectorAll('button')].find(b => /run deep forensic/i.test(b.textContent));
const box = (el) => el.querySelector('#deep-forensic-anon-toggle');
const untick = (el) => { box(el).checked = false; box(el).dispatchEvent(new Event('change')); };
const tick = () => new Promise(r => setTimeout(r, 30));
async function until(pred, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!pred() && Date.now() < deadline) await new Promise(r => setTimeout(r, 5));
}

describe('anonymization defaults on for every run', () => {
  it('is on after a reload even when an older build saved it off', async () => {
    localStorage.setItem(KEY, JSON.stringify({ anonymizeOnMcpUpload: false, longDurationDays: 30 }));
    const { render, prefsStore, loadPrefsFromStorage } = await freshLoad();
    // The old key is dropped on load; other prefs survive.
    expect(loadPrefsFromStorage()).toEqual({ longDurationDays: 30 });
    expect(prefsStore.get().anonymizeOnMcpUpload).toBeUndefined();
    expect(prefsStore.get().longDurationDays).toBe(30);
    const el = render({ A: userModel(), B: null });
    expect(box(el).checked).toBe(true);
  });

  it('turning it off is not saved, so the next page load starts with it on', async () => {
    let mod = await freshLoad();
    const el = mod.render({ A: userModel(), B: null });
    untick(el);
    mod.prefsStore.set({ ...mod.prefsStore.get(), longDurationDays: 25 }); // any later save
    const saved = JSON.parse(localStorage.getItem(KEY));
    expect('anonymizeOnMcpUpload' in saved).toBe(false);

    mod = await freshLoad();
    expect(box(mod.render({ A: userModel(), B: null })).checked).toBe(true);
  });

  it('a new render of the section in the same session starts with it on', async () => {
    const { render } = await freshLoad();
    const first = render({ A: userModel(), B: null });
    untick(first);
    expect(box(first).checked).toBe(false);
    expect(box(render({ A: userModel(), B: null })).checked).toBe(true);
  });
});

describe('a warning, confirmed, comes before any identifiable upload', () => {
  it('clicking Run with anonymization off posts nothing and shows the warning', async () => {
    const { render, identifiableWarningText, REPORT_RETENTION_DAYS } = await freshLoad();
    const posted = mockEngine();
    const el = render({ A: userModel(), B: null });
    untick(el);
    runButton(el).dispatchEvent(new Event('click'));
    await tick();
    expect(posted.length, 'an identifiable upload went out before the user confirmed').toBe(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    const warn = el.querySelector('#deep-forensic-identifiable-warning');
    expect(warn).toBeTruthy();
    expect(warn.getAttribute('role')).toBe('alert');
    const text = warn.textContent;
    expect(text).toContain(identifiableWarningText({ hasBaseline: false }));
    expect(text).toMatch(/Activity names and activity IDs \(codes\)/);
    expect(text).toMatch(/will be uploaded/);
    expect(text).toMatch(/Anyone who has the report.s link can open it/);
    expect(text).toContain(`${REPORT_RETENTION_DAYS} days`);
    expect(REPORT_RETENTION_DAYS).toBe(365);
  });

  it('confirming sends the raw file, then anonymization switches back on', async () => {
    const { render } = await freshLoad();
    const posted = mockEngine();
    const el = render({ A: userModel(), B: null });
    untick(el);
    runButton(el).dispatchEvent(new Event('click'));
    await tick();
    el.querySelector('#deep-forensic-confirm-identifiable').dispatchEvent(new Event('click'));
    await until(() => posted.length > 0);
    await tick();
    expect(posted.length).toBe(1);
    expect(posted[0].input.anonymized).toBe(false);
    const wire = await gunzipFromBase64(posted[0].input.xer_base64);
    const firstName = userModel().tables.TASK.records[0].task_name;
    expect(wire).toContain(firstName);

    // The opt-out covered that run only.
    expect(box(el).checked).toBe(true);
    expect(el.querySelector('#deep-forensic-identifiable-warning')).toBeNull();
    runButton(el).dispatchEvent(new Event('click'));
    await until(() => posted.length > 1);
    expect(posted[1].input.anonymized).toBe(true);
    expect(await gunzipFromBase64(posted[1].input.xer_base64)).not.toContain(firstName);
  });

  it('cancelling posts nothing and turns anonymization back on', async () => {
    const { render } = await freshLoad();
    const posted = mockEngine();
    const el = render({ A: userModel(), B: null });
    untick(el);
    runButton(el).dispatchEvent(new Event('click'));
    await tick();
    el.querySelector('#deep-forensic-cancel-identifiable').dispatchEvent(new Event('click'));
    await tick();
    expect(posted.length).toBe(0);
    expect(box(el).checked).toBe(true);
    expect(el.querySelector('#deep-forensic-identifiable-warning')).toBeNull();
    expect(el.querySelector('#deep-forensic-status').textContent).toMatch(/Nothing was uploaded/);
  });

  it('with anonymization on, Run posts straight away with no warning', async () => {
    const { render } = await freshLoad();
    const posted = mockEngine();
    const el = render({ A: userModel(), B: null });
    runButton(el).dispatchEvent(new Event('click'));
    await until(() => posted.length > 0);
    expect(posted[0].input.anonymized).toBe(true);
    expect(el.querySelector('#deep-forensic-identifiable-warning')).toBeNull();
  });

  it('the warning names both files when a baseline is loaded', async () => {
    const { identifiableWarningText } = await freshLoad();
    expect(identifiableWarningText({ hasBaseline: true })).toContain('both files');
  });
});

describe('the screen says what is true in each state', () => {
  it('never claims names stay in the browser while anonymization is off', async () => {
    const { render, uploadPrivacyText } = await freshLoad();
    const el = render({ A: userModel(), B: null });
    const note = () => el.querySelector('#deep-forensic-privacy-note').textContent;
    const offNote = el.querySelector('#deep-forensic-anon-off-note');

    // The old unconditional promise is gone from the whole screen.
    expect(el.textContent).not.toMatch(/never leave the browser/i);

    // On: names are tokenized here, the key stays here, IDs still go.
    expect(note()).toBe(uploadPrivacyText(true));
    expect(note()).toMatch(/replaces activity names/);
    expect(note()).toMatch(/stays in this browser/);
    expect(note()).toMatch(/Activity IDs \(codes\).*uploaded as they are/);
    expect(offNote.style.display).toBe('none');

    // Off: the same paragraph now says names are uploaded.
    untick(el);
    expect(note()).toBe(uploadPrivacyText(false));
    expect(note()).toMatch(/Activity names and activity IDs \(codes\).*are uploaded/);
    expect(note()).not.toMatch(/stays in this browser/);
    expect(offNote.style.display).toBe('');

    // Both states: who can open the report, and how long it is kept.
    for (const t of [uploadPrivacyText(true), uploadPrivacyText(false)]) {
      expect(t).toMatch(/Anyone who has its link can open it/);
      expect(t).toMatch(/365 days after the run/);
      expect(t).toMatch(/uploaded XER is deleted from the server when the run finishes/);
    }
  });

  it('describes operational logging separately, without schedule content', async () => {
    const { render } = await freshLoad();
    const el = render({ A: userModel(), B: null });
    expect(el.textContent).toMatch(/logs each run for operations/);
    expect(el.textContent).toMatch(/hash of your IP address/);
    expect(el.textContent).toMatch(/holds no schedule content/);
  });
});
