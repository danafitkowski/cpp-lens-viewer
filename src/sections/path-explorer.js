import { h, clear } from '../lib/dom.js';
import { getTable, getTableAliased } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

const MAX_DEPTH = 200;
const SKIP_TYPES = new Set(['TT_LOE', 'TT_WBS']);
export const DROPDOWN_LIMIT = 5000;

const CHAIN_COLS = [
  { key: 'task_code',          label: 'Code' },
  { key: 'task_name',          label: 'Name' },
  { key: 'target_start_date',  label: 'Start',  render: v => (v || '').slice(0, 10) },
  { key: 'target_end_date',    label: 'Finish', render: v => (v || '').slice(0, 10) },
  { key: 'total_float_hr_cnt', label: 'Float (hr)' }
];

// ─────────────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────────────

function parseP6Date(raw) {
  const s = (raw || '').trim();
  if (!s) return null;
  // YYYY-MM-DD [HH:MM]
  const d = new Date(s.slice(0, 10));
  return isNaN(d.getTime()) ? null : d;
}

function dateMs(raw) {
  const d = parseP6Date(raw);
  return d ? d.getTime() : null;
}

// ─────────────────────────────────────────────────────────────────────
// DRIVING LINK HEURISTIC
// ─────────────────────────────────────────────────────────────────────

/**
 * Given a list of predecessor relationship records for a task, pick the
 * "driving" one — the predecessor whose linked task's target_end_date is
 * closest (but not after) current task's effective start minus lag.
 *
 * Returns the pred_task_id of the driving predecessor, or null if none.
 */
function pickDrivingPredecessor(task, predRels, taskById) {
  if (!predRels || predRels.length === 0) return null;

  const taskStartMs = dateMs(task.target_start_date);

  let best = null;
  let bestDiff = Infinity;

  for (const rel of predRels) {
    const predTask = taskById[rel.pred_task_id];
    if (!predTask) continue;

    const lagHrs  = parseFloat(rel.lag_hr_cnt) || 0;
    const lagDays = lagHrs / 8;

    // Effective start threshold = task.target_start_date - lag
    const thresholdMs = taskStartMs != null ? taskStartMs - lagDays * 86400000 : null;
    const predEndMs   = dateMs(predTask.target_end_date);

    if (thresholdMs != null && predEndMs != null) {
      // Must not be after the threshold
      if (predEndMs <= thresholdMs) {
        const diff = thresholdMs - predEndMs;
        if (diff < bestDiff) {
          bestDiff = diff;
          best = rel;
        } else if (diff === bestDiff) {
          // Tied — prefer PR_FS
          if (rel.pred_type === 'PR_FS' && best.pred_type !== 'PR_FS') {
            best = rel;
          }
        }
      }
    } else {
      // Dates unparseable — fall through to tie-break below
      if (best === null) best = rel;
      // Prefer PR_FS
      if (rel.pred_type === 'PR_FS' && best.pred_type !== 'PR_FS') {
        best = rel;
      }
    }
  }

  // If we never found one within threshold, pick first PR_FS or first
  if (best === null) {
    best = predRels.find(r => r.pred_type === 'PR_FS') || predRels[0];
  }

  return best ? best.pred_task_id : null;
}

/**
 * Pick the driving successor: the successor task whose target_start_date is
 * closest (but not before) current task's target_end_date + lag.
 *
 * Returns the task_id of the driving successor, or null if none.
 */
