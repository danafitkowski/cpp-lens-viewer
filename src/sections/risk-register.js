import { h } from '../lib/dom.js';
import { getTable, buildPredecessorMap } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

const LOE_WBS = new Set(['TT_LOE', 'TT_WBS']);
const MANDATORY_CSTR = new Set(['CS_MANDSTART', 'CS_MANDFIN']);

const SEVERITY_ORDER = { high: 0, med: 1, low: 2 };

// CSS for .lens-badge if not already in shell.css
const BADGE_CSS = `
.lens-badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 800; }
.lens-badge-red { background: #FEE2E2; color: #991B1B; }
.lens-badge-amber { background: #FEF3C7; color: #92400E; }
.lens-badge-grey { background: #F1F5F9; color: #475569; }
.lens-badge-green { background: #DCFCE7; color: #166534; }
`;

let _badgeStyleInjected = false;
function ensureBadgeStyles() {
  if (_badgeStyleInjected) return;
  if (typeof document === 'undefined') return;
  // Check if already present
  const sheets = Array.from(document.styleSheets);
  for (const sheet of sheets) {
    try {
      const rules = Array.from(sheet.cssRules || []);
      if (rules.some(r => r.selectorText === '.lens-badge')) return;
    } catch {
      // cross-origin sheet — skip
    }
  }
  const style = document.createElement('style');
  style.textContent = BADGE_CSS;
  document.head.appendChild(style);
  _badgeStyleInjected = true;
}

function severityBadge(severity) {
  const toneMap = { high: 'red', med: 'amber', low: 'grey' };
  const labelMap = { high: 'HIGH', med: 'MED', low: 'LOW' };
  const tone  = toneMap[severity]  || 'grey';
  const label = labelMap[severity] || severity.toUpperCase();
  return h('span', { class: `lens-badge lens-badge-${tone}` }, label);
}

function computeRisks(A) {
  const tasks    = getTable(A, 'TASK');
  const taskrsrc = getTable(A, 'TASKRSRC');
  const projects = getTable(A, 'PROJECT');
  const proj     = projects[0] || {};

  const { successors } = buildPredecessorMap(A);

  // Build set of task_ids that have TASKRSRC entries
  const tasksWithRsrc = new Set(taskrsrc.map(tr => tr.task_id || '').filter(Boolean));

  // last_recalc_date from PROJECT (ISO date prefix)
  const recalcDateStr = (proj.last_recalc_date || '').slice(0, 10);
  const recalcDate = recalcDateStr ? new Date(recalcDateStr) : null;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const risks = [];

  for (const t of tasks) {
    if (LOE_WBS.has(t.task_type)) continue;

    const taskId   = t.task_id   || '';
    const taskCode = t.task_code || '';
    const taskName = t.task_name || '';

    // Rule 1: Negative float (high)
    const floatHr = parseFloat(t.total_float_hr_cnt);
    if (!isNaN(floatHr) && floatHr < 0) {
      risks.push({
        severity: 'high',
        rule: 'Negative float',
        activity_code: taskCode,
        activity_name: taskName,
        detail: 'Already late — total float is negative.'
      });
      continue; // priority order — first match wins
    }

    // Rule 2: Long duration (med)
    const durationHr = parseFloat(t.target_drtn_hr_cnt);
    if (!isNaN(durationHr) && durationHr > 40 * 8) {
      risks.push({
        severity: 'med',
        rule: 'Long duration',
        activity_code: taskCode,
        activity_name: taskName,
        detail: 'Duration > 40 working days — review for hammock-style summary task.'
      });
      continue;
    }

    // Rule 3: No resources (med)
    if (t.task_type === 'TT_Task' && !tasksWithRsrc.has(taskId)) {
      risks.push({
        severity: 'med',
        rule: 'No resources',
        activity_code: taskCode,
        activity_name: taskName,
        detail: 'Task-dependent activity has no resource assignments.'
      });
      continue;
    }

    // Rule 4: Mandatory constraint within 30 days (high)
    if (MANDATORY_CSTR.has(t.cstr_type)) {
      const cstrDateStr = (t.cstr_date || '').slice(0, 10);
      if (cstrDateStr && recalcDate) {
        const cstrDate = new Date(cstrDateStr);
        const diff = Math.abs(cstrDate.getTime() - recalcDate.getTime());
        if (diff <= thirtyDaysMs) {
          risks.push({
            severity: 'high',
            rule: 'Mandatory constraint within 30 days',
            activity_code: taskCode,
            activity_name: taskName,
            detail: 'Mandatory constraint within 30-day window.'
          });
          continue;
        }
      }
    }

    // Rule 5: Open ends (low) — no successors, excluding milestones
    const succs = successors[taskId];
    const hasSuccessors = succs && succs.length > 0;
    const isMilestone = t.task_type === 'TT_Mile' || t.task_type === 'TT_FinMile';
    if (!hasSuccessors && !isMilestone) {
      risks.push({
        severity: 'low',
        rule: 'Open ends',
        activity_code: taskCode,
        activity_name: taskName,
        detail: 'Open-ended logic.'
      });
      continue;
    }

    // Rule 6: Started but not progressing (low)
    const hasStart = !!(t.act_start_date || t.target_start_date);
    const actStart = t.act_start_date;
    const physPct  = t.phys_complete_pct;
    if (actStart && (physPct === '0' || physPct === 0)) {
      risks.push({
        severity: 'low',
        rule: 'Started but not progressing',
        activity_code: taskCode,
        activity_name: taskName,
        detail: 'Started but no physical progress recorded.'
      });
    }
  }

  // Sort by severity then activity_code
  risks.sort((a, b) => {
    const so = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (so !== 0) return so;
    return a.activity_code.localeCompare(b.activity_code);
  });

  // No truncation — return every heuristic flag so the Total/High/Med/Low
  // KPIs and the table enumerate the full set (Dana's no-truncation rule).
  return risks;
}

const RISK_COLS = [
  {
    key: 'severity',
    label: 'Severity',
    render: (v) => severityBadge(v)
  },
  { key: 'rule',          label: 'Rule' },
  { key: 'activity_code', label: 'Activity' },
  { key: 'detail',        label: 'Detail' }
];

export function render({ A, B }) {
  ensureBadgeStyles();

  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Risk Register'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const risks = computeRisks(A);

  const highCount = risks.filter(r => r.severity === 'high').length;
  const medCount  = risks.filter(r => r.severity === 'med').length;
  const lowCount  = risks.filter(r => r.severity === 'low').length;

  const kpis = [
    kpiCard({ title: 'High Risks',   big: highCount,       sub: 'severity = high',  tone: highCount > 0  ? 'red'   : 'green' }),
    kpiCard({ title: 'Medium Risks', big: medCount,         sub: 'severity = med',   tone: medCount  > 0  ? 'amber' : 'green' }),
    kpiCard({ title: 'Low Risks',    big: lowCount,         sub: 'severity = low',   tone: 'ink' }),
    kpiCard({ title: 'Total Risks',  big: risks.length,     sub: 'all heuristic flags', tone: risks.length > 0 ? 'amber' : 'green' })
  ];

  const riskCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Risk register'),
    dataTable({ columns: RISK_COLS, rows: risks, emptyMsg: 'No risks flagged.' })
  ]);

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Risk Register'),
    h('div', { class: 'kpi-grid' }, kpis),
    riskCard
  ]);
}
