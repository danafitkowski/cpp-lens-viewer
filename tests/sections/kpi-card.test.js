// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { kpiCard } from '../../src/sections/_shared/kpi-card.js';

describe('kpiCard', () => {
  it('renders title + big value + sub text', () => {
    const el = kpiCard({ title: 'Activities', big: '1,234', sub: 'in scope' });
    expect(el.textContent).toContain('Activities');
    expect(el.textContent).toContain('1,234');
    expect(el.textContent).toContain('in scope');
  });

  it('omits sub when not provided', () => {
    const el = kpiCard({ title: 'X', big: '42' });
    expect(el.textContent).toContain('X');
    expect(el.textContent).toContain('42');
  });

  it('accepts a tone color for the big number', () => {
    const el = kpiCard({ title: 'Critical', big: '15', tone: 'red' });
    expect(el.querySelector('.kpi-big').style.color).toBeTruthy();
  });

  it('renders an em-dash when big is null', () => {
    const el = kpiCard({ title: 'Activities', big: null, sub: 'No XER loaded' });
    expect(el.textContent).toContain('—');
  });
});
