/**
 * XER Utilities — strip POBS, anonymize, calendar report, schema export.
 */

import { h } from '../lib/dom.js';
import { getCalendarMap, writeXer } from '@criticalpathpartners/lens-parser';
import { download } from '../lib/download.js';
import { anonymizeModel } from '../mcp/anonymizer.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getFileStem(A) {
  const name = (A && A.filename) ? A.filename : 'schedule.xer';
  return name.replace(/\.xer$/i, '');
}

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Card builders
// ─────────────────────────────────────────────────────────────────────────────

function buildPobsCard(A) {
  const stem = getFileStem(A);
  const pobsTable = A.tables && A.tables.POBS;
  const pobsCount = pobsTable ? pobsTable.records.length : 0;
  const statusText = pobsTable
    ? `POBS present: yes (${pobsCount} record${pobsCount === 1 ? '' : 's'})`
    : 'POBS present: no';

  const statusEl = h('div', { class: 'status' }, statusText);

  const btn = h('button', {}, 'Download POBS-cleaned XER');
  btn.addEventListener('click', () => {
    const cleaned = JSON.parse(JSON.stringify(A));
    delete cleaned.tables.POBS;
    const text = writeXer(cleaned);
    download(text, stem + '-no-pobs.xer', 'text/plain');
    statusEl.textContent = 'Downloaded: ' + stem + '-no-pobs.xer';
  });

  return h('div', { class: 'util-card' }, [
    h('h3', {}, 'POBS Cleaner'),
    h('div', { class: 'desc' }, 'Strips the POBS (organisational breakdown) table and downloads a cleaned XER.'),
    h('div', {}, [statusText]),
    btn,
    statusEl
  ]);
}

function buildAnonymizerCard(A) {
  const stem = getFileStem(A);

  const statusEl = h('div', { class: 'status' }, '');
  const shaEl = h('div', { class: 'sha' }, '');

  const btnXer = h('button', {}, 'Download anonymized XER');
  btnXer.addEventListener('click', () => {
    const { model } = anonymizeModel(A);
    const text = writeXer(model);
    // Generic name on purpose. The output of this button exists to be handed
    // to a third party, and the ORIGINAL filename is routinely the client and
    // project in plain text ("Northgate-C05-Mill-Update-12.xer" style), so
    // carrying the stem forward re-identified the very thing the file was
    // scrubbed of. The map download below keeps the stem: that file stays
    // with the owner by definition.
    download(text, 'anonymized-schedule.xer', 'text/plain');
    statusEl.textContent = 'Downloaded: anonymized-schedule.xer (deliberately not named after your file)';
  });

  const btnMap = h('button', {}, 'Download anon map (keep safe)');
  btnMap.addEventListener('click', () => {
    const { map } = anonymizeModel(A);
    const json = JSON.stringify(map, null, 2);
    download(json, stem + '-anon-map.json', 'application/json');
    statusEl.textContent = 'Downloaded: ' + stem + '-anon-map.json';
  });

  const btnSha = h('button', {}, 'Show SHA-256 of anon map');
  btnSha.addEventListener('click', async () => {
    const { map } = anonymizeModel(A);
    const json = JSON.stringify(map, null, 2);
    const hex = await sha256Hex(json);
    shaEl.textContent = 'SHA-256: ' + hex.slice(0, 16) + '…';
  });

  return h('div', { class: 'util-card' }, [
    h('h3', {}, 'Anonymizer'),
    h('div', { class: 'desc' }, 'Replaces activity/WBS names with opaque tokens. Produces an anonymized XER and a de-anonymization map.'),
    btnXer,
    btnMap,
    btnSha,
    shaEl,
    statusEl
  ]);
}

