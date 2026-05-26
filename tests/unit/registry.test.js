// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { SECTIONS, GROUPS, findSection } from '../../src/sections/_registry.js';

describe('section registry', () => {
  it('has exactly 29 sections', () => {
    expect(SECTIONS).toHaveLength(29);
  });

  it('has 6 sidebar groups', () => {
    expect(GROUPS).toHaveLength(6);
    expect(new Set(SECTIONS.map(s => s.group))).toEqual(new Set(GROUPS));
  });

  it('every section has unique id', () => {
    const ids = SECTIONS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('findSection returns the section by id', () => {
    expect(findSection('dashboard').title).toBe('Executive Dashboard');
    expect(findSection('half-step').group).toBe('CPP Forensic');
    expect(findSection('nonexistent')).toBeUndefined();
  });

  it('every section render returns a DOM node (placeholder)', () => {
    for (const s of SECTIONS) {
      const node = s.render({ A: null, B: null });
      expect(node).toBeDefined();
      expect(node.tagName).toBe('DIV');
    }
  });
});
