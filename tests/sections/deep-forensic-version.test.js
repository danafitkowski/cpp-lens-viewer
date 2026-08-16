import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseXer } from '@criticalpathpartners/lens-parser';
import { render } from '../../src/sections/deep-forensic.js';

/**
 * The Deep Forensic submission stamps a client version on every job the Engine
 * runs. It used to be the literal '1.5.3' in the section source, beside
 * package.json's own 1.5.3, with nothing tying the two together — so the next
 * `npm version` bump would have shipped a viewer reporting the previous
 * release to the Engine, forever.
 *
 * This drives the real button and reads what actually goes on the wire, rather
 * than trusting the constant. tests/unit/lens-version.test.js catches the
 * literal reappearing in source; this one catches the value being wrong when it
 * leaves the browser, whatever route it took to get there.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = join(REPO, 'tests', 'fixtures');
const PKG = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));

afterEach(() => { vi.restoreAllMocks(); delete globalThis.fetch; });

describe('Deep Forensic — client version on the wire', () => {
  it('submits the package.json version, not a hardcoded one', async () => {
    const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));

    let sent = null;
    let submitted;
    const gotSubmit = new Promise((r) => { submitted = r; });

    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/lens/run')) {
        sent = JSON.parse(init.body);
        submitted();
      }
      return {
        ok: true,
        status: 200,
        statusText: '',
        text: async () => JSON.stringify({
          jobId: 'J1',
          status: 'done',
          resultUrl: 'https://mcp.criticalpathpartners.ca/lens/r/J1'
        })
      };
    };

    const el = render({ A, B: null });
    const runBtn = [...el.querySelectorAll('button')]
      .find((b) => /run deep forensic/i.test(b.textContent));
    expect(runBtn, 'the Run Deep Forensic button is gone').toBeTruthy();

    runBtn.dispatchEvent(new Event('click'));
    await gotSubmit;

    expect(sent.client.lensVersion,
      'The Deep Forensic submission reported a client version that is not ' +
      `package.json's (${PKG.version}). It must be read from there, not ` +
      'restated in the section.').toBe(PKG.version);
  });
});
