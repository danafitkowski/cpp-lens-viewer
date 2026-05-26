// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { findSection } from '../../src/sections/_registry.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('Overview group is wired (no placeholders)', () => {
  const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
  const A = parseXer(text);

  for (const id of ['dashboard', 'summary', 'compare-page']) {
    it(`section "${id}" renders real content (not Coming soon)`, () => {
      const el = findSection(id).render({ A, B: null });
      expect(el.textContent).not.toContain('Coming soon');
    });
  }

  it('all three sections still belong to Overview group', () => {
    expect(findSection('dashboard').group).toBe('Overview');
    expect(findSection('summary').group).toBe('Overview');
    expect(findSection('compare-page').group).toBe('Overview');
  });
});
