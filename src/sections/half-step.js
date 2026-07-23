/**
 * Half-Step XER Generator — AACE 29R-03 MIP 3.4 (CPP industry first)
 *
 * Produces a third XER by applying ONLY progress fields from an updated
 * schedule (A) onto a deep copy of a base schedule (B), leaving all
 * planned/structural fields from B intact.
 *
 * This isolates "what changed in terms of progress?" from "what changed
 * in terms of plan?" — the canonical MIP 3.4 construct.
 */

import { h } from '../lib/dom.js';
import { getTable, writeXer } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';

// ─────────────────────────────────────────────────────────────────────────────
// HALF-STEP LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Progress fields that are ALLOWED to be copied from A onto the B copy.
 * ALL other fields remain from B.
 */
const PROGRESS_FIELDS = [
  'phys_complete_pct',
  'act_start_date',
  'act_end_date',
  'remain_drtn_hr_cnt',
  'status_code'
];

/**
 * status_code may only be copied forward from A when A's value indicates
 * work has started or completed.  Never regress an activity back to not-started.
 */
const COPYABLE_STATUS = new Set(['TK_Active', 'TK_Complete']);

/**
 * Generate a Half-Step XER model.
 *
 * The result model is a deep copy of B with A's progress fields overlaid
 * for matched activities.  B's structure (planned dates, durations,
 * task names, WBS, calendars, logic) is preserved verbatim.
 *
 * @param {object} A - parsed XER model for the updated / period-end schedule
 * @param {object} B - parsed XER model for the base / period-start schedule
 * @returns {object} merged model with ermhdr.isHalfStep = true
 */
