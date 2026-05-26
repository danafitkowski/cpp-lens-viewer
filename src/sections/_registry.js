import { renderPlaceholder } from './_placeholder.js';
import { render as renderDashboard } from './dashboard.js';
import { render as renderSummary } from './summary.js';
import { render as renderComparePage } from './compare-page.js';
import { render as renderScheduleViewer } from './schedule-viewer.js';
import { render as renderQuality } from './schedule-quality.js';
import { render as renderDcma } from './dcma-lite.js';
import { render as renderLogic } from './logic-network.js';
import { render as renderConstraintsFloat } from './constraints-float.js';
import { render as renderActivityCodes } from './activity-codes.js';
import { render as renderUdfExplorer } from './udf-explorer.js';
import { render as renderResourcesCost } from './resources-cost.js';
import { render as renderRiskRegister } from './risk-register.js';
import { render as renderCalendarViewer } from './calendar-viewer.js';
import { render as renderGantt } from './gantt.js';

function ph(title, group) {
  return ({ A, B }) => renderPlaceholder({ title, groupLabel: group });
}

export const SECTIONS = [
  // Overview
  { id: 'dashboard',       title: 'Executive Dashboard',  group: 'Overview',  render: renderDashboard },
  { id: 'summary',         title: 'Executive Summary',    group: 'Overview',  render: renderSummary },
  { id: 'compare-page',    title: 'How Lens compares',    group: 'Overview',  render: renderComparePage },

  // Schedule
  { id: 'viewer',          title: 'Schedule Viewer',      group: 'Schedule',  render: renderScheduleViewer },
  { id: 'quality',         title: 'Schedule Quality',     group: 'Schedule',  render: renderQuality },
  { id: 'dcma',            title: 'DCMA Lite',            group: 'Schedule',  render: renderDcma },
  { id: 'logic',           title: 'Logic Network',        group: 'Schedule',  render: renderLogic },
  { id: 'constraints',     title: 'Constraints / Float',  group: 'Schedule',  render: renderConstraintsFloat },
  { id: 'codes',           title: 'Activity Codes',       group: 'Schedule',  render: renderActivityCodes },
  { id: 'udf',             title: 'UDF Explorer',         group: 'Schedule',  render: renderUdfExplorer },
  { id: 'resources',       title: 'Resources / Cost',     group: 'Schedule',  render: renderResourcesCost },
  { id: 'risk',            title: 'Risk Register',        group: 'Schedule',  render: renderRiskRegister },
  { id: 'calendar',        title: 'Calendar Viewer',      group: 'Schedule',  render: renderCalendarViewer },

  // Visual
  { id: 'gantt',           title: 'Gantt Chart',          group: 'Visual',    render: renderGantt },
  { id: 'wbs-organizer',   title: 'WBS Organizer',        group: 'Visual',    render: ph('WBS Organizer', 'Visual') },
  { id: 'wbs-rollup',      title: 'WBS Roll-up',          group: 'Visual',    render: ph('WBS Roll-up', 'Visual') },
  { id: 'distribution',    title: 'Distribution',         group: 'Visual',    render: ph('Distribution', 'Visual') },
  { id: 'evm',             title: 'EVM / S-Curves Lite',  group: 'Visual',    render: ph('EVM / S-Curves Lite', 'Visual') },
  { id: 'dashboard-creator', title: 'Dashboard Creator',  group: 'Visual',    render: ph('Dashboard Creator', 'Visual') },

  // Compare & Period
  { id: 'compare',         title: 'XER Comparison',       group: 'Compare & Period', render: ph('XER Comparison', 'Compare & Period') },
  { id: 'period',          title: 'Period Reporting',     group: 'Compare & Period', render: ph('Period Reporting', 'Compare & Period') },
  { id: 'narrative-flip',  title: 'Narrative Flip',       group: 'Compare & Period', render: ph('Narrative Flip', 'Compare & Period') },

  // CPP Forensic
  { id: 'path-explorer',   title: 'Path Explorer',        group: 'CPP Forensic',     render: ph('Path Explorer', 'CPP Forensic') },
  { id: 'lookahead',       title: '3-Week Lookahead',     group: 'CPP Forensic',     render: ph('3-Week Lookahead', 'CPP Forensic') },
  { id: 'half-step',       title: 'Half-Step XER',        group: 'CPP Forensic',     render: ph('Half-Step XER', 'CPP Forensic') },
  { id: 'deep-forensic',   title: 'Deep Forensic',        group: 'CPP Forensic',     render: ph('Deep Forensic', 'CPP Forensic') },

  // Tools
  { id: 'data-dictionary', title: 'Data Dictionary',      group: 'Tools',     render: ph('Data Dictionary', 'Tools') },
  { id: 'raw-tables',      title: 'Raw Tables',           group: 'Tools',     render: ph('Raw Tables', 'Tools') },
  { id: 'xer-utilities',   title: 'XER Utilities',        group: 'Tools',     render: ph('XER Utilities', 'Tools') }
];

export const GROUPS = ['Overview', 'Schedule', 'Visual', 'Compare & Period', 'CPP Forensic', 'Tools'];

export function findSection(id) {
  return SECTIONS.find(s => s.id === id);
}
