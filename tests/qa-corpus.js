// Where the optional QA corpus lives, and what its two files are called.
//
// These are large real-export XERs that are NOT in the repo. The suites that
// use them skip when the files are absent, so a clean checkout runs green
// without them.
//
// The default folder used to be one contributor's Downloads folder, which put
// an absolute path under a user home into a public repo and told every other
// contributor nothing. A repo-relative default is both anonymous and
// actionable: drop the files in tests/fixtures/qa and the suites pick them up.
//
// The FILE NAMES get the same treatment. Each suite used to spell them out,
// and they were the client's name. A real export pair is somebody's project,
// and this repository is public, so the names are not written here at all.
// The defaults are neutral, and whoever holds the files says what theirs are
// called, without renaming anything outside the repository, in either of two
// ways (the environment wins, field by field):
//
//   environment           LENS_QA_XER_DIR        the folder
//                         LENS_QA_CURRENT_XER    the current export's file name
//                         LENS_QA_BASELINE_XER   the baseline export's file name
//
//   tests/qa-corpus.local.json   (untracked: it is in .gitignore)
//                         { "dir": "...", "current": "...", "baseline": "..." }
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_CONFIG = join(HERE, 'qa-corpus.local.json');

function readLocalConfig() {
  if (!existsSync(LOCAL_CONFIG)) return null;
  try {
    return JSON.parse(readFileSync(LOCAL_CONFIG, 'utf-8'));
  } catch (err) {
    // A typo here would otherwise make five suites skip without a word, which
    // reads as "green" and checks nothing.
    throw new Error(`tests/qa-corpus.local.json is not valid JSON: ${err.message}`);
  }
}

/**
 * Resolve the corpus folder and the two file paths.
 *
 * @param {Record<string, string|undefined>} [env]
 * @param {{dir?: string, current?: string, baseline?: string}|null} [local]
 * @returns {{ dir: string, current: string, baseline: string, have: boolean }}
 *   `have` is true only when BOTH files exist, which is what the suites skip on.
 */
export function resolveQaCorpus(env = process.env, local = readLocalConfig()) {
  const cfg = local || {};
  const dir = env.LENS_QA_XER_DIR || cfg.dir || join(HERE, 'fixtures', 'qa');
  const current  = join(dir, env.LENS_QA_CURRENT_XER  || cfg.current  || 'qa-current.xer');
  const baseline = join(dir, env.LENS_QA_BASELINE_XER || cfg.baseline || 'qa-baseline.xer');
  return { dir, current, baseline, have: existsSync(current) && existsSync(baseline) };
}

const corpus = resolveQaCorpus();

export const QA_DIR = corpus.dir;
export const QA_CURRENT = corpus.current;
export const QA_BASELINE = corpus.baseline;
export const HAVE_QA = corpus.have;
