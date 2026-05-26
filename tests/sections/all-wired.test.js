// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { SECTIONS } from '../../src/sections/_registry.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('All 29 sections are wired', () => {
  const text = readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8');
  const A = parseXer(text);

  for (const section of SECTIONS) {
    it(`${section.id} (${section.group}) renders without placeholder`, () => {
      const el = section.render({ A, B: null });
      expect(el).toBeDefined();
      expect(el.textContent || '').not.toContain('Coming soon');
    });
  }
});
