import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { LENS_VERSION } from '../../src/version.js';
import { runDeepForensic } from '../../src/mcp/client.js';

/**
 * The viewer's version had three sources of truth and they did not agree.
 *
 *   package.json                     1.5.3   (what npm calls this package)
 *   src/sections/deep-forensic.js    '1.5.3' (stamped on every Engine
 *                                             submission, as a literal)
 *   src/mcp/client.js                '0.1.0' (the fallback when a caller
 *                                             omits lensVersion — a number
 *                                             this package never carried)
 *
 * Nothing tied any of them together. The first two agreed only by coincidence
 * and would have parted on the next bump: `npm version` rewrites package.json
 * and leaves the literal behind, so a 1.6.0 viewer would have gone on telling
 * the Engine it was 1.5.3, and the Engine's client-version telemetry — the
 * thing you reach for when one viewer build starts failing — would have been
 * quietly wrong.
 *
 * src/version.js now reads package.json, and these tests hold the line:
 *
 *   1. no file under src/ may carry the package.json version as a literal
 *      again — this is the check that fails against the unfixed tree,
 *   2. the Deep Forensic submission and the client fallback both carry the
 *      package.json version, read live rather than restated here.
 *
 * Same shape as the engine repo's v2.9.40 fix: derive, do not duplicate.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(REPO, 'src');
const PKG = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

/** Every .js file under src/, recursively. */
function jsFilesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...jsFilesUnder(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const resp = (body) => ({
  ok: true,
  status: 200,
  statusText: '',
  text: async () => JSON.stringify(body)
});

afterEach(() => { vi.restoreAllMocks(); delete globalThis.fetch; });

describe('the viewer version has one source', () => {
  it('src/version.js reports the package.json version', () => {
    expect(LENS_VERSION).toBe(PKG.version);
  });

  it('no file under src/ carries the package.json version as a literal', () => {
    // Bounded on both sides so a longer number that merely contains this one
    // (1.5.30, 11.5.3) is not reported.
    const escaped = PKG.version.replace(/\./g, '\\.');
    const pattern = new RegExp(`(?<![\\d.])${escaped}(?![\\d.])`);

    const offenders = jsFilesUnder(SRC)
      .map((file) => ({ file, src: readFileSync(file, 'utf8') }))
      .filter(({ src }) => pattern.test(src))
      .map(({ file, src }) => {
        const line = src.split('\n').findIndex((l) => pattern.test(l)) + 1;
        return `${relative(REPO, file).split(sep).join('/')}:${line}`;
      });

    expect(offenders,
      `These files under src/ hardcode the version ${PKG.version}, which is a ` +
      'second source of truth beside package.json and will go stale on the ' +
      'next bump. Import LENS_VERSION from src/version.js instead: ' +
      offenders.join(', ')).toEqual([]);
  });

  it('src/version.js loads under plain Node, not only under a bundler', () => {
    // Vitest reads this module through vite, which imports JSON on its own
    // terms, so nothing above would notice the import being illegal outside a
    // bundler. scripts/preview-section.mjs — the tool for rendering a section
    // and LOOKING at it — imports the section registry under plain Node, and
    // the first draft of src/version.js killed it with
    // ERR_IMPORT_ATTRIBUTE_MISSING. Run the real loader.
    const out = execFileSync(
      process.execPath,
      ['-e', 'import(process.argv[1]).then(m => process.stdout.write(String(m.LENS_VERSION)))',
       pathToFileURL(join(SRC, 'version.js')).href],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    expect(out.trim()).toBe(PKG.version);
  });

  it('a submission with no lensVersion falls back to the package.json version', async () => {
    let sent = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      sent = JSON.parse(init.body);
      return resp({ jobId: 'J', status: 'done', resultUrl: 'u' });
    });

    await runDeepForensic({ tool: 'schedule-risk-analysis', xerBase64: 'x' });

    expect(sent, 'no request body was captured').toBeTruthy();
    expect(sent.client.lensVersion,
      'runDeepForensic fell back to a version that is not this package\'s. ' +
      'The fallback must be LENS_VERSION.').toBe(PKG.version);
  });
});
