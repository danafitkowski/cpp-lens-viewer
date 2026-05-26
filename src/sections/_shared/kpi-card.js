import { h } from '../../lib/dom.js';

const TONE_COLORS = {
  ink:   '#1f3a5f',
  green: '#15803D',
  amber: '#B45309',
  red:   '#C8392F'
};

export function kpiCard({ title, big, sub, tone = 'ink' }) {
  const color = TONE_COLORS[tone] || TONE_COLORS.ink;
  const bigText = big == null || big === '' ? '—' : String(big);
  const children = [
    h('h3', { class: 'kpi-title' }, title),
    h('div', { class: 'kpi-big', style: { color, fontSize: '30px', fontWeight: '900' } }, bigText)
  ];
  if (sub) children.push(h('div', { class: 'kpi-sub' }, sub));
  return h('div', { class: 'lens-card kpi' }, children);
}