export function generateHalfStep(A, B) {
  // Deep-copy B so we never mutate the original
  const result = JSON.parse(JSON.stringify(B));

  // Build A's TASK lookup by task_id
  const aTasks = getTable(A, 'TASK') || [];
  const aById = {};
  for (const t of aTasks) {
    if (t.task_id != null && t.task_id !== '') {
      aById[String(t.task_id)] = t;
    }
  }

  const bTasks = result.tables?.TASK?.records || [];
  let matched = 0;
  let unmatchedInBase = 0;

  for (const bTask of bTasks) {
    const aTask = aById[String(bTask.task_id)];
    if (!aTask) {
      // Activity exists in B but not A — preserve as-is
      unmatchedInBase++;
      continue;
    }

    matched++;

    // Copy progress fields from A onto the B-copy row
    for (const field of PROGRESS_FIELDS) {
      if (!(field in aTask)) continue;

      if (field === 'status_code') {
        // Only copy forward — never regress to TK_NotStart
        if (COPYABLE_STATUS.has(aTask.status_code)) {
          bTask.status_code = aTask.status_code;
        }
      } else {
        bTask[field] = aTask[field];
      }
    }
  }

  // Build stats for the result
  const bTaskIds = new Set(bTasks.map(t => String(t.task_id)));
  const unmatchedInUpdated = aTasks.filter(t => !bTaskIds.has(String(t.task_id))).length;

  // Count TASKPRED rows preserved from B
  const logicPreserved = result.tables?.TASKPRED?.records?.length ?? 0;

  // Mark the model as a Half-Step (AACE 29R-03 MIP 3.4)
  result.ermhdr = result.ermhdr || {};
  result.ermhdr.isHalfStep = true;

  // Attach summary metadata (non-XER, consumed by render / tests)
  result._halfStepMeta = {
    matched,
    unmatchedInUpdated,
    unmatchedInBase,
    logicPreserved
  };

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD HELPER
// ─────────────────────────────────────────────────────────────────────────────

function triggerDownload(text, filename, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────────

export function render({ A, B }) {
  if (!A || !B) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Half-Step XER — AACE 29R-03 MIP 3.4'),
      h('div', { class: 'lens-card' }, [
        h('p', {},
          'Load two XERs (baseline + updated) to generate a Half-Step XER.  ' +
          'AACE 29R-03 MIP 3.4.'
        )
      ])
    ]);
  }

  // Compute the half-step model eagerly so KPIs are available
  const model = generateHalfStep(A, B);
  const meta  = model._halfStepMeta;

  // Explainer card
  const explainerCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'What is a Half-Step XER?'),
    h('p', {},
      'A Half-Step XER starts from the BASE schedule (B) and overlays only ' +
      'progress fields (actual dates, remaining duration, % complete, status) ' +
      'from the UPDATED schedule (A).  Planned dates, durations, logic, names, ' +
      'and WBS remain exactly as B defined them.  This isolates pure progress ' +
      'impact from plan changes — the canonical AACE 29R-03 MIP 3.4 construct ' +
      'for forensic period analysis.'
    )
  ]);

  // KPI row
  const kpiRow = h('div', { class: 'kpi-grid' }, [
    kpiCard({ title: 'Matched activities',       big: meta.matched,              sub: 'task_id found in both B and A' }),
    kpiCard({ title: 'Unmatched in updated',     big: meta.unmatchedInUpdated,   sub: 'A-only — dropped (not added to output)' }),
    kpiCard({ title: 'Unmatched in base',        big: meta.unmatchedInBase,      sub: 'B-only — preserved verbatim' }),
    kpiCard({ title: 'Logic preserved',          big: meta.logicPreserved,       sub: 'TASKPRED rows from B' })
  ]);

  // Preview state container
  let previewVisible = false;
  const previewContainer = h('div', { class: 'lens-card', style: { display: 'none' } });

  function buildPreview() {
    const taskCount  = model.tables?.TASK?.records?.length ?? 0;
    const isHalfStep = model.ermhdr?.isHalfStep ?? false;
    previewContainer.innerHTML = '';
    previewContainer.appendChild(h('h3', {}, 'Half-Step Model Preview'));
    previewContainer.appendChild(h('p', {}, `TASK rows: ${taskCount}`));
    previewContainer.appendChild(h('p', {}, `ermhdr.isHalfStep: ${isHalfStep}`));
    previewContainer.appendChild(h('p', {}, `TASKPRED rows: ${meta.logicPreserved}`));
    previewContainer.appendChild(h('p', {}, `Matched activities: ${meta.matched}`));
    previewContainer.appendChild(h('p', {}, `Unmatched in updated (dropped): ${meta.unmatchedInUpdated}`));
    previewContainer.appendChild(h('p', {}, `Unmatched in base (preserved): ${meta.unmatchedInBase}`));
    previewContainer.appendChild(h('p', { style: { color: '#15803D', fontWeight: '700' } },
      'AACE 29R-03 MIP 3.4 Half-Step flag is set.'
    ));
  }

  // Derive a sensible filename from A's first PROJECT row
  function buildFilename() {
    const projects = getTable(A, 'PROJECT') || [];
    const shortName = (projects[0]?.proj_short_name || 'schedule').replace(/\s+/g, '-').toLowerCase();
    return `${shortName}-half-step.xer`;
  }

  // "Generate + Download" button
  const downloadBtn = h('button', {
    class: 'lens-btn-primary',
    style: { background: '#0F2540', color: '#fff', padding: '10px 20px', border: 'none',
             borderRadius: '4px', cursor: 'pointer', fontWeight: '700', marginRight: '12px' },
    onclick() {
      const xerText  = writeXer(model);
      const filename = buildFilename();
      triggerDownload(xerText, filename, 'text/plain');
    }
  }, 'Generate + Download Half-Step XER');

  // "Show preview" toggle button
  const toggleBtn = h('button', {
    class: 'lens-btn-secondary',
    style: { padding: '10px 20px', border: '1px solid #0F2540', borderRadius: '4px',
             cursor: 'pointer', fontWeight: '700' },
    onclick() {
      previewVisible = !previewVisible;
      if (previewVisible) {
        buildPreview();
        previewContainer.style.display = '';
        toggleBtn.textContent = 'Hide preview';
      } else {
        previewContainer.style.display = 'none';
        toggleBtn.textContent = 'Show preview';
      }
    }
  }, 'Show preview');

  const buttonRow = h('div', { style: { margin: '16px 0' } }, [downloadBtn, toggleBtn]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Half-Step XER — AACE 29R-03 MIP 3.4'),
    explainerCard,
    kpiRow,
    buttonRow,
    previewContainer
  ]);
}