function buildCalendarReportCard(A) {
  const stem = getFileStem(A);
  const calMap = getCalendarMap(A);
  const calendars = Object.values(calMap);

  const statusEl = h('div', { class: 'status' }, '' + calendars.length + ' calendar' + (calendars.length === 1 ? '' : 's') + ' found.');

  const btn = h('button', {}, 'Download Calendar Report');
  btn.addEventListener('click', () => {
    const cards = calendars.map(cal => {
      const workDays = (cal.work_day_names && cal.work_day_names.length > 0)
        ? cal.work_day_names.join(', ')
        : (cal.work_days && cal.work_days.length > 0 ? cal.work_days.join(', ') : '—');

      const holidayItems = (cal.holidays && cal.holidays.length > 0)
        ? '<ul>' + cal.holidays.map(d => '<li>' + d + '</li>').join('') + '</ul>'
        : '<em>None</em>';

      const specialItems = (cal.special_workdays && cal.special_workdays.length > 0)
        ? '<ul>' + cal.special_workdays.map(d => '<li>' + d + '</li>').join('') + '</ul>'
        : '<em>None</em>';

      return `<div class="cal">
  <h2>${escHtml(cal.clndr_name || cal.clndr_id || '—')}</h2>
  <div class="meta">ID: ${escHtml(String(cal.clndr_id || '—'))} &nbsp;|&nbsp; Hours/day: ${escHtml(String(cal.hours_per_day != null ? cal.hours_per_day : '—'))}</div>
  <div class="meta">Work days: ${escHtml(workDays)}</div>
  <ul>
    <li><strong>Holidays (${cal.holidays ? cal.holidays.length : 0}):</strong> ${holidayItems}</li>
    <li><strong>Special workdays (${cal.special_workdays ? cal.special_workdays.length : 0}):</strong> ${specialItems}</li>
  </ul>
</div>`;
    }).join('\n');

    const html = `<!doctype html><html><head><title>Calendar Report</title>
<style>body{font-family:system-ui,Arial,sans-serif;max-width:900px;margin:24px auto;padding:16px;color:#0F2540}h1{color:#0F2540}.cal{border:1px solid #D8E0EA;border-radius:10px;padding:14px;margin:14px 0;background:#fff}.cal h2{margin:0 0 8px;font-size:18px}.cal .meta{color:#5A6675;font-size:13px;margin-bottom:8px}.cal ul{margin:8px 0 0;padding-left:18px;font-size:13px}</style>
</head><body>
<h1>Calendar Report: ${escHtml(stem + '.xer')}</h1>
${cards}
</body></html>`;

    download(html, stem + '-calendars.html', 'text/html');
    statusEl.textContent = 'Downloaded: ' + stem + '-calendars.html';
  });

  return h('div', { class: 'util-card' }, [
    h('h3', {}, 'Calendar Report'),
    h('div', { class: 'desc' }, 'Generates a self-contained HTML report of every calendar: work-week, holidays, special workdays. Browser-printable.'),
    btn,
    statusEl
  ]);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSchemaCard(A) {
  const stem = getFileStem(A);

  const statusEl = h('div', { class: 'status' }, '' + Object.keys(A.tables).length + ' tables in schema.');

  const btn = h('button', {}, 'Download Schema JSON');
  btn.addEventListener('click', () => {
    const schema = {
      ermhdr: A.ermhdr,
      tables: Object.fromEntries(
        Object.entries(A.tables).map(([k, v]) => [k, {
          fields: v.fields,
          recordCount: v.records.length
        }])
      )
    };
    const json = JSON.stringify(schema, null, 2);
    download(json, stem + '-schema.json', 'application/json');
    statusEl.textContent = 'Downloaded: ' + stem + '-schema.json';
  });

  return h('div', { class: 'util-card' }, [
    h('h3', {}, 'Schema Report'),
    h('div', { class: 'desc' }, 'Exports ermhdr + per-table fields and record counts. Useful for support tickets and compatibility checks.'),
    btn,
    statusEl
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main render
// ─────────────────────────────────────────────────────────────────────────────

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'XER Utilities'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const grid = h('div', { class: 'lens-utilities-grid' }, [
    buildPobsCard(A),
    buildAnonymizerCard(A),
    buildCalendarReportCard(A),
    buildSchemaCard(A)
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'XER Utilities'),
    h('p', { style: { color: 'var(--muted)', marginBottom: '4px' } },
      'Utilities for working with the loaded XER: strip POBS, anonymize, report calendars, or export schema metadata.'),
    grid
  ]);
}
