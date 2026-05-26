import { renderPlaceholder } from './_placeholder.js';
import { render as renderDashboard } from './dashboard.js';
import { render as renderSummary } from './summary.js';

function ph(title, group) {
  return ({ A, B }) => renderPlaceholder({ title, groupLabel: group });
}

export const SECTIONS = [
  // Overview
  { id: 'dashboard',       title: 'Executive Dashboard',  group: 'Overview',  render: renderDashboard },
  { id: 'summary',         title: 'Executive Summary',    group: 'Overview',  render: renderSummary },
  { id: 'compare-page',    title: 'How Lens compares',    group: 'Overview',  render: ph('How Lens compares', 'Overview') },

  // Schedule
  { id: 'viewer',          title: 'Schedule Viewer',      group: 'Schedule',  render: ph('Schedule Viewer', 'Schedule') },
  { id: 'quality',         title: 'Schedule Quality',     group: 'Schedule',  render: ph('Schedule Quality', 'Schedule') },
  { id: 'dcma',            title: 'DCMA Lite',            group: 'Schedule',  render: ph('DCMA Lite', 'Schedule') },
  { id: 'logic',           title: 'Logic Network',        group: 'Schedule',  render: ph('Logic Network', 'Schedule') },
  { id: 'constraints',     title: 'Constraints / Float',  group: 'Schedule',  render: ph('Constraints / Float', 'Schedule') },
  { id: 'codes',           title: 'Activity Codes',       group: 'Schedule',  render: ph('Activity Codes', 'Schedule') },
  { id: 'udf',             title: 'UDF Explorer',         group: 'Schedule',  render: ph('UDF Explorer', 'Schedule') },
  { id: 'resources',       title: 'Resources / Cost',     group: 'Schedule',  render: ph('Resources / Cost', 'Schedule') },
  { id: 'risk',            title: 'Risk Register',        group: 'Schedule',  render: ph('Risk Register', 'Schedule') },
  { id: 'calendar',        title: 'Calendar Viewer',      group: 'Schedule',  render: ph('Calendar Viewer', 'Schedule') },

  // Visual
  { id: 'gantt',           title: 'Gantt Chart',          group: 'Visual',    render: ph('Gantt Chart', 'Visual') },
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
