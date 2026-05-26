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
import { render as renderWbsOrganizer } from './wbs-organizer.js';
import { render as renderWbsRollup } from './wbs-rollup.js';
import { render as renderDistribution } from './distribution.js';
import { render as renderEvm } from './evm.js';
import { render as renderDashboardCreator } from './dashboard-creator.js';
import { render as renderXerComparison } from './xer-comparison.js';
import { render as renderPeriodReporting } from './period-reporting.js';
import { render as renderNarrativeFlip } from './narrative-flip.js';
import { render as renderPathExplorer } from './path-explorer.js';
import { render as renderLookahead } from './lookahead.js';
import { render as renderHalfStep } from './half-step.js';
import { render as renderDeepForensic } from './deep-forensic.js';
import { render as renderDataDictionary } from './data-dictionary.js';
import { render as renderRawTables } from './raw-tables.js';
import { render as renderXerUtilities } from './xer-utilities.js';

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
  { id: 'wbs-organizer',   title: 'WBS Organizer',        group: 'Visual',    render: renderWbsOrganizer },
  { id: 'wbs-rollup',      title: 'WBS Roll-up',          group: 'Visual',    render: renderWbsRollup },
  { id: 'distribution',    title: 'Distribution',         group: 'Visual',    render: renderDistribution },
  { id: 'evm',             title: 'EVM / S-Curves Lite',  group: 'Visual',    render: renderEvm },
  { id: 'dashboard-creator', title: 'Dashboard Creator',  group: 'Visual',    render: renderDashboardCreator },

  // Compare & Period
  { id: 'compare',         title: 'XER Comparison',       group: 'Compare & Period', render: renderXerComparison },
  { id: 'period',          title: 'Period Reporting',     group: 'Compare & Period', render: renderPeriodReporting },
  { id: 'narrative-flip',  title: 'Narrative Flip',       group: 'Compare & Period', render: renderNarrativeFlip },

  // CPP Forensic
  { id: 'path-explorer',   title: 'Path Explorer',        group: 'CPP Forensic',     render: renderPathExplorer },
  { id: 'lookahead',       title: '3-Week Lookahead',     group: 'CPP Forensic',     render: renderLookahead },
  { id: 'half-step',       title: 'Half-Step XER',        group: 'CPP Forensic',     render: renderHalfStep },
  { id: 'deep-forensic',   title: 'Deep Forensic',        group: 'CPP Forensic',     render: renderDeepForensic },

  // Tools
  { id: 'data-dictionary', title: 'Data Dictionary',      group: 'Tools',     render: renderDataDictionary },
  { id: 'raw-tables',      title: 'Raw Tables',           group: 'Tools',     render: renderRawTables },
  { id: 'xer-utilities',   title: 'XER Utilities',        group: 'Tools',     render: renderXerUtilities }
];

export const GROUPS = ['Overview', 'Schedule', 'Visual', 'Compare & Period', 'CPP Forensic', 'Tools'];

export function findSection(id) {
  return SECTIONS.find(s => s.id === id);
}
