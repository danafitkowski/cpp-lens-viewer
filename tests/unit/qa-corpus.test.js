// Where the optional QA corpus lives, and what its two files are called.
//
// Five suites check their numbers against a real export pair that is not in
// this repository. Each of them used to spell the two file names itself, and
// the names were the client's. This is a public repository, so the names now
// come from one place, with a neutral default, and whoever holds the files
// says what theirs are called through the environment or an untracked local
// config. Nothing outside the repository has to be renamed.
//
// The property that matters to every other contributor is unchanged: with no
// files present the pair is reported absent and the five suites skip.
import { describe, it, expect } from 'vitest';
import { basename, join } from 'node:path';
import { resolveQaCorpus, QA_CURRENT, QA_BASELINE, HAVE_QA } from '../qa-corpus.js';

const slash = (p) => p.replace(/\\/g, '/');

describe('QA corpus location', () => {
  it('defaults to neutral file names under tests/fixtures/qa', () => {
    const c = resolveQaCorpus({}, null);
    expect(slash(c.dir)).toMatch(/tests\/fixtures\/qa$/);
    expect(basename(c.current)).toBe('qa-current.xer');
    expect(basename(c.baseline)).toBe('qa-baseline.xer');
  });

  it('takes the folder and both file names from the environment', () => {
    const c = resolveQaCorpus({
      LENS_QA_XER_DIR: join('some', 'where'),
      LENS_QA_CURRENT_XER: 'my-update.xer',
      LENS_QA_BASELINE_XER: 'my-baseline.xer'
    }, null);
    expect(slash(c.current)).toBe('some/where/my-update.xer');
    expect(slash(c.baseline)).toBe('some/where/my-baseline.xer');
  });

  it('takes them from the untracked local config when the environment is silent', () => {
    const c = resolveQaCorpus({}, { dir: join('local', 'corpus'), current: 'c.xer', baseline: 'b.xer' });
    expect(slash(c.current)).toBe('local/corpus/c.xer');
    expect(slash(c.baseline)).toBe('local/corpus/b.xer');
  });

  it('lets the environment win over the local config, field by field', () => {
    const c = resolveQaCorpus(
      { LENS_QA_CURRENT_XER: 'env-current.xer' },
      { dir: join('local', 'corpus'), current: 'c.xer', baseline: 'b.xer' }
    );
    expect(slash(c.current)).toBe('local/corpus/env-current.xer');
    expect(slash(c.baseline)).toBe('local/corpus/b.xer');
  });

  it('reports the pair absent when the files are not there, so the suites skip', () => {
    const c = resolveQaCorpus({ LENS_QA_XER_DIR: join('no', 'such', 'folder') }, null);
    expect(c.have).toBe(false);
  });

  it('exports the resolved pair for the suites to import', () => {
    expect(typeof QA_CURRENT).toBe('string');
    expect(typeof QA_BASELINE).toBe('string');
    expect(typeof HAVE_QA).toBe('boolean');
  });
});
