import { h } from '../../lib/dom.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, children = []) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children) el.appendChild(c);
  return el;
}

const ROW_H = 24;
const NAME_W = 220;
const CRITICAL_COLOR = '#C8392F';
const NORMAL_COLOR   = '#0F5F99';
const BASELINE_COLOR = '#94A3B8';

export function svgGantt({ activities, width = 980 }) {
  if (!activities || activities.length === 0) return h('div', { class: 'lens-empty' }, 'No activities to chart.');
  const rows = activities.filter(a => a.start && a.end);
  if (rows.length === 0) return h('div', { class: 'lens-empty' }, 'No activities have dates.');

  const allStarts = rows.flatMap(r => [r.start, r.baseline_start].filter(Boolean));
  const allEnds   = rows.flatMap(r => [r.end,   r.baseline_end].filter(Boolean));
  const minD = new Date(Math.min(...allStarts.map(d => +d)));
  const maxD = new Date(Math.max(...allEnds.map(d => +d)));
  const span = Math.max(+maxD - +minD, 1);
  const timelineW = width - NAME_W - 20;
  const xs = (d) => NAME_W + 10 + timelineW * ((+d - +minD) / span);
  const totalH = rows.length * ROW_H + 30;

  const root = svg('svg', { width, height: totalH, viewBox: `0 0 ${width} ${totalH}`, class: 'lens-gantt' });

  rows.forEach((a, i) => {
    const y = i * ROW_H + 20;

    const t = svg('text', { x: 8, y: y + 14, 'font-size': '11', fill: '#0F2540' });
    t.appendChild(document.createTextNode(String((a.task_name || a.task_id || '')).slice(0, 32)));
    root.appendChild(t);

    if (a.baseline_start && a.baseline_end) {
      const bx = xs(a.baseline_start);
      const bw = Math.max(xs(a.baseline_end) - bx, 2);
      root.appendChild(svg('rect', { class: 'gantt-baseline', x: bx, y: y + 16, width: bw, height: 4, fill: BASELINE_COLOR, rx: 1 }));
    }

    const x = xs(a.start);
    const w = Math.max(xs(a.end) - x, 2);
    root.appendChild(svg('rect', { class: 'gantt-bar', x, y: y + 4, width: w, height: 12, fill: a.critical ? CRITICAL_COLOR : NORMAL_COLOR, rx: 2 }));
  });

  return root;
}
