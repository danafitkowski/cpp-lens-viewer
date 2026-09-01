import { h } from '../lib/dom.js';

const FEATURES = [
  ['XER read + browse', 'yes', 'yes', 'yes'],
  ['DCMA Lite', 'yes', 'yes', 'yes'],
  ['Gantt + WBS', 'yes', 'yes', 'yes'],
  ['Two-XER compare', 'yes', 'yes', 'yes'],
  ['XER writer (round-trip)', 'premium', 'yes', 'yes'],
  ['Anonymizer', 'no', 'yes', 'yes'],
  ['Path Explorer (driver chain)', 'no', 'yes', 'yes'],
  ['Half-Step XER generator', 'no', 'yes', 'yes'],
  ['3-Week Lookahead', 'no', 'yes', 'yes'],
  ['Narrative-Flip detector', 'no', 'yes', 'yes'],
  ['MIP 3.3 windows analysis', 'no', 'no', 'yes'],
  ['MIP 3.7 TIA', 'no', 'no', 'yes'],
  ['MIP 3.8 collapsed as-built', 'no', 'no', 'yes'],
  ['Claim workbench', 'no', 'no', 'yes'],
  ['Monte Carlo SRA', 'no', 'no', 'yes']
];
// 'Claims-grade packaging' and 'Court-disclosure footers' were removed from
// this table on 2026-09-01: they are properties of a retained CPP
// engagement's deliverables, not of the free tools, and listing them under
// the free 'Lens + Forensic Engine' column contradicted the Terms of
// Service (free output is not a forensic opinion and is not for contested
// proceedings).

function cell(state) {
  const map = {
    yes:     { glyph: '✓', cls: 'cmp-yes', title: 'Included' },
    no:      { glyph: '—', cls: 'cmp-no',  title: 'Not included' },
    premium: { glyph: 'paid', cls: 'cmp-premium', title: 'Available in premium tier only' }
  };
  const s = map[state] || map.no;
  return h('td', { class: s.cls, title: s.title }, s.glyph);
}

export function render() {
  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'How Lens compares'),
    h('div', { class: 'lens-card' }, [
      h('p', {}, 'Transparent positioning. Lens is free; the Forensic Engine is rate-limited free for public use and requires no signup for casual analyses.'),
      h('table', { class: 'lens-table compare-table' }, [
        h('thead', {}, h('tr', {}, [
          h('th', {}, 'Feature'),
          h('th', {}, 'Other browser viewers'),
          h('th', {}, 'Lens (free)'),
          h('th', {}, 'Lens + Forensic Engine')
        ])),
        h('tbody', {}, FEATURES.map(([feat, ...states]) => h('tr', {}, [
          h('td', {}, feat),
          cell(states[0]), cell(states[1]), cell(states[2])
        ])))
      ]),
      h('p', { class: 'compare-footer' }, [
        'For engagement-grade forensic work or enterprise rates, ',
        h('a', { href: 'https://criticalpathpartners.ca/connect.html' }, 'get in touch'),
        '.'
      ])
    ])
  ]);
}
