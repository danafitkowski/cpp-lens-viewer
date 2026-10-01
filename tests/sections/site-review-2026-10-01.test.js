// @vitest-environment happy-dom
//
// The 1-Oct-2026 site review, on CPP Lens.
//
// 1. The built-in sample showed a dash for its calendar's work days and RD 0
//    on every unstarted activity in the 3-Week Lookahead. The sample carried
//    no clndr_data and no remain_drtn_hr_cnt. It now carries both, generated
//    by scripts/generate-sample-schedule.py.
// 2. Schedule Quality flagged long duration at 20 and large float at 40 working
//    days beside DCMA Lite's 44, with nothing saying which is which. Its two
//    thresholds are now labelled CPP heuristics and the note names DCMA's 44.
// 3. Wording: the Windows Analysis card said the tool attributes delay "to
//    owner, contractor, or concurrent causes", which a schedule cannot show;
//    the DCMA Lite button sent readers to "the free Schedule Health Report"
//    (this screening's own name) for an A-F grade only the analyst-delivered
//    Schedule Health Assessment gives; the page title carried an em dash.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer, getTable, getCalendarMap } from '@criticalpathpartners/lens-parser';
import { SAMPLE_XER } from '../../src/sample/sample-schedule.js';
import { computeLookahead } from '../../src/sections/lookahead.js';
import { render as renderQuality, THRESHOLD_NOTE } from '../../src/sections/schedule-quality.js';
import { render as renderDcma } from '../../src/sections/dcma-lite.js';
import { TOOLS } from '../../src/sections/deep-forensic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const sample = () => parseXer(SAMPLE_XER, { filename: 'sample-demo.xer' });

describe('the built-in sample', () => {
  it('has a calendar whose work week and holidays decode', () => {
    const cal = getCalendarMap(sample())['C1'];
    expect(cal.parse_incomplete).toBe(false);
    expect(cal.work_day_names).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    expect(cal.holidays.sort()).toEqual(['2026-02-16', '2026-04-03']);
  });

  it('carries a remaining duration on every activity, equal to the original before it starts', () => {
    for (const t of getTable(sample(), 'TASK')) {
      expect(t.remain_drtn_hr_cnt, t.task_code).not.toBeUndefined();
      if (t.status_code === 'TK_NotStart') expect(t.remain_drtn_hr_cnt, t.task_code).toBe(t.target_drtn_hr_cnt);
      if (t.status_code === 'TK_Complete') expect(Number(t.remain_drtn_hr_cnt), t.task_code).toBe(0);
    }
  });

  it('shows a non-zero RD for every unstarted, non-milestone lookahead row', () => {
    const rows = computeLookahead(sample()).weekRows.flat();
    const unstarted = rows.filter(r => r.status === 'NOT STARTED' && r.od !== '0');
    expect(unstarted.length).toBeGreaterThan(0);
    for (const r of unstarted) expect(r.rd, r.task_code).toBe(r.od);
  });
});

describe('Schedule Quality thresholds', () => {
  it('labels 20 and 40 as CPP heuristics and names the DCMA 44', () => {
    expect(THRESHOLD_NOTE).toMatch(/CPP heuristic/);
    expect(THRESHOLD_NOTE).toMatch(/20 and 40 working days/);
    expect(THRESHOLD_NOTE).toMatch(/44 working days DCMA/);
    const el = renderQuality({ A: sample() });
    expect(el.textContent).toContain(THRESHOLD_NOTE);
  });
});

describe('wording', () => {
  it('no forensic tool card claims to find cause', () => {
    for (const t of TOOLS) expect(t.description, t.id).not.toMatch(/causes?\b/i);
  });

  it('DCMA Lite sends readers to the Schedule Health Assessment for the grade', () => {
    const text = renderDcma({ A: sample() }).textContent;
    expect(text).toContain('Schedule Health Assessment for the full A to F grade');
    expect(text).not.toMatch(/Schedule Health Report for the full/);
  });

  it('the page title has no em dash', () => {
    const cfg = readFileSync(join(ROOT, 'esbuild.config.js'), 'utf-8');
    expect(cfg).toContain('<title>CPP Lens: Free P6 Viewer</title>');
    expect(cfg).not.toContain('CPP Lens —');
  });
});
