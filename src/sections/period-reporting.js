import { h } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';
import {
  indexTasks as indexTasksShared, indexTasksByCode, resolveTaskKey, resolveComparisonAmbiguity
} from './_shared/identity.js';

/**
 * Compute A − B in calendar days for two date strings.
 * Returns 0 when either value cannot be parsed.
 * + = slipped (A is later), − = accelerated (A is earlier).
 *
 * @param {string} after  - Date string from model A
 * @param {string} before - Date string from model B
 * @returns {number}
 */
function calDayDelta(after, before) {
  if (!after || !before) return 0;
  const da = new Date(String(after).slice(0, 10));
  const db = new Date(String(before).slice(0, 10));
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
  return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Index tasks by the STABLE cross-schedule key — see _shared/identity.js for
 * the rule and why task_id must never be it. Delegates so there is exactly one
 * implementation of activity identity in the viewer. Exported for the
 * cross-schedule matching tests.
 *
 * @param {object|null} model
 * @param {Set<string>|null} [ambiguousKeys] - from resolveComparisonAmbiguity().keys
 * @returns {Map<string, object>}
 */
export function indexTasks(model, ambiguousKeys = null) {
  return indexTasksByCode(model, ambiguousKeys);
}

/**
 * Get the first PROJECT record's last_recalc_date string, or ''.
 *
 * @param {object|null} model
 * @returns {string}
 */
function getDataDate(model) {
  const recs = getTable(model, 'PROJECT');
  return recs[0]?.last_recalc_date || '';
}

/**
 * Period Reporting — progress-over-period analysis.
 *
 * Compares B (period start / baseline) to A (current) for each activity
 * present in both schedules, buckets activities by status-code change and
 * date-slip direction, and renders KPI cards + per-bucket tables.
 *
 * @param {{ A: object|null, B: object|null }} props
 * @returns {HTMLElement}
 */
export function render({ A, B }) {
  if (!A || !B) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Period Reporting'),
      h('div', { class: 'lens-card' }, [
        h('p', {}, 'Load two XERs. Period Reporting compares progress between baseline and current.')
      ])
    ]);
  }

  // ONE ambiguity ledger for the pair, applied to both sides. Activity IDs are
  // matched UNSCOPED — there is no project scope to get wrong — and a code
  // repeated in either file is excluded from both, counted, and disclosed.
  const ambiguity = resolveComparisonAmbiguity(A, B);
  const aIdx = indexTasksShared(A, ambiguity.keys);
  const bIdx = indexTasksShared(B, ambiguity.keys);
  const aTasks = aIdx.index;
  const bTasks = bIdx.index;

  const completedThisPeriod = [];
  const startedThisPeriod   = [];
  const slipped              = [];
  const accelerated          = [];
  const unchanged            = [];

  let earnedWeightedSum  = 0;
  let earnedWeightTotal  = 0;
  let totalSlipDays      = 0;
  let matched            = 0;

  for (const [id, aTask] of aTasks) {
    const bTask = bTasks.get(id);
    if (!bTask) continue;
    matched++;

    const aStatus = aTask.status_code || '';
    const bStatus = bTask.status_code || '';

    const aPct = parseFloat(aTask.phys_complete_pct);
    const bPct = parseFloat(bTask.phys_complete_pct);
    const pctDelta = (isNaN(aPct) ? 0 : aPct) - (isNaN(bPct) ? 0 : bPct);

    const dateDelta = calDayDelta(aTask.target_end_date, bTask.target_end_date);

    // Weighted earned-value accumulation
    const weight = parseFloat(aTask.target_drtn_hr_cnt);
    if (!isNaN(weight) && weight > 0) {
      earnedWeightedSum += pctDelta * weight;
      earnedWeightTotal += weight;
    }

    if (dateDelta > 0) totalSlipDays += dateDelta;

    // Identity for display. The column holds the Activity ID (task_code), so the
    // property is named for that — calling it task_id was what let the column get
    // headed "ID", which reads as the internal surrogate and is a different,
    // export-specific number. `matchedOn` carries whether this row actually had a
    // code, so a fallback to the surrogate is labelled instead of passed off as
    // an Activity ID.
    const aIdent = resolveTaskKey(aTask);
    const bIdent = resolveTaskKey(bTask);
    const ident = aIdent.display ? aIdent : bIdent;

    const row = {
      activityId: ident.display,
      matchedOn:  ident.matched_on,
      task_name:  aTask.task_name || '',
      pctDelta,
      dateDelta
    };

    // Bucket assignment (in priority order)
    if (bStatus !== 'TK_Complete' && aStatus === 'TK_Complete') {
      completedThisPeriod.push(row);
    } else if (bStatus === 'TK_NotStart' && aStatus === 'TK_Active') {
      startedThisPeriod.push(row);
    } else if (dateDelta > 0) {
      slipped.push(row);
    } else if (dateDelta < 0) {
      accelerated.push(row);
    } else {
      // Catch-all: status unchanged, target_end_date unchanged, but something else
      // moved (typically phys_complete_pct). This activity already contributed to
      // earnedWeightedSum/earnedWeightTotal above, so it must still land in exactly
      // one visible bucket table rather than being silently dropped.
      unchanged.push(row);
    }
  }

  const earnedPct = earnedWeightTotal > 0
    ? (earnedWeightedSum / earnedWeightTotal)
    : 0;

  const aDataDate = getDataDate(A);
  const bDataDate = getDataDate(B);

  let dataDateSpan = 0;
  if (aDataDate && bDataDate) {
    const da = new Date(String(aDataDate).slice(0, 10));
    const db = new Date(String(bDataDate).slice(0, 10));
    if (!isNaN(da.getTime()) && !isNaN(db.getTime())) {
      dataDateSpan = Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  /** @param {number} v */
  function fmtPct(v) {
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }

  /** @param {number} v */
  function fmtDays(v) {
    return (v > 0 ? '+' : '') + v;
  }

  const TABLE_COLS = [
    {
      key: 'activityId',
      label: 'Activity ID',
      // Honest degradation: a row with no task_code was matched on the internal
      // surrogate, which is export-specific. Say so rather than printing it under
      // an "Activity ID" header as though it would survive the next export.
      render: (v, r) => (r.matchedOn === 'task_code' ? String(v) : `${v} (internal ID, no Activity ID)`)
    },
    { key: 'task_name', label: 'Name' },
    {
      key: 'pctDelta',
      label: 'Δ % Complete',
      render: v => fmtPct(Number(v))
    },
    {
      key: 'dateDelta',
      label: 'Δ Finish (cal days)',
      render: v => fmtDays(Number(v))
    }
  ];

  const currentOnly  = aTasks.size - matched;
  const baselineOnly = bTasks.size - matched;

  /**
   * Join project labels for disclosure, or say plainly that the file does not
   * name them. A label never keys a match.
   *
   * @param {string[]} projects
   * @returns {string}
   */
  function projectClause(projects) {
    const named = (projects || []).filter(p => p !== '');
    return named.length === 0 ? 'the export does not name the projects involved' : named.join(', ');
  }

  // Ambiguity disclosure, ABOVE the numbers.
  const ambiguityNotices = [];
  if (ambiguity.a.codeCount > 0) {
    ambiguityNotices.push(
      `${ambiguity.a.codeCount.toLocaleString()} Activity ID${ambiguity.a.codeCount === 1 ? ' is' : 's are'} ` +
      'repeated in the current export, so those rows are excluded from the comparison and the totals below ' +
      `cover only the unambiguous remainder. Repeated across: ${projectClause(ambiguity.a.projects)}.`
    );
  }
  if (ambiguity.b.codeCount > 0) {
    ambiguityNotices.push(
      `${ambiguity.b.codeCount.toLocaleString()} Activity ID${ambiguity.b.codeCount === 1 ? ' is' : 's are'} ` +
      'repeated in the baseline export, so those rows are excluded from the comparison and the totals below ' +
      `cover only the unambiguous remainder. Repeated across: ${projectClause(ambiguity.b.projects)}.`
    );
  }
  if (ambiguity.any) {
    ambiguityNotices.push(
      `${(aIdx.ambiguous + bIdx.ambiguous).toLocaleString()} activity row(s) are excluded on that basis ` +
      `(current ${aIdx.ambiguous.toLocaleString()}, baseline ${bIdx.ambiguous.toLocaleString()}). ` +
      'Nothing was merged and nothing was dropped: a repeated Activity ID cannot be matched one-to-one across ' +
      'two exports, and this section will not guess which row is which. Earned percentage, slip days and every ' +
      'bucket below are computed on the unambiguous remainder only.'
    );
  }

  const ambiguityCard = ambiguityNotices.length === 0 ? null : h('div', {
    class: 'lens-card',
    style: { border: '2px solid #B45309', background: '#FFFBEB' }
  }, [
    h('h3', { style: { color: '#B45309' } }, 'Read this before the numbers'),
    ...ambiguityNotices.map(t => h('p', { style: { color: '#0F2540' } }, t))
  ]);

  const elements = [
    h('h2', {}, 'Period Reporting'),
    ...(ambiguityCard ? [ambiguityCard] : []),

    // KPI row
    h('div', { class: 'kpi-grid' }, [
      kpiCard({
        title: 'Period span',
        big:   dataDateSpan + ' days',
        sub:   bDataDate ? bDataDate.slice(0, 10) + ' → ' + (aDataDate ? aDataDate.slice(0, 10) : '?') : 'No data dates'
      }),
      kpiCard({
        title: 'Earned this period',
        big:   (earnedPct >= 0 ? '+' : '') + earnedPct.toFixed(1) + '%',
        tone:  earnedPct > 0 ? 'green' : earnedPct < 0 ? 'red' : 'ink'
      }),
      kpiCard({
        title: 'Slipped activities',
        big:   slipped.length.toLocaleString(),
        tone:  slipped.length > 0 ? 'red' : 'ink'
      }),
      kpiCard({
        title: 'Accelerated activities',
        big:   accelerated.length.toLocaleString(),
        tone:  accelerated.length > 0 ? 'green' : 'ink'
      }),
      kpiCard({
        title: 'Completed this period',
        big:   completedThisPeriod.length.toLocaleString(),
        tone:  completedThisPeriod.length > 0 ? 'green' : 'ink'
      })
    ]),

    // Status-bucket summary card
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Activity status buckets'),
      h('ul', {}, [
        h('li', {}, 'Completed this period: ' + completedThisPeriod.length),
        h('li', {}, 'Started this period: '   + startedThisPeriod.length),
        h('li', {}, 'Slipped: '               + slipped.length),
        h('li', {}, 'Accelerated: '           + accelerated.length),
        h('li', {}, 'Unchanged: '             + unchanged.length)
      ]),
      h('p', {},
        `Every bucket total covers the ${matched.toLocaleString()} activities present, unambiguously, in both files: ` +
        `${completedThisPeriod.length} + ${startedThisPeriod.length} + ${slipped.length} + ${accelerated.length} + ` +
        `${unchanged.length} = ${matched.toLocaleString()}.`
      )
    ]),

    // The reconciliation is printed, not asserted.
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Reconciliation: every row accounted for'),
      h('p', {},
        `Current export: ${matched.toLocaleString()} compared + ${currentOnly.toLocaleString()} current-only + ` +
        `${aIdx.ambiguous.toLocaleString()} excluded as ambiguous + ${aIdx.noIdentity.toLocaleString()} with no ` +
        `Activity ID = ${aIdx.total.toLocaleString()} activity rows.`
      ),
      h('p', {},
        `Baseline export: ${matched.toLocaleString()} compared + ${baselineOnly.toLocaleString()} baseline-only + ` +
        `${bIdx.ambiguous.toLocaleString()} excluded as ambiguous + ${bIdx.noIdentity.toLocaleString()} with no ` +
        `Activity ID = ${bIdx.total.toLocaleString()} activity rows.`
      )
    ]),

    // Per-bucket tables
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Completed this period'),
      dataTable({ columns: TABLE_COLS, rows: completedThisPeriod, limit: 200, emptyMsg: 'No activities completed this period.' })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Started this period'),
      dataTable({ columns: TABLE_COLS, rows: startedThisPeriod, limit: 200, emptyMsg: 'No activities started this period.' })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Slipped activities'),
      dataTable({ columns: TABLE_COLS, rows: slipped, limit: 200, emptyMsg: 'No slipped activities.' })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Accelerated activities'),
      dataTable({ columns: TABLE_COLS, rows: accelerated, limit: 200, emptyMsg: 'No accelerated activities.' })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Unchanged activities'),
      dataTable({ columns: TABLE_COLS, rows: unchanged, limit: 200, emptyMsg: 'No unchanged activities.' })
    ])
  ];

  return h('div', { class: 'lens-section-content' }, elements);
}
