export const MCP_BASE_URL = 'https://mcp.criticalpathpartners.ca';

// Per-request wall-clock ceiling. Without it, a hung connection (engine down,
// stalled proxy, dropped network) leaves the modal spinning "Submitting…"
// forever. Each fetch is aborted after this and surfaces a clean timeout.
const REQUEST_TIMEOUT_MS = 30000;

/**
 * fetch() with an AbortController timeout. Throws a friendly Error on timeout
 * or network failure instead of hanging / surfacing a raw TypeError.
 */
async function fetchWithTimeout(url, init, timeoutMs, label) {
  const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    return await fetch(url, ctl ? { ...init, signal: ctl.signal } : init);
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s — the Engine may be busy or unreachable.`);
    }
    // Network failure (offline / DNS / CORS) surfaces as TypeError "Failed to fetch".
    throw new Error(`${label} failed to reach the Engine — check your connection and try again.`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Parse a Response as JSON, turning a non-JSON body (proxy 502 HTML, empty
 *  body) into a clean error instead of a cryptic SyntaxError. */
async function jsonOrThrow(resp, label) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned an unexpected (non-JSON) response — the Engine may be redeploying. Try again shortly.`);
  }
}

/**
 * Submit a deep-forensic job to the CPP MCP and poll until done or rate-limited.
 *
 * Robust against: engine down / non-2xx, non-JSON bodies, network failure, and
 * hung connections (per-request 30s timeout). All failure modes surface as a
 * clean Error message the modal shows; nothing hangs or throws a raw TypeError.
 *
 * @param {object} opts
 * @param {string} opts.tool - 'forensic-delay-analysis' | 'time-impact-analysis' |
 *   'collapsed-as-built' | 'claim-workbench' | 'schedule-risk-analysis'
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
  const submit = await fetchWithTimeout(`${MCP_BASE_URL}/lens/run`, {
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
  }, REQUEST_TIMEOUT_MS, 'Submit');
  if (!submit.ok) throw new Error(`The Engine rejected the submission (HTTP ${submit.status}). Try again shortly.`);
  let result = await jsonOrThrow(submit, 'Submit');
  if (!result || !result.jobId) {
    if (result && (result.status === 'rate_limited' || result.status === 'failed' || result.status === 'done')) return result;
    throw new Error('The Engine response was missing a job id.');
  }
  if (result.status === 'rate_limited' || result.status === 'failed' || result.status === 'done') return result;

  const pollMs = opts.pollIntervalMs ?? 2000;
  const maxPolls = opts.maxPolls ?? 120;
  for (let i = 0; i < maxPolls; i++) {
    await sleep(pollMs);
    const poll = await fetchWithTimeout(`${MCP_BASE_URL}/lens/job/${encodeURIComponent(result.jobId)}`, {}, REQUEST_TIMEOUT_MS, 'Status check');
    if (!poll.ok) throw new Error(`Status check failed (HTTP ${poll.status}). Try again shortly.`);
    result = await jsonOrThrow(poll, 'Status check');
    if (result.status === 'done' || result.status === 'failed' || result.status === 'rate_limited') return result;
  }
  throw new Error(`The analysis is taking longer than expected (over ${Math.round(maxPolls * pollMs / 1000)}s). It may still finish — check back, or contact dana@criticalpathpartners.ca for a large schedule.`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// MPP conversion runs a JVM (mpxj) server-side, so it's slower than a JSON call.
const CONVERT_TIMEOUT_MS = 90000;

// Convert a Uint8Array to base64, chunked to survive multi-MB files.
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Convert an MS Project .mpp file to Primavera P6 XML via the CPP server.
 *
 * MPP is a proprietary binary format with no usable browser parser, so the raw
 * bytes are sent to /lens/convert; mpxj converts to P6 XML in-memory (discarded
 * after) and the XML comes back for the browser to parse locally with
 * parseP6Xml. This is the ONLY server exposure of the file — all analysis stays
 * client-side afterward.
 *
 * @param {ArrayBuffer|Uint8Array} mppBytes
 * @returns {Promise<string>} the P6 XML text
 * @throws {Error} with a clean message on unavailable / rate-limit / failure
 */
export async function convertMpp(mppBytes) {
  const u8 = mppBytes instanceof Uint8Array ? mppBytes : new Uint8Array(mppBytes);
  const resp = await fetchWithTimeout(`${MCP_BASE_URL}/lens/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mpp_base64: bytesToBase64(u8) }),
  }, CONVERT_TIMEOUT_MS, 'MPP conversion');

  if (resp.status === 503) {
    throw new Error('MPP conversion isn’t enabled on the server yet — export your schedule from MS Project as XML, or use a P6 XER/XML file.');
  }
  if (resp.status === 429) {
    throw new Error('Daily limit reached — try again tomorrow, or use a P6 XER/XML file (no limit).');
  }
  const data = await jsonOrThrow(resp, 'MPP conversion');
  if (resp.ok && data.status === 'done' && data.xml) return data.xml;
  throw new Error((data.errors && data.errors[0]) || `MPP conversion failed (HTTP ${resp.status}).`);
}
