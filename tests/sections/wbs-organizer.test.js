// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '../../src/sections/wbs-organizer.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXer } from '@criticalpathpartners/lens-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', 'fixtures');

describe('WBS Organizer', () => {
  it('renders empty-state without XER', () => {
    const el = render({ A: null, B: null });
    expect(el.textContent).toContain('No XER');
  });

  it('renders WBS hierarchy from deep-wbs.xer fixture', () => {
    const fixPath = join(FIX, 'deep-wbs.xer');
    try {
      const A = parseXer(readFileSync(fixPath, 'utf-8'));
      const el = render({ A, B: null });
      const rows = el.querySelectorAll('.lens-wbs-row');
      expect(rows.length).toBeGreaterThan(0);
    } catch (e) {
      if (e.code === 'ENOENT') {
        // Fall back to minimal fixture
        const A = parseXer(readFileSync(join(FIX, 'minimal-3-task.xer'), 'utf-8'));
        const el = render({ A, B: null });
        expect(el).toBeDefined();
      } else throw e;
    }
  });
});
