// Where the optional QA corpus lives.
//
// These are large real-export XERs that are NOT in the repo. The suites that
// use them skip when the files are absent, so a clean checkout runs green
// without them. Point LENS_QA_XER_DIR at wherever you keep yours.
//
// The default used to be one contributor's Downloads folder, which put an
// absolute path under a user home into a public repo and told every other
// contributor nothing. A repo-relative default is both anonymous and
// actionable: drop the files in tests/fixtures/qa and the suites pick them up.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

export const QA_DIR = process.env.LENS_QA_XER_DIR || join(HERE, 'fixtures', 'qa');
