import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SECTIONS } from '../../src/sections/_registry.js';

/**
 * Two pieces of repo metadata drifted silently and neither had anything
 * watching it.
 *
 * README.md's Status line read "v1.0.0 — all 29 sections wired" while
 * package.json was at 1.5.3 and the registry wired 30. README.md is the public
 * face of the repository, so both numbers were wrong in the first thing a
 * reader sees. Nothing tied that line to the values it describes.
 *
 * package.json declared engines.node ">=18" while the installed tree cannot run
 * on 18: jsdom (used by tests/sections/adversarial-render.test.js) declares
 * ^20.19.0 || ^22.13.0 || >=24.0.0, and on 18 it dies on the ESM-only
 * @exodus/bytes that html-encoding-sniffer pulls in. A declared floor below
 * what the tree actually needs sends a contributor to an install that cannot
 * work.
 *
 * These read the real sources rather than restating the numbers, so they bite
 * on the next version bump or the next section added.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(...parts) {
  return JSON.parse(readFileSync(join(REPO, ...parts), 'utf8'));
}

const pkg = readJson('package.json');
const readme = readFileSync(join(REPO, 'README.md'), 'utf8');

/** The line immediately under the "## Status" heading. */
function statusLine() {
  const m = readme.match(/^##\s+Status\s*\n(.+)$/m);
  expect(m, 'README.md no longer has a "## Status" heading with a line under it')
    .toBeTruthy();
  return m[1];
}

describe('repo metadata', () => {
  it('the README Status line quotes the package.json version', () => {
    const line = statusLine();
    const m = line.match(/\bv(\d+\.\d+\.\d+)\b/);
    expect(m, `README Status line states no version: ${line}`).toBeTruthy();
    expect(m[1],
      'README.md Status is stale against package.json. Update the Status line ' +
      'when the version is bumped.').toBe(pkg.version);
  });

  it('the README Status line quotes the number of wired sections', () => {
    const line = statusLine();
    const m = line.match(/all (\d+) sections wired/);
    expect(m, `README Status line states no section count: ${line}`).toBeTruthy();
    expect(Number(m[1]),
      'README.md claims a different number of sections than src/sections/' +
      '_registry.js wires. Update the Status line when a section is added.')
      .toBe(SECTIONS.length);
  });

  it('engines.node is not below what the installed tree requires', () => {
    // jsdom carries the highest floor in the tree. Read it rather than
    // restating it, so a jsdom bump that raises the floor shows up here.
    const jsdom = readJson('node_modules', 'jsdom', 'package.json');
    const floors = String(jsdom.engines.node)
      .split('||')
      .map((r) => Number(r.trim().replace(/^[\^~>=]+/, '').split('.')[0]))
      .filter((n) => Number.isFinite(n));
    expect(floors.length, `could not parse jsdom engines.node: ${jsdom.engines.node}`)
      .toBeGreaterThan(0);
    const required = Math.min(...floors);

    const declared = Number(String(pkg.engines.node).replace(/^[^\d]*/, '').split('.')[0]);
    expect(Number.isFinite(declared),
      `could not parse package.json engines.node: ${pkg.engines.node}`).toBe(true);
    expect(declared,
      `package.json declares engines.node ${pkg.engines.node}, but jsdom in the ` +
      `installed tree requires ${jsdom.engines.node}. The declared floor must ` +
      'not be lower than what the tree can actually run on.')
      .toBeGreaterThanOrEqual(required);
  });
});
