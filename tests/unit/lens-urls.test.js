import { describe, it, expect } from 'vitest';
import { brandShareUrl } from '../../src/mcp/lens-urls.js';

describe('brandShareUrl', () => {
  it('builds the canonical brand /r/<id> URL', () => {
    expect(brandShareUrl('4Efjr_3mXx7K-hmXuFlqbA'))
      .toBe('https://criticalpathpartners.ca/r/4Efjr_3mXx7K-hmXuFlqbA');
  });
  it('returns empty string for an invalid id (charset / length guard)', () => {
    expect(brandShareUrl('')).toBe('');
    expect(brandShareUrl('has space')).toBe('');
    expect(brandShareUrl('a/../b')).toBe('');
    expect(brandShareUrl('x'.repeat(65))).toBe('');
    expect(brandShareUrl(null)).toBe('');
  });
});