function pickDrivingSuccessor(task, succRels, taskById) {
  if (!succRels || succRels.length === 0) return null;

  const taskEndMs = dateMs(task.target_end_date);

  let best = null;
  let bestDiff = Infinity;

  for (const rel of succRels) {
    const succTask = taskById[rel.task_id];
    if (!succTask) continue;

    const lagHrs  = parseFloat(rel.lag_hr_cnt) || 0;
    const lagDays = lagHrs / 8;

    // Effective threshold = task.target_end_date + lag
    const thresholdMs = taskEndMs != null ? taskEndMs + lagDays * 86400000 : null;
    const succStartMs = dateMs(succTask.target_start_date);

    if (thresholdMs != null && succStartMs != null) {
      // Must not be before threshold
      if (succStartMs >= thresholdMs) {
        const diff = succStartMs - thresholdMs;
        if (diff < bestDiff) {
          bestDiff = diff;
          best = rel;
        } else if (diff === bestDiff) {
          if (rel.pred_type === 'PR_FS' && best.pred_type !== 'PR_FS') {
            best = rel;
          }
        }
      }
    } else {
      if (best === null) best = rel;
      if (rel.pred_type === 'PR_FS' && best.pred_type !== 'PR_FS') {
        best = rel;
      }
    }
  }

  if (best === null) {
    best = succRels.find(r => r.pred_type === 'PR_FS') || succRels[0];
  }

  return best ? best.task_id : null;
}

// ─────────────────────────────────────────────────────────────────────
// BUILD RELATIONSHIP MAPS
// ─────────────────────────────────────────────────────────────────────

function buildRelMaps(A) {
  const rels = getTableAliased(A, 'REL');
  // predRelsOf[task_id] = [ rel records where this task is the successor ]
  // succRelsOf[task_id] = [ rel records where this task is the predecessor ]
  const predRelsOf = {};
  const succRelsOf = {};

  for (const rel of rels) {
    const succId = rel.task_id;
    const predId = rel.pred_task_id;

    if (!predRelsOf[succId]) predRelsOf[succId] = [];
    predRelsOf[succId].push(rel);

    if (!succRelsOf[predId]) succRelsOf[predId] = [];
    succRelsOf[predId].push(rel);
  }

  return { predRelsOf, succRelsOf };
}

// ─────────────────────────────────────────────────────────────────────
// TRACE CHAIN (exported)
// ─────────────────────────────────────────────────────────────────────

/**
 * Trace driving-path chain from startId in the given direction.
 *
 * @param {object}  A         - parsed XER model
 * @param {string}  startId   - task_id to start from (NOT included in result)
 * @param {string}  direction - 'backward' | 'forward'
 * @returns {Array} Array of TASK records along the driving chain (excluding
 *   start). Carries a `.truncated` boolean property — true when the trace
 *   was cut off by MAX_DEPTH rather than legitimately running out of
 *   driving predecessors/successors.
 */
export function traceChain(A, startId, direction) {
  const tasks   = getTable(A, 'TASK');
  const taskById = {};
  for (const t of tasks) taskById[t.task_id] = t;

  const { predRelsOf, succRelsOf } = buildRelMaps(A);

  const chain   = [];
  const visited = new Set();
  visited.add(startId);

  let currentId = startId;

  while (chain.length < MAX_DEPTH) {
    let nextId;
    const currentTask = taskById[currentId];
    if (!currentTask) break;

    if (direction === 'backward') {
      const rels = predRelsOf[currentId] || [];
      nextId = pickDrivingPredecessor(currentTask, rels, taskById);
    } else {
      const rels = succRelsOf[currentId] || [];
      nextId = pickDrivingSuccessor(currentTask, rels, taskById);
    }

    if (!nextId) break;
    if (visited.has(nextId)) break; // cycle guard

    const nextTask = taskById[nextId];
    if (!nextTask) break;

    visited.add(nextId);
    chain.push(nextTask);
    currentId = nextId;
  }

  // The while loop only exits with chain.length === MAX_DEPTH when the
  // condition itself ended it (i.e. a hop was still found on the last
  // iteration) — every other exit (no driving link, cycle, missing task)
  // breaks before reaching the cap, leaving chain.length < MAX_DEPTH.
  chain.truncated = chain.length >= MAX_DEPTH;

  return chain;
}

