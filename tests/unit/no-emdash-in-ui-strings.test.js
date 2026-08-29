// STRUCTURAL GUARD — no em-dash used as prose punctuation in UI copy.
//
// House prose style: plain sentences, no em-dashes as punctuation. The live
// bundle carried 112 of them, all originating in src string literals ("Done —
// result below", "Daily limit reached — try again tomorrow", ...). They were
// swept to periods and colons; this guard keeps the next status string from
// reintroducing the habit.
//
// Scope, stated precisely: the SPACED em-dash (" — ") inside string and
// template literals. That is the prose-punctuation form and only that form.
// A bare "—" placeholder (empty KPI cells, the compare-page glyph) is a
// legitimate label and stays legal, and comments are not UI copy and are
// stripped before scanning. The file list derives from the src tree on every
// run — nothing to keep in step by hand.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '..', '..', 'src');

function sourceFiles(dir = SRC_DIR, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

/**
 * Extract the contents of every string and template literal, dropping comments.
 * Character scanner, not a regex: the sources contain URLs inside strings and
 * comments that legitimately use em-dashes as written prose.
 *
 * @param {string} src
 * @returns {string[]} one entry per literal
 */
export function stringLiterals(src) {
  const out = [];
  let state = 'code';
  let buf = '';
  let i = 0;
  let lastCode = '';   // last non-whitespace character seen in code state
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { state = 'block'; i += 2; continue; }
      // Regex literal: a '/' where an expression may START is a regex, not a
      // division. Without this, `.replace(/"/g, '""')` in raw-tables.js flips
      // the scanner into string state at the regex's quote and everything
      // after is misread. Standard heuristic on the preceding code character.
      if (c === '/' && (lastCode === '' || '(,=:[!&|?{;+-*%<>~^'.includes(lastCode) || lastCode === 'n' && /\breturn$/.test(src.slice(Math.max(0, i - 7), i)))) {
        i += 1;
        let inClass = false;
        while (i < src.length) {
          const rc = src[i];
          if (rc === '\\') { i += 2; continue; }
          if (rc === '[') inClass = true;
          else if (rc === ']') inClass = false;
          else if (rc === '/' && !inClass) { i += 1; break; }
          else if (rc === '\n') break; // not a regex after all; bail safely
          i += 1;
        }
        lastCode = '/';
        continue;
      }
      if (c === "'" || c === '"' || c === '`') { state = c; buf = ''; i += 1; continue; }
      if (!/\s/.test(c)) lastCode = c;
      i += 1; continue;
    }
    if (state === 'line')  { if (c === '\n') state = 'code'; i += 1; continue; }
    if (state === 'block') { if (c === '*' && d === '/') { state = 'code'; i += 2; } else i += 1; continue; }
    // inside a literal
    if (c === '\\') { buf += c + (d == null ? '' : d); i += 2; continue; }
    if (c === state) { out.push(buf); state = 'code'; lastCode = c; i += 1; continue; }
    buf += c; i += 1;
  }
  return out;
}

const SPACED_EMDASH = ' — ';

function offenders() {
  const found = [];
  for (const file of sourceFiles()) {
    const rel = relative(SRC_DIR, file).replace(/\\/g, '/');
    for (const lit of stringLiterals(readFileSync(file, 'utf-8'))) {
      if (lit.includes(SPACED_EMDASH)) {
        found.push(`${rel}: "${lit.trim().slice(0, 80)}"`);
      }
    }
  }
  return found;
}

describe('the detector can actually fire', () => {
  it('catches a spaced em-dash in a plain string', () => {
    expect(stringLiterals(`setStatus('Done — result below.');`)
      .some(s => s.includes(SPACED_EMDASH))).toBe(true);
  });
  it('catches one in a template literal', () => {
    expect(stringLiterals('const m = `Loaded sample — ${n} activities`;')
      .some(s => s.includes(SPACED_EMDASH))).toBe(true);
  });
  it('ignores comments and bare placeholder dashes', () => {
    const src = `
      // prose in a comment — fine, comments are not UI copy
      /* block — also fine */
      const glyph = '—';
    `;
    expect(stringLiterals(src).some(s => s.includes(SPACED_EMDASH))).toBe(false);
    expect(stringLiterals(src)).toContain('—');
  });
});

describe('src UI strings', () => {
  it('carry no spaced em-dash (prose punctuation)', () => {
    expect(offenders()).toEqual([]);
  });
});
