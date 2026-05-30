import { describe, it, expect, afterEach, vi } from 'vitest';
import { runDeepForensic } from '../../src/mcp/client.js';

const OK = { tool: 'schedule-risk-analysis', xerBase64: 'x', pollIntervalMs: 1, maxPolls: 5 };
function resp(body, { ok = true, status = 200 } = {}) {
  return { ok, status, statusText: '', text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
}
afterEach(() => { vi.restoreAllMocks(); delete globalThis.fetch; });

describe('runDeepForensic — network/error robustness', () => {
  it('returns immediately when submit says done', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(resp({ jobId: 'J', status: 'done', resultUrl: 'u' }));
    const r = await runDeepForensic(OK);
    expect(r.status).toBe('done');
  });

  it('polls queued → done', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resp({ jobId: 'J', status: 'queued' }))
      .mockResolvedValueOnce(resp({ jobId: 'J', status: 'running' }))
      .mockResolvedValueOnce(resp({ jobId: 'J', status: 'done', resultUrl: 'u' }));
    globalThis.fetch = f;
    const r = await runDeepForensic(OK);
    expect(r.status).toBe('done');
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('non-2xx submit → clean error, no raw HTTP leak', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(resp('', { ok: false, status: 500 }));
    await expect(runDeepForensic(OK)).rejects.toThrow(/Engine rejected the submission \(HTTP 500\)/);
  });

  it('non-JSON body (proxy 502 HTML) → clean error, not a SyntaxError', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(resp('<html>502 Bad Gateway</html>'));
    await expect(runDeepForensic(OK)).rejects.toThrow(/non-JSON/);
  });

  it('network failure (fetch rejects) → friendly reach error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(runDeepForensic(OK)).rejects.toThrow(/failed to reach the Engine/);
  });

  it('request timeout (AbortError) → friendly timeout error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(runDeepForensic(OK)).rejects.toThrow(/timed out/);
  });

  it('missing jobId on a non-terminal response → clean error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(resp({ status: 'queued' })); // no jobId
    await expect(runDeepForensic(OK)).rejects.toThrow(/missing a job id/);
  });

  it('rate_limited surfaces as a returned result (not an error)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(resp({ jobId: '', status: 'rate_limited', rateLimit: { remaining: 0 } }));
    const r = await runDeepForensic(OK);
    expect(r.status).toBe('rate_limited');
  });

  it('does not loop forever — gives up with a clean message after maxPolls', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(resp({ jobId: 'J', status: 'running' }));
    await expect(runDeepForensic({ ...OK, maxPolls: 3, pollIntervalMs: 1 })).rejects.toThrow(/taking longer than expected/);
  });
});
