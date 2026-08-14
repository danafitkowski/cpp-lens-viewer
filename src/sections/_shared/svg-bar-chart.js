import { h } from '../../lib/dom.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, children = []) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children) el.appendChild(c);
  return el;
}

export function svgBarChart({ data, width = 600, height = 240, tone = '#0F2540' }) {
  if (!data || data.length === 0) return h('div', { class: 'lens-empty' }, 'No data.');
  const max = Math.max(...data.map(d => Number(d.value) || 0), 1);
  const padL = 40, padB = 40, padT = 10, padR = 10;
  const w = width - padL - padR;
  const hh = height - padT - padB;
  const bw = w / data.length;
  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}` });

  // gridlines + y-axis labels
  for (let i = 0; i <= 4; i++) {
    const y = padT + (hh * (1 - i / 4));
    root.appendChild(svg('line', { x1: padL, x2: width - padR, y1: y, y2: y, stroke: '#E2E8F0' }));
    const t = svg('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end', 'font-size': '10', fill: '#5A6675' });
    t.appendChild(document.createTextNode(String(Math.round(max * i / 4))));
    root.appendChild(t);
  }

  // bars + x-axis labels
  data.forEach((d, i) => {
    const value = Number(d.value) || 0;
    const bh = (value / max) * hh;
    const x = padL + i * bw + 4;
    const y = padT + (hh - bh);
    root.appendChild(svg('rect', { x, y, width: Math.max(bw - 8, 1), height: bh, fill: tone, rx: 3 }));
    const t = svg('text', { x: x + (bw - 8) / 2, y: height - padB + 14, 'text-anchor': 'middle', 'font-size': '10', fill: '#5A6675' });
    t.appendChild(document.createTextNode(String(d.label)));
    root.appendChild(t);
  });

  return root;
}
