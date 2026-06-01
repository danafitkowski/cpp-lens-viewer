import { describe, it, expect } from 'vitest';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { SAMPLE_XER } from '../../src/sample/sample-schedule.js';
import { render } from '../../src/sections/deep-forensic.js';
import { prefsStore } from '../../src/state/prefs.js';
import { runDeepForensic } from '../../src/mcp/client.js';

describe('FX-028: anonymize toggle persists via prefsStore.set (not .update)', () => {
  it('flipping the checkbox updates + persists the pref without throwing', () => {
    const A = parseXer(SAMPLE_XER, { filename: 'a.xer' });
    prefsStore.set({ ...prefsStore.get(), anonymizeOnMcpUpload: true });
    const el = render({ A, B: null });
    const box = el.querySelector('#deep-forensic-anon-toggle');
    expect(box).toBeTruthy();
    box.checked = false;
    box.dispatchEvent(new Event('change')); // old code threw "reducer is not a function" here
    expect(prefsStore.get().anonymizeOnMcpUpload).toBe(false);
    const saved = JSON.parse(localStorage.getItem('cpp-lens-prefs-v1'));
    expect(saved.anonymizeOnMcpUpload).toBe(false); // persisted via prefsStore.subscribe(save)
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
