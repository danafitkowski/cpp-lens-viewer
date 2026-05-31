import { describe, it, expect } from 'vitest';
import { buildResultPanel } from '../../src/sections/deep-forensic-result.js';

const JOB = '4Efjr_3mXx7K-hmXuFlqbA';
const RESULT_URL = `https://mcp.criticalpathpartners.ca/lens/r/${JOB}`;

describe('buildResultPanel', () => {
  it('embeds the facade result in a sandboxed iframe', () => {
    const node = buildResultPanel({ jobId: JOB, resultUrl: RESULT_URL });
    const iframe = node.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('src')).toBe(RESULT_URL);
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
  });
  it('has a pop-out link to the full result tab', () => {
    const node = buildResultPanel({ jobId: JOB, resultUrl: RESULT_URL });
    const popout = node.querySelector('a[target="_blank"]');
    expect(popout).toBeTruthy();
    expect(popout.getAttribute('href')).toBe(RESULT_URL);
    expect(popout.getAttribute('rel')).toContain('noopener');
  });
  it('has a Share button that copies the brand /r/<id> URL', async () => {
    const writes = [];
    globalThis.navigator = globalThis.navigator || {};
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t) => { writes.push(t); return Promise.resolve(); } }
    });
    const node = buildResultPanel({ jobId: JOB, resultUrl: RESULT_URL });
    const share = [...node.querySelectorAll('button')].find(b => /share/i.test(b.textContent));
    expect(share).toBeTruthy();
    share.click();
    await Promise.resolve();
    expect(writes).toEqual([`https://criticalpathpartners.ca/r/${JOB}`]);
  });
  it('falls back to a selectable input when the clipboard is blocked', async () => {
    globalThis.navigator = globalThis.navigator || {};
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('blocked')) }
    });
    const node = buildResultPanel({ jobId: JOB, resultUrl: RESULT_URL });
    const share = [...node.querySelectorAll('button')].find(b => /share/i.test(b.textContent));
    share.click();
    await new Promise(r => setTimeout(r, 0)); // allow the rejected promise + catch to run
    const input = node.querySelector('input[readonly]');
    expect(input).toBeTruthy();
    expect(input.value).toBe(`https://criticalpathpartners.ca/r/${JOB}`);
    const copied = [...node.querySelectorAll('span')].find(s => /copied/i.test(s.textContent));
    expect(copied && copied.style.visibility).toBe('hidden');
  });
});
