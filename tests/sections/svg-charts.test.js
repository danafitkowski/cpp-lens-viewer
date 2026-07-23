// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { svgBarChart } from '../../src/sections/_shared/svg-bar-chart.js';
import { svgLineChart } from '../../src/sections/_shared/svg-line-chart.js';

describe('svgBarChart', () => {
  it('renders one rect per data point', () => {
    const el = svgBarChart({ data: [{ label: 'A', value: 5 }, { label: 'B', value: 10 }, { label: 'C', value: 7 }] });
    expect(el.tagName.toLowerCase()).toBe('svg');
    expect(el.querySelectorAll('rect').length).toBe(3);
  });

  it('emits an x-axis label for each data point', () => {
    const el = svgBarChart({ data: [{ label: 'X1', value: 1 }, { label: 'X2', value: 2 }] });
    const labels = [...el.querySelectorAll('text')].map(t => t.textContent);
    expect(labels).toContain('X1');
    expect(labels).toContain('X2');
  });

  it('returns empty-state div for empty data', () => {
    const el = svgBarChart({ data: [] });
    expect(el.tagName.toLowerCase()).toBe('div');
    expect(el.textContent).toMatch(/no data/i);
  });

  it('uses tone color on bars when supplied', () => {
    const el = svgBarChart({ data: [{ label: 'A', value: 1 }], tone: '#C8392F' });
    expect(el.querySelector('rect').getAttribute('fill').toLowerCase()).toBe('#c8392f');
  });
});

describe('svgLineChart', () => {
  it('renders one path per series', () => {
    const series = [
      { label: 'Planned', color: '#0F5F99', points: [{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 12 }] },
      { label: 'Actual',  color: '#15803D', points: [{ x: 0, y: 0 }, { x: 1, y: 4 }, { x: 2, y: 9 }] }
    ];
    const el = svgLineChart({ series });
    expect(el.tagName.toLowerCase()).toBe('svg');
    expect(el.querySelectorAll('path').length).toBe(2);
  });

  it('renders a legend entry per series', () => {
    const series = [
      { label: 'Planned', color: '#0F5F99', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { label: 'Actual', color: '#15803D', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }
    ];
    const el = svgLineChart({ series });
    const legendTexts = [...el.querySelectorAll('text')].map(t => t.textContent);
    expect(legendTexts).toContain('Planned');
    expect(legendTexts).toContain('Actual');
  });

  it('returns empty-state div for empty series', () => {
    const el = svgLineChart({ series: [] });
    expect(el.tagName.toLowerCase()).toBe('div');
    expect(el.textContent).toMatch(/no data/i);
  });

  it('spreads real calendar-date x-values across the plot width instead of crushing them against the right edge', () => {
    // Regression for a real bug: minX was computed as Math.min(...allX, 0), and since
    // allX are epoch-millisecond dates (huge positive numbers), splicing a literal 0
    // into the min() call always won the min, forcing the domain to [1970, maxX] no
    // matter what the real date range was. A 2026 project's whole multi-month span
    // then collapsed into a sliver of a pixel at the far right of the chart — this is
    // exactly what a user reported as "no S-curve showing" on a real schedule.
    const day = 24 * 60 * 60 * 1000;
    const start = new Date('2026-07-23T00:00:00Z').getTime();
    const end = new Date('2026-12-04T00:00:00Z').getTime(); // ~4.5 months later
    const series = [{
      label: 'Planned',
      color: '#0F5F99',
      points: [
        { x: start, y: 1 },
        { x: start + 30 * day, y: 5 },
        { x: end, y: 16 }
      ]
    }];
    const el = svgLineChart({ series, width: 740, height: 300 });
    const d = el.querySelector('path').getAttribute('d');
    const xCoords = [...d.matchAll(/[ML]\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
    const plotWidth = xCoords[xCoords.length - 1] - xCoords[0];
    // Plot area is width(740) - padL(50) - padR(110) = 580px. The first and last
    // points must span a meaningful fraction of that — not be within a few px of
    // each other at the right edge.
    expect(plotWidth).toBeGreaterThan(400);
  });
});
