/**
 * The viewer's own version, read from package.json.
 *
 * package.json is where npm already requires this number to live, so it is the
 * only source. Nothing else in src/ should carry a version literal.
 *
 * Why this module exists rather than each caller importing the JSON itself:
 * that import has three consumers with different rules (esbuild for the build,
 * vite for the tests, plain Node for scripts/preview-section.mjs), and getting
 * it wrong fails in only one of them at a time. One module, one import line,
 * one place to fix.
 *
 * Guarded by tests/unit/lens-version.test.js, which fails if any file under
 * src/ carries the package.json version as a literal again — including in a
 * comment, which is why the number itself is not written out anywhere here.
 * There was one: src/sections/deep-forensic.js stamped the release string onto
 * every Deep Forensic submission as a literal beside package.json's own, so the
 * next version bump would have shipped a viewer telling the Engine it was still
 * the previous release.
 *
 * Two things about the import line below, both learned the hard way:
 *
 *   `with { type: 'json' }` is NOT optional. esbuild and vite import JSON
 *   without it; plain Node does not, and scripts/preview-section.mjs loads the
 *   section registry — and so this module — with no bundler at all. Without the
 *   attribute it dies on ERR_IMPORT_ATTRIBUTE_MISSING before rendering.
 *
 *   It must be a DEFAULT import. With the attribute present, Node and esbuild
 *   both apply standard JSON-module semantics, under which `default` is the
 *   only export. `import { version }` builds fine without the attribute and
 *   then fails with "does not provide an export named 'version'" once it is
 *   added — which is how the pair of them got settled.
 *
 * The cost of the default import is that esbuild can no longer tree-shake the
 * unused keys, so the built dist/lens-viewer.html carries package.json whole
 * (~0.6 KB of a 193 KB page: description, dependency ranges, the public
 * repository URL). Nothing there is private — the file is in the public repo —
 * and a viewer that reports its real version is worth more than the bytes.
 *
 * Verified in all three consumers: node scripts/preview-section.mjs,
 * npm test, npm run build.
 */
import pkg from '../package.json' with { type: 'json' };

export const LENS_VERSION = pkg.version;