// ─────────────────────────────────────────────────────────────────────
// RENDER CHAIN RESULT
// ─────────────────────────────────────────────────────────────────────

function renderChainCard(label, chain) {
  const title = h('h3', {}, label);
  const content = chain.length === 0
    ? h('p', { class: 'lens-section-stub' }, 'No driving predecessors found.')
    : dataTable({ columns: CHAIN_COLS, rows: chain });

  const children = [title, content];
  if (chain.truncated) {
    children.push(h('div', { class: 'lens-table-foot' },
      `Chain truncated at ${MAX_DEPTH} activities. The true driving path may continue further.`
    ));
  }

  return h('div', { class: 'lens-card' }, children);
}

// ─────────────────────────────────────────────────────────────────────
// ACTIVITY PICKER LIST (exported for testing — see path-explorer.test.js)
// ─────────────────────────────────────────────────────────────────────

/**
 * Filter tasks down to the pickable (non-WBS/LOE) set and cap it at
 * DROPDOWN_LIMIT for the activity picker.
 *
 * @param {Array} allTasks - all TASK records
 * @returns {{ pickable: Array, eligibleCount: number, truncated: boolean }}
 */
export function pickEligibleTasks(allTasks) {
  const eligibleTasks = allTasks.filter(t => !SKIP_TYPES.has(t.task_type));
  return {
    pickable: eligibleTasks.slice(0, DROPDOWN_LIMIT),
    eligibleCount: eligibleTasks.length,
    truncated: eligibleTasks.length > DROPDOWN_LIMIT
  };
}

// ─────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Path Explorer'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const allTasks = getTable(A, 'TASK');
  const { pickable, eligibleCount, truncated: dropdownTruncated } = pickEligibleTasks(allTasks);

  // Build dropdown options
  const placeholder = h('option', { value: '' }, '— pick an activity to trace —');
  const options = [placeholder].concat(
    pickable.map(t =>
      h('option', { value: t.task_id }, `${t.task_code || t.task_id} — ${t.task_name || ''}`)
    )
  );

  const select = h('select', { class: 'lens-activity-picker' }, null);
  for (const opt of options) select.appendChild(opt);

  // Result slot
  const resultSlot = h('div', {}, [
    h('p', { class: 'lens-section-stub' }, 'Pick an activity above.')
  ]);

  select.addEventListener('change', () => {
    const taskId = select.value;
    clear(resultSlot);

    if (!taskId) {
      resultSlot.appendChild(h('p', { class: 'lens-section-stub' }, 'Pick an activity above.'));
      return;
    }

    const backward = traceChain(A, taskId, 'backward');
    const forward  = traceChain(A, taskId, 'forward');

    const kpiRow = h('div', { class: 'kpi-grid' }, [
      kpiCard({ title: 'Backward chain', big: backward.length, sub: 'driving predecessors' }),
      kpiCard({ title: 'Forward chain',  big: forward.length,  sub: 'driving successors'  })
    ]);

    const chains = h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap' } }, [
      h('div', { style: { flex: '1', minWidth: '320px' } }, [
        renderChainCard('Backward chain (driving predecessors)', backward)
      ]),
      h('div', { style: { flex: '1', minWidth: '320px' } }, [
        renderChainCard('Forward chain (driving successors)', forward)
      ])
    ]);

    resultSlot.appendChild(kpiRow);
    resultSlot.appendChild(chains);
  });

  const cardChildren = [
    h('p', {}, 'Select an activity to trace its driving predecessor chain back to project start and driving successor chain forward to project finish.'),
    select,
  ];
  if (dropdownTruncated) {
    cardChildren.push(h('div', { class: 'lens-table-foot' },
      `Showing first ${DROPDOWN_LIMIT} of ${eligibleCount} activities. Use search/filter elsewhere to narrow down the list.`
    ));
  }

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Path Explorer'),
    h('div', { class: 'lens-card' }, cardChildren),
    resultSlot
  ]);
}
