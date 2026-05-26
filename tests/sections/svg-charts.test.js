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
});
