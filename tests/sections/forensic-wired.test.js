// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { findSection } from '../../src/sections/_registry.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('CPP Forensic group is wired (no placeholders)', () => {
  const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
  const A = parseXer(text);

  for (const id of ['path-explorer', 'lookahead', 'half-step', 'deep-forensic']) {
    it(`section "${id}" renders real content (not Coming soon)`, () => {
      const el = findSection(id).render({ A, B: null });
      expect(el).toBeDefined();
      expect(el.textContent || '').not.toContain('Coming soon');
    });
  }

  it('all four sections belong to CPP Forensic group', () => {
    expect(findSection('path-explorer').group).toBe('CPP Forensic');
    expect(findSection('lookahead').group).toBe('CPP Forensic');
    expect(findSection('half-step').group).toBe('CPP Forensic');
    expect(findSection('deep-forensic').group).toBe('CPP Forensic');
  });
});
