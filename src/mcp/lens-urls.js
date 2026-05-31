// Pure builders for Lens result URLs. No DOM, no network — unit-testable.

// The on-brand, durable, shareable surface (Plan 2): criticalpathpartners.ca/r/<id>.
// Internal-rewrites to report.html?id=<id>, which iframes the facade result.
const BRAND_BASE = 'https://criticalpathpartners.ca';

// Job ids are facade-issued tokens; mirror the charset/length the brand
// .htaccess rewrite + report.html validation accept ([A-Za-z0-9_-], 1..64).
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Build the shareable brand URL for a finished analysis.
 * @param {string} jobId
 * @returns {string} the URL, or '' if jobId is missing/invalid.
 */
export function brandShareUrl(jobId) {
  if (typeof jobId !== 'string' || !ID_RE.test(jobId)) return '';
  return `${BRAND_BASE}/r/${jobId}`;
}
