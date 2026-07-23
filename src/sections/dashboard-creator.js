import { h, clear } from '../lib/dom.js';
import { getTable } from '@criticalpathpartners/lens-parser';
import { kpiCard } from './_shared/kpi-card.js';
import { prefsStore } from '../state/prefs.js';

// ---------------------------------------------------------------------------
// Tile catalog
// ---------------------------------------------------------------------------
const TILES = [
  { id: 'total-activities',   title: 'Total Activities',     compute: (A) => getTable(A, 'TASK').length.toLocaleString() },
  { id: 'pct-complete',       title: 'Percent Complete',     compute: (A) => { const t = getTable(A,'TASK').filter(x=>!['TT_LOE','TT_WBS'].includes(x.task_type||'')); const c = t.filter(x=>x.status_code==='TK_Complete').length; return t.length ? Math.round(c/t.length*100)+'%' : '0%'; } },
  { id: 'critical-pct',       title: 'Critical %',           compute: (A) => { const t = getTable(A,'TASK').filter(x=>!['TT_LOE','TT_WBS'].includes(x.task_type||'')); const c = t.filter(x=>parseFloat(x.total_float_hr_cnt)<=0).length; return t.length ? Math.round(c/t.length*100)+'%' : '0%'; } },
  { id: 'rel-count',          title: 'Relationships',        compute: (A) => getTable(A, 'TASKPRED').length.toLocaleString() },
  { id: 'resource-count',     title: 'Resources',            compute: (A) => getTable(A, 'RSRC').length.toLocaleString() },
  { id: 'assignment-count',   title: 'Assignments',          compute: (A) => getTable(A, 'TASKRSRC').length.toLocaleString() },
  { id: 'calendar-count',     title: 'Calendars',            compute: (A) => getTable(A, 'CALENDAR').length.toString() },
  { id: 'milestone-count',    title: 'Milestones',           compute: (A) => getTable(A, 'TASK').filter(x => ['TT_Mile','TT_FinMile'].includes(x.task_type||'')).length.toString() },
  { id: 'data-date',          title: 'Data Date',            compute: (A) => (getTable(A,'PROJECT')[0]?.last_recalc_date || '').slice(0,10) || '—' },
  // scd_end_date = CPM-calculated finish; plan_end_date = optional must-finish
  // constraint, frequently blank. Without this fallback the tile shows '—' on
  // most real schedules.
  { id: 'project-finish',     title: 'Project Finish',       compute: (A) => { const p = getTable(A,'PROJECT')[0]; return ((p?.scd_end_date || p?.plan_end_date || '') || '').slice(0,10) || '—'; } },
  { id: 'wbs-count',          title: 'WBS Nodes',            compute: (A) => getTable(A, 'PROJWBS').length.toString() },
  { id: 'project-name',       title: 'Project',              compute: (A) => getTable(A,'PROJECT')[0]?.proj_short_name || '—' }
];

const TILE_MAP = new Map(TILES.map(t => [t.id, t]));

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------
function renderCatalog(A, layoutIds, onAdd) {
  const catalog = h('div', { class: 'lens-dash-catalog' });
  const inCanvas = new Set(layoutIds);

  for (const tile of TILES) {
    const already = inCanvas.has(tile.id);
    const btn = h('button', {
      type: 'button',
      disabled: already ? 'true' : null,
      'data-tile-id': tile.id
    }, 'Add');

    if (!already) {
      btn.addEventListener('click', () => onAdd(tile.id));
    }

    const row = h('div', { class: 'row' }, [
      h('span', { class: 'name' }, tile.title),
      btn
    ]);
    catalog.appendChild(row);
  }

  return catalog;
}

