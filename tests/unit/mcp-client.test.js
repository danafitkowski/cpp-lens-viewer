import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDeepForensic, MCP_BASE_URL } from '../../src/mcp/client.js';

describe('runDeepForensic', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('POSTs to /lens/run with the right body', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: 'job1', status: 'done', resultUrl: 'https://example/r/1', rateLimit: { remaining: 4, resetAt: '' } })
      });

    const result = await runDeepForensic({
      tool: 'forensic-delay-analysis',
      xerBase64: 'BASE64DATA',
      anonymized: true,
      anonMapSha256: 'abc123',
      pollIntervalMs: 1,
      lensVersion: '0.1.0'
    });

    expect(result.resultUrl).toBe('https://example/r/1');
    expect(fetch).toHaveBeenCalled();
    const firstCall = fetch.mock.calls[0];
    expect(firstCall[0]).toBe(`${MCP_BASE_URL}/lens/run`);
    const body = JSON.parse(firstCall[1].body);
    expect(body.tool).toBe('forensic-delay-analysis');
    expect(body.input.anonymized).toBe(true);
    expect(body.input.anon_map_sha256).toBe('abc123');
  });

  it('polls until done after a queued response', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: 'job1', status: 'queued', rateLimit: { remaining: 5, resetAt: '' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: 'job1', status: 'running', rateLimit: { remaining: 5, resetAt: '' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ jobId: 'job1', status: 'done', resultUrl: 'https://example/r/1', rateLimit: { remaining: 4, resetAt: '' } })
      });

    const result = await runDeepForensic({
      tool: 'forensic-delay-analysis',
      xerBase64: '',
      pollIntervalMs: 1
    });

    expect(result.status).toBe('done');
    expect(result.resultUrl).toBe('https://example/r/1');
    expect(fetch).toHaveBeenCalledTimes(3); // 1 submit + 2 polls
  });

  it('returns rate_limited result without polling', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobId: '', status: 'rate_limited', rateLimit: { remaining: 0, resetAt: '2026-05-27T00:00:00Z' } })
    });
    const result = await runDeepForensic({ tool: 'forensic-delay-analysis', xerBase64: '', pollIntervalMs: 1 });
    expect(result.status).toBe('rate_limited');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('throws on non-ok HTTP', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });
    await expect(runDeepForensic({ tool: 'forensic-delay-analysis', xerBase64: '', pollIntervalMs: 1 }))
      .rejects.toThrow(/500/);
  });

  it('includes optional baseline XER when provided', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ jobId: 'j', status: 'done', resultUrl: 'u', rateLimit: {} })
    });
    await runDeepForensic({
      tool: 'collapsed-as-built',
      xerBase64: 'CURRENT',
      xerBaselineBase64: 'BASELINE',
      pollIntervalMs: 1
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.input.xer_baseline_base64).toBe('BASELINE');
  });
});
