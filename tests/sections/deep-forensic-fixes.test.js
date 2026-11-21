import { describe, it, expect } from 'vitest';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { SAMPLE_XER } from '../../src/sample/sample-schedule.js';
import { render } from '../../src/sections/deep-forensic.js';
import { prefsStore } from '../../src/state/prefs.js';
import { runDeepForensic } from '../../src/mcp/client.js';

// FX-028 made the toggle persist (prefsStore.update was being passed an
// object). The 21 Nov 2026 audit found that persisting it was itself the bug:
// one opt-out stayed off for every later session. The toggle now must NOT
// touch saved preferences; tests/sections/deep-forensic-privacy.test.js covers
// the rest.
describe('FX-028, superseded: the anonymize toggle is never saved', () => {
  it('flipping the checkbox does not throw and does not write to prefs or localStorage', () => {
    const A = parseXer(SAMPLE_XER, { filename: 'a.xer' });
    localStorage.removeItem('cpp-lens-prefs-v1');
    const el = render({ A, B: null });
    const box = el.querySelector('#deep-forensic-anon-toggle');
    expect(box).toBeTruthy();
    expect(box.checked).toBe(true);
    box.checked = false;
    expect(() => box.dispatchEvent(new Event('change'))).not.toThrow();
    expect(prefsStore.get().anonymizeOnMcpUpload).toBeUndefined();
    // Another pref change still saves, and the saved object has no anonymize key.
    prefsStore.set({ ...prefsStore.get() });
    const saved = JSON.parse(localStorage.getItem('cpp-lens-prefs-v1'));
    expect('anonymizeOnMcpUpload' in saved).toBe(false);
  });
});

const resp = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return JSON.stringify(body); },
  async json() { return body; },
});

describe('FX-030: poll loop uses the captured jobId; 429 → clean rate_limited', () => {
  it('polls /lens/job/<jobId> (never /undefined) even when a poll body omits jobId', async () => {
    const urls = [];
    let call = 0;
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      call++;
      if (call === 1) return resp(200, { jobId: 'J1', status: 'running' });  // submit
      if (call === 2) return resp(200, { status: 'running' });               // poll 1 — NO jobId
      return resp(200, { status: 'done', resultUrl: 'https://mcp.criticalpathpartners.ca/lens/r/J1' });
    };
    const r = await runDeepForensic({ tool: 'schedule-risk-analysis', xerBase64: 'x', pollIntervalMs: 0, maxPolls: 5 });
    expect(r.status).toBe('done');
    const pollUrls = urls.filter(u => u.includes('/lens/job/'));
    expect(pollUrls.length).toBeGreaterThanOrEqual(2);
    for (const u of pollUrls) {
      expect(u).toContain('/lens/job/J1');
      expect(u).not.toContain('undefined');
    }
  });

  it('a 429 on poll returns a clean rate_limited result instead of throwing HTTP 429', async () => {
    let call = 0;
    globalThis.fetch = async () => {
      call++;
      if (call === 1) return resp(200, { jobId: 'J9', status: 'running' });
      return resp(429, { status: 'rate_limited', errors: ['daily poll limit reached'] });
    };
    const r = await runDeepForensic({ tool: 'x', xerBase64: 'x', pollIntervalMs: 0, maxPolls: 3 });
    expect(r.status).toBe('rate_limited');
    expect(r.jobId).toBe('J9');
  });
});