function renderCanvas(A, layoutIds, onRemove, onDrop) {
  const canvas = h('div', { class: 'lens-dash-canvas' });
  canvas.appendChild(h('h3', {}, 'Your dashboard'));

  if (layoutIds.length === 0) {
    canvas.appendChild(h('div', { class: 'lens-empty' }, 'Add tiles from the catalog to build your dashboard.'));
    return canvas;
  }

  const grid = h('div', { class: 'grid' });
  let missingCount = 0;

  for (let i = 0; i < layoutIds.length; i++) {
    const id   = layoutIds[i];
    const tile = TILE_MAP.get(id);
    if (!tile) { missingCount++; continue; }

    const value = A ? tile.compute(A) : '—';

    const closeBtn = h('button', { class: 'close', type: 'button', title: 'Remove' }, '×');
    closeBtn.addEventListener('click', () => onRemove(id));

    const kpi = kpiCard({ title: tile.title, big: value });

    const wrapper = h('div', {
      class: 'tile',
      draggable: 'true',
      'data-tile-id': id,
      'data-index': String(i)
    }, [kpi, closeBtn]);

    wrapper.addEventListener('dragstart', (e) => {
      wrapper.classList.add('dragging');
      e.dataTransfer.setData('text/plain', String(i));
      e.dataTransfer.effectAllowed = 'move';
    });

    wrapper.addEventListener('dragend', () => {
      wrapper.classList.remove('dragging');
    });

    wrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      const srcIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const tgtIdx = i;
      if (srcIdx !== tgtIdx && !isNaN(srcIdx)) {
        onDrop(srcIdx, tgtIdx);
      }
    });

    grid.appendChild(wrapper);
  }

  canvas.appendChild(grid);

  if (missingCount > 0) {
    const plural = missingCount === 1 ? '' : 's';
    canvas.appendChild(h('div', { class: 'lens-table-foot' },
      `${missingCount} saved tile${plural} ${missingCount === 1 ? 'is' : 'are'} no longer available and ${missingCount === 1 ? 'was' : 'were'} skipped.`
    ));
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------
export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Dashboard Creator'),
      h('div', { class: 'lens-card' }, [h('p', {}, 'No XER loaded.')])
    ]);
  }

  const root = h('div', { class: 'lens-section-content' });
  root.appendChild(h('h2', {}, 'Dashboard Creator'));

  const grid = h('div', { class: 'lens-dash-grid' });

  const catalogSlot = h('div');
  const canvasSlot  = h('div');

  function rebuildPanes() {
    const prefs    = prefsStore.get();
    const layoutIds = Array.isArray(prefs.dashboardLayout) ? prefs.dashboardLayout : [];

    // Catalog pane
    const catalogTitle = h('div', { style: { padding: '10px 12px 4px', fontWeight: '700', fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' } }, 'Available tiles');
    const catalogBody  = renderCatalog(A, layoutIds, (id) => {
      const p = prefsStore.get();
      const lay = Array.isArray(p.dashboardLayout) ? p.dashboardLayout : [];
      if (!lay.includes(id)) {
        prefsStore.set({ ...p, dashboardLayout: [...lay, id] });
        rebuildPanes();
      }
    });

    clear(catalogSlot);
    const catalogWrap = h('div', { class: 'lens-dash-catalog' });
    catalogWrap.appendChild(catalogTitle);
    // Append catalog rows from renderCatalog's children
    while (catalogBody.firstChild) catalogWrap.appendChild(catalogBody.firstChild);
    catalogSlot.appendChild(catalogWrap);

    // Canvas pane
    clear(canvasSlot);
    canvasSlot.appendChild(renderCanvas(A, layoutIds,
      // onRemove
      (id) => {
        const p = prefsStore.get();
        const lay = Array.isArray(p.dashboardLayout) ? p.dashboardLayout : [];
        prefsStore.set({ ...p, dashboardLayout: lay.filter(x => x !== id) });
        rebuildPanes();
      },
      // onDrop (srcIdx, tgtIdx)
      (srcIdx, tgtIdx) => {
        const p = prefsStore.get();
        const lay = [...(Array.isArray(p.dashboardLayout) ? p.dashboardLayout : [])];
        const [item] = lay.splice(srcIdx, 1);
        lay.splice(tgtIdx, 0, item);
        prefsStore.set({ ...p, dashboardLayout: lay });
        rebuildPanes();
      }
    ));
  }

  rebuildPanes();

  grid.appendChild(catalogSlot);
  grid.appendChild(canvasSlot);
  root.appendChild(grid);

  return root;
}
