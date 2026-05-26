// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { svgGantt } from '../../src/sections/_shared/svg-gantt.js';

describe('svgGantt', () => {
  it('renders one bar per activity', () => {
    const acts = [
      { task_id: '1', task_name: 'A', start: new Date('2024-01-15'), end: new Date('2024-01-19'), critical: false },
      { task_id: '2', task_name: 'B', start: new Date('2024-01-22'), end: new Date('2024-01-31'), critical: true }
    ];
    const el = svgGantt({ activities: acts });
    expect(el.tagName.toLowerCase()).toBe('svg');
    expect(el.querySelectorAll('rect.gantt-bar').length).toBe(2);
  });

  it('uses the critical color for critical activities', () => {
    const acts = [{ task_id: '1', task_name: 'A', start: new Date('2024-01-15'), end: new Date('2024-01-19'), critical: true }];
    const el = svgGantt({ activities: acts });
    expect(el.querySelector('rect.gantt-bar').getAttribute('fill').toLowerCase()).toBe('#c8392f');
  });

  it('renders a baseline bar when baseline dates are provided', () => {
    const acts = [{ task_id: '1', task_name: 'A',
      start: new Date('2024-01-15'), end: new Date('2024-01-19'),
      baseline_start: new Date('2024-01-10'), baseline_end: new Date('2024-01-14') }];
    const el = svgGantt({ activities: acts });
    expect(el.querySelectorAll('rect.gantt-baseline').length).toBe(1);
  });

  it('renders empty-state when no activities have dates', () => {
    const el = svgGantt({ activities: [{ task_id: '1', task_name: 'No dates' }] });
    expect(el.tagName.toLowerCase()).toBe('div');
    expect(el.textContent).toMatch(/no activities/i);
  });

  it('renders empty-state for empty array', () => {
    const el = svgGantt({ activities: [] });
    expect(el.tagName.toLowerCase()).toBe('div');
    expect(el.textContent).toMatch(/no activities/i);
  });
});
