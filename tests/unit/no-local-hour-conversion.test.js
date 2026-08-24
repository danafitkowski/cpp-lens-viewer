// STRUCTURAL GUARD — no section may turn P6 hours into days on its own.
//
// WHAT WENT WRONG
// ---------------
// P6 stores duration and float in HOURS. Six sections divided by a baked-in 8
// and printed "working days" beside the answer:
//
//   dcma-lite.js       total_float_hr_cnt   > 352      under "High Float (> 44 wd)"
//   dcma-lite.js       target_drtn_hr_cnt   > 352      under "High Duration (> 44 wd)"
//   summary.js         target_drtn_hr_cnt   > 20 * 8   narrated "> 20 working days"
//   risk-register.js   target_drtn_hr_cnt   > 40 * 8   narrated "> 40 working days"
//   path-explorer.js   lag_hr_cnt           / 8        driving-link threshold
//   schedule-quality.js (fixed one wave earlier, by hand, in that file only)
//
// On a 10 hr/day calendar every one of those is wrong by 25%, and the label
// gives the reader no way to notice. Fixing the six sites is not the fix — the
// seventh gets written next month. The fix is that there is now exactly ONE
// module that converts (src/sections/_shared/working-days.js) and this guard,
// which fails the build if any other file does the arithmetic itself.
//
// THE RULE THIS ENFORCES
// ----------------------
// Derived from the tree on every run, never from a list: any .js under src/
// except the shared module itself is checked. A section added tomorrow is
// covered without anyone remembering to register it.
//
// LIMIT, STATED PLAINLY: this reads source text. It catches the arithmetic
// shapes the defect has actually taken plus the obvious variants, and it makes
// the sanctioned helper the only import path to the parser's converter. It
// cannot catch a divisor smuggled in through a value computed elsewhere at
// runtime. The behavioural counterpart — real counts on a real 10 hr/day file —
// is tests/sections/working-day-thresholds.test.js.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, '..', '..', 'src');

/** The one module allowed to convert hours to days. */
const CONVERTER = join('sections', '_shared', 'working-days.js');

/** Every *.js under src/. Derived from the tree, never listed. */
function sourceFiles(dir = SRC_DIR, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, acc);
    else if (entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

/**
 * Remove comments, keep string and template contents.
 *
 * A character scanner rather than a regex, because the sections contain both
 * `https://…` inside string literals (which a naive `//` strip would eat) and
 * block comments that describe the very arithmetic being banned (which a naive
 * pass would then report as a violation).
 *
 * @param {string} src
 * @returns {string}
 */
export function stripComments(src) {
  let out = '';
  let state = 'code';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (state === 'code') {
      if (c === '/' && d === '/') { state = 'line';  i += 2; continue; }
      if (c === '/' && d === '*') { state = 'block'; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { state = c; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; }
      i += 1; continue;
    }
    if (state === 'block') {
      if (c === '*' && d === '/') { state = 'code'; i += 2; continue; }
      if (c === '\n') out += c;
      i += 1; continue;
    }
    // inside a string / template — keep the contents, honour escapes
    if (c === '\\') { out += c + (d == null ? '' : d); i += 2; continue; }
    if (c === state) state = 'code';
    out += c; i += 1;
  }
  return out;
}

/** P6 columns that hold hours. */
const HOUR_COLUMN = /\b(?:target_drtn_hr_cnt|remain_drtn_hr_cnt|total_float_hr_cnt|lag_hr_cnt|free_float_hr_cnt)\b/;

/** A user-facing working-day unit. */
const DAY_LABEL = /working days?|\bwd\b/i;

/** Import of the sanctioned converter. */
const IMPORTS_CONVERTER = /from\s+'[^']*_shared\/working-days\.js'/;

/** Numeric literal big enough to be an hours-per-day threshold rather than 0 / 1. */
const HOUR_CONSTANT_FLOOR = 16;

