export const MCP_BASE_URL = 'https://mcp.criticalpathpartners.ca';

/**
 * Submit a deep-forensic job to the CPP MCP and poll until done or rate-limited.
 *
 * @param {object} opts
 * @param {string} opts.tool - 'forensic-delay-analysis' | 'time-impact-analysis' |
 *   'collapsed-as-built' | 'claim-workbench' | 'schedule-risk-analysis' |
 *   'claims-preparation' | 'mpp-to-xer-convert'
 * @param {string} opts.xerBase64 - gzipped + base64 XER (anonymized or raw)
 * @param {string} [opts.xerBaselineBase64] - optional baseline XER
 * @param {boolean} [opts.anonymized=true]
 * @param {string} [opts.anonMapSha256='']
 * @param {object} [opts.options={}] - tool-specific options
 * @param {string} [opts.lensVersion='0.1.0']
 * @param {number} [opts.pollIntervalMs=2000]
 * @param {number} [opts.maxPolls=120]
 * @returns {Promise<{ jobId, status, resultUrl, rateLimit, errors }>}
 */
export async function runDeepForensic(opts) {
  const submit = await fetch(`${MCP_BASE_URL}/lens/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: opts.tool,
      input: {
        xer_base64: opts.xerBase64,
        xer_baseline_base64: opts.xerBaselineBase64 || null,
        anonymized: opts.anonymized !== false,
        anon_map_sha256: opts.anonMapSha256 || ''
      },
      options: opts.options || {},
      client: {
        lensVersion: opts.lensVersion || '0.1.0',
        userAgent: (typeof navigator !== 'undefined') ? navigator.userAgent : 'cpp-lens-viewer'
      }
    })
  });
  if (!submit.ok) throw new Error(`MCP submit failed: ${submit.status} ${submit.statusText}`);
  let result = await submit.json();
  if (result.status === 'rate_limited' || result.status === 'failed' || result.status === 'done') return result;

  const pollMs = opts.pollIntervalMs ?? 2000;
  const maxPolls = opts.maxPolls ?? 120;
  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollMs);
    const poll = await fetch(`${MCP_BASE_URL}/lens/job/${result.jobId}`);
    if (!poll.ok) throw new Error(`MCP poll failed: ${poll.status}`);
    result = await poll.json();
    if (result.status === 'done' || result.status === 'failed') return result;
  }
  throw new Error(`MCP job did not complete in ${maxPolls * pollMs} ms`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
