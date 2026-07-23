import { h } from '../../lib/dom.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, children = []) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children) el.appendChild(c);
  return el;
}

export function svgLineChart({ series, width = 700, height = 280 }) {
  if (!series || series.length === 0) return h('div', { class: 'lens-empty' }, 'No data.');
  const allY = series.flatMap(s => s.points.map(p => Number(p.y) || 0));
  const allX = series.flatMap(s => s.points.map(p => Number(p.x) || 0));
  // allX are epoch-millisecond dates for real series — splicing a literal 0 into
  // Math.min(...allX, 0) always wins the min (0 < any post-1970 timestamp), which
  // forced the domain to [1970, maxX] and crushed real multi-month spans into a
  // sliver of a pixel at the right edge. Only fall back to 0/1 when there's no data.
  const minX = allX.length ? Math.min(...allX) : 0;
  const maxX = allX.length ? Math.max(...allX) : 1;
  const maxY = Math.max(...allY, 1);
  const padL = 50, padB = 30, padT = 10, padR = 110;
  const w = width - padL - padR;
  const hh = height - padT - padB;
  const xs = (x) => padL + (w * ((Number(x) - minX) / (maxX - minX || 1)));
  const ys = (y) => padT + hh - (hh * ((Number(y) || 0) / (maxY || 1)));

  const root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}` });

  // gridlines + y-axis
  for (let i = 0; i <= 4; i++) {
    const y = padT + (hh * (1 - i / 4));
    root.appendChild(svg('line', { x1: padL, x2: width - padR, y1: y, y2: y, stroke: '#E2E8F0' }));
    const t = svg('text', { x: padL - 6, y: y + 3, 'text-anchor': 'end', 'font-size': '10', fill: '#6B7A8F' });
    t.appendChild(document.createTextNode(String(Math.round(maxY * i / 4))));
    root.appendChild(t);
  }

  // series paths + legend
  series.forEach((s, idx) => {
    const d = s.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(p.x)} ${ys(p.y)}`)
      .join(' ');
    root.appendChild(svg('path', { d, fill: 'none', stroke: s.color, 'stroke-width': '2' }));
    const t = svg('text', { x: width - padR + 8, y: padT + 14 + idx * 16, 'font-size': '11', fill: s.color, 'font-weight': '700' });
    t.appendChild(document.createTextNode(s.label));
    root.appendChild(t);
  });

  return root;
}