function matchAll(re, text) {
  return [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
}

/**
 * The violations one source file commits.
 *
 * @param {string} src   raw file source
 * @returns {{id: string, snippet: string}[]}
 */
export function violations(src) {
  const code = stripComments(src);
  const found = [];
  const add = (id, snippet) => found.push({ id, snippet: snippet.trim().slice(0, 120) });

  // 1. Going straight to the parser's converter skips the fallback disclosure.
  for (const m of matchAll(/.*\bdurationHoursToDays\b.*/, code)) {
    add('imports-the-parser-converter', m[0]);
  }

  // 2. `/ 8`, `* 8`, `8 /`, `8 *` — the arithmetic itself, in every form the
  //    defect has taken. The lookarounds keep 86400000 and 2080 out of it.
  for (const m of matchAll(/[/*]\s*8(?![0-9])|(?<![0-9.])8\s*[/*]/, code)) {
    const line = lineAround(code, m.index);
    add('divides-or-multiplies-by-eight', line);
  }

  // 3. An hour column compared against a raw hour constant — `> 352`, `> 160`,
  //    `> 320`. Below 16 is a status test (`<= 0`, `< 0`), not a threshold.
  const forward = /(_hr_cnt[^<>=\n]{0,48}?[<>]=?\s*)(\d+(?:\.\d+)?)/;
  const reverse = /(\d+(?:\.\d+)?)(\s*[<>]=?[^<>=\n]{0,48}?_hr_cnt)/;
  for (const m of matchAll(forward, code)) {
    if (parseFloat(m[2]) >= HOUR_CONSTANT_FLOOR) add('hour-column-vs-hour-constant', lineAround(code, m.index));
  }
  for (const m of matchAll(reverse, code)) {
    if (parseFloat(m[1]) >= HOUR_CONSTANT_FLOOR) add('hour-column-vs-hour-constant', lineAround(code, m.index));
  }

  // 4. An hour column divided by anything at all.
  for (const m of matchAll(/_hr_cnt\s*\)?\s*\//, code)) {
    add('hour-column-divided', lineAround(code, m.index));
  }

  // 5. An hours-per-day of the file's own invention.
  for (const m of matchAll(/(?:hours?[_ ]?per[_ ]?day|hrs?[_ ]?per[_ ]?day|day[_ ]?hr[_ ]?cnt)\s*[:=]\s*\d/i, code)) {
    add('local-hours-per-day-constant', lineAround(code, m.index));
  }

  // 5b. A threshold NAMED in hours, carrying an hours-worth constant — the
  //     shape `largeFloatHours: 320` had in state/prefs.js. Nothing read it, so
  //     no number was wrong yet; whatever wired it up would have inherited
  //     "40 days" pre-multiplied by 8. Thresholds are stated in working days.
  for (const m of matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*(?:Hours|Hrs|HOURS|HRS)\s*[:=]\s*(\d+(?:\.\d+)?)/, code)) {
    if (parseFloat(m[1]) >= HOUR_CONSTANT_FLOOR) add('threshold-stated-in-hours', lineAround(code, m.index));
  }

  // 6. Says "working days" over an hour column without going through the module
  //    that owns the divisor and its disclosure.
  if (DAY_LABEL.test(code) && HOUR_COLUMN.test(code) && !IMPORTS_CONVERTER.test(code)) {
    add('day-label-without-the-converter', 'file labels days over an hour column but does not import _shared/working-days.js');
  }

  return found;
}

function lineAround(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  let end = text.indexOf('\n', index);
  if (end === -1) end = text.length;
  return text.slice(start, end);
}

// ─────────────────────────────────────────────────────────────────────────────
// The detector itself, before it is trusted on real files.
// Every one of these is the defect as it was actually written, or the obvious
// next variant of it. A guard that cannot match reports clean.
// ─────────────────────────────────────────────────────────────────────────────
describe('the hour-conversion detector can actually fire', () => {
  const ids = (src) => violations(src).map(v => v.id);

  it('catches dcma-lite.js as it shipped — `> 352` under a "44 wd" label', () => {
    const planted = `
      const highFloatCount = tasks.filter(t => parseFloat(t.total_float_hr_cnt) > 352).length;
      const metric6 = { name: 'High Float (> 44 wd)' };
    `;
    expect(ids(planted)).toContain('hour-column-vs-hour-constant');
    expect(ids(planted)).toContain('day-label-without-the-converter');
  });

  it('catches summary.js as it shipped — `> 20 * 8`', () => {
    const planted = `
      const longDuration = realTasks.filter(t => {
        const d = parseFloat(t.target_drtn_hr_cnt);
        return !isNaN(d) && d > 20 * 8;
      }).length;
      concerns.push('duration > 20 working days');
    `;
    expect(ids(planted)).toContain('divides-or-multiplies-by-eight');
    expect(ids(planted)).toContain('day-label-without-the-converter');
  });

  it('catches risk-register.js as it shipped — `> 40 * 8`', () => {
    expect(ids('if (durationHr > 40 * 8) { }')).toContain('divides-or-multiplies-by-eight');
  });

  it('catches path-explorer.js as it shipped — `lagHrs / 8`', () => {
    expect(ids('const lagDays = lagHrs / 8;')).toContain('divides-or-multiplies-by-eight');
  });

  it('catches the reversed comparison a rewrite would produce', () => {
    expect(ids('if (352 < parseFloat(t.total_float_hr_cnt)) { }'))
      .toContain('hour-column-vs-hour-constant');
  });

  it('catches dividing the hour column directly', () => {
    expect(ids('const days = parseFloat(t.target_drtn_hr_cnt) / hoursPerDay;'))
      .toContain('hour-column-divided');
  });

  it('catches an hours-per-day constant declared locally', () => {
    expect(ids('const HOURS_PER_DAY = 8;')).toContain('local-hours-per-day-constant');
    expect(ids('const hrsPerDay = 10;')).toContain('local-hours-per-day-constant');
  });

  it('catches a threshold named in hours — state/prefs.js `largeFloatHours: 320`', () => {
    expect(ids('const DEFAULT_PREFS = { longDurationDays: 20, largeFloatHours: 320 };'))
      .toContain('threshold-stated-in-hours');
    // The same threshold stated in working days is the sanctioned form.
    expect(ids('const DEFAULT_PREFS = { longDurationDays: 20, largeFloatDays: 40 };'))
      .toEqual([]);
    // A raw hour count that is not a threshold is left alone.
    expect(ids('let tfHrs = parseFloat(task.total_float_hr_cnt || 0);')).toEqual([]);
  });

  it('catches going straight to the parser converter', () => {
    const planted = `import { durationHoursToDays } from '@criticalpathpartners/lens-parser';`;
    expect(ids(planted)).toContain('imports-the-parser-converter');
  });

  it('does NOT flag the sanctioned route', () => {
    const good = `
      import { workingDayContext, HOUR_FIELDS } from './_shared/working-days.js';
      const cal = workingDayContext(A);
      const wd = cal.workingDays(t, HOUR_FIELDS.TOTAL_FLOAT);
      if (wd != null && wd > 44) { /* High Float (> 44 wd) */ }
    `;
    expect(violations(good)).toEqual([]);
  });

  it('does NOT flag a status test against zero, or a raw-hours column label', () => {
    const fine = `
      const critical = parseFloat(t.total_float_hr_cnt) <= 0;
      const neg = rels.filter(r => parseFloat(r.lag_hr_cnt) < 0);
      const COLS = [{ key: 'total_float_hr_cnt', label: 'Float (hr)' }];
    `;
    expect(violations(fine)).toEqual([]);
  });

  it('does NOT flag milliseconds-per-day, year hours, or chart geometry', () => {
    const fine = `
      const ms = days * 86400000;
      const yearHours = 2080;
      const half = (bw - 8) / 2;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    `;
    // 86400000 and 2080 both start with a digit the arithmetic rules care about;
    // neither is a divisor, and none of the arithmetic rules may fire on them.
    const arithmetic = violations(fine).map(v => v.id);
    expect(arithmetic).not.toContain('divides-or-multiplies-by-eight');
    expect(arithmetic).not.toContain('hour-column-divided');
    expect(arithmetic).not.toContain('hour-column-vs-hour-constant');
  });

  it('an hour-named constant IS flagged, on purpose, even at 2080', () => {
    // Deliberate, not an accident of the regex: a constant named in hours is
    // how `largeFloatHours: 320` got written, and 2080 hr is "a year" only at
    // 8 hr/day. If a genuine hours-per-year is ever needed it belongs in
    // _shared/working-days.js with the rest of the calendar arithmetic.
    expect(violations('const yearHrs = 2080;').map(v => v.id))
      .toContain('threshold-stated-in-hours');
  });

  it('does not let a comment describing the ban count as the ban', () => {
    const src = `
      import { workingDayContext } from './_shared/working-days.js';
      // the old code was: parseFloat(t.total_float_hr_cnt) > 352, i.e. 44 * 8
      /* and here it is again: lagHrs / 8 */
      const wd = workingDayContext(A).workingDays(t, 'total_float_hr_cnt');
    `;
    expect(violations(src)).toEqual([]);
  });

  it('does not let a URL in a string be mistaken for a comment', () => {
    // A naive `//` strip eats the rest of the line, which would hide anything
    // written after a link.
    const src = `const href = 'https://criticalpathpartners.ca/x'; const d = h / 8;`;
    expect(stripComments(src)).toContain('criticalpathpartners.ca');
    expect(ids(src)).toContain('divides-or-multiplies-by-eight');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The tree, as it actually stands.
// ─────────────────────────────────────────────────────────────────────────────
describe('no source file converts P6 hours to days on its own', () => {
  const files = sourceFiles();

  it('finds the source tree', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some(f => f.endsWith(CONVERTER))).toBe(true);
  });

  it('every file outside the shared converter is clean', () => {
    const offenders = [];
    for (const file of files) {
      const rel = relative(SRC_DIR, file);
      if (rel === CONVERTER) continue;
      for (const v of violations(readFileSync(file, 'utf-8'))) {
        offenders.push(`${rel.replace(/\\/g, '/')} — ${v.id} — ${v.snippet}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the sections that report working days all route through the converter', () => {
    // Named so the guard has something concrete to lose if one is quietly
    // rewritten to convert on its own again.
    const mustImport = [
      'sections/dcma-lite.js',
      'sections/risk-register.js',
      'sections/summary.js',
      'sections/schedule-quality.js',
      'sections/constraints-float.js',
      'sections/distribution.js',
      'sections/lookahead.js',
      'sections/path-explorer.js'
    ];
    for (const rel of mustImport) {
      const src = readFileSync(join(SRC_DIR, rel), 'utf-8');
      expect(IMPORTS_CONVERTER.test(src), `${rel} must import _shared/working-days.js`).toBe(true);
    }
  });
});
