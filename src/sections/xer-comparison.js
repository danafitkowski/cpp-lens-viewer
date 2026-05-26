import { h } from '../lib/dom.js';
import { diffModels } from './_shared/diff-models.js';
import { kpiCard } from './_shared/kpi-card.js';
import { dataTable } from './_shared/data-table.js';

export function render({ A, B }) {
  if (!A || !B) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'XER Comparison'),
      h('div', { class: 'lens-card' }, [
        h('p', {}, 'Load two XERs (current + previous/baseline) to compare. The diff appears here.')
      ])
    ]);
  }

  const d = diffModels(A, B);
  const { counts } = d;

  const elements = [
    h('h2', {}, 'XER Comparison'),
    h('div', { class: 'kpi-grid' }, [
      kpiCard({
        title: 'Activities added',
        big: counts.tasksAdded.toLocaleString(),
        tone: counts.tasksAdded > 0 ? 'green' : 'ink'
      }),
      kpiCard({
        title: 'Activities deleted',
        big: counts.tasksDeleted.toLocaleString(),
        tone: counts.tasksDeleted > 0 ? 'red' : 'ink'
      }),
      kpiCard({
        title: 'Activities changed',
        big: counts.tasksChanged.toLocaleString(),
        tone: counts.tasksChanged > 0 ? 'amber' : 'ink'
      }),
      kpiCard({
        title: 'Relationships +/−',
        big: `+${counts.relsAdded} / −${counts.relsDeleted}`
      })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Added activities'),
      dataTable({
        columns: [
          { key: 'task_id', label: 'ID' },
          { key: 'task_code', label: 'Code' },
          { key: 'task_name', label: 'Name' }
        ],
        rows: d.tasks.added.map(t => ({
          task_id: t.task_id || '',
          task_code: t.task_code || '',
          task_name: t.task_name || ''
        })),
        limit: 200,
        emptyMsg: 'No added activities.'
      })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Deleted activities'),
      dataTable({
        columns: [
          { key: 'task_id', label: 'ID' },
          { key: 'task_code', label: 'Code' },
          { key: 'task_name', label: 'Name' }
        ],
        rows: d.tasks.deleted.map(t => ({
          task_id: t.task_id || '',
          task_code: t.task_code || '',
          task_name: t.task_name || ''
        })),
        limit: 200,
        emptyMsg: 'No deleted activities.'
      })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Field changes'),
      dataTable({
        columns: [
          { key: 'task_id',   label: 'ID' },
          { key: 'task_name', label: 'Name' },
          { key: 'field',     label: 'Field' },
          { key: 'before',    label: 'Before', render: v => (typeof v === 'string' ? v.slice(0, 16) : String(v == null ? '' : v)) },
          { key: 'after',     label: 'After',  render: v => (typeof v === 'string' ? v.slice(0, 16) : String(v == null ? '' : v)) },
          { key: 'daysDelta', label: 'Δ (cal days)', render: v => v == null ? '' : (v > 0 ? '+' : '') + v }
        ],
        rows: d.tasks.changed,
        limit: 500,
        emptyMsg: 'No field changes.'
      })
    ]),
    h('div', { class: 'lens-card' }, [
      h('h3', {}, 'Relationship changes'),
      dataTable({
        columns: [
          { key: 'pred_task_id', label: 'Predecessor' },
          { key: 'task_id',      label: 'Successor' },
          { key: 'pred_type',    label: 'Type' },
          { key: 'lag_hr_cnt',   label: 'Lag (hr)' },
          { key: 'change',       label: 'Change' }
        ],
        rows: [
          ...d.relationships.added.map(r => ({ ...r, change: 'added' })),
          ...d.relationships.deleted.map(r => ({ ...r, change: 'deleted' }))
        ],
        limit: 200,
        emptyMsg: 'No relationship changes.'
      })
    ])
  ];

  return h('div', { class: 'lens-section-content' }, elements);
}
