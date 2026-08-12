/**
 * Render one section to a standalone HTML file so it can be LOOKED at.
 *
 * Uses happy-dom, the same environment the section tests run in, plus the real
 * shell stylesheet. It never touches dist/: an earlier attempt spliced a
 * <script> into the built bundle to auto-select a section, and the splice landed
 * inside a JS template string and dumped the raw bundle source onto the page.
 *
 *   node scripts/preview-section.mjs engine-parity out.html
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const sectionId = process.argv[2];
const outPath = process.argv[3];
if (!sectionId || !outPath) {
  console.error('usage: node scripts/preview-section.mjs <section-id> <out.html>');
  process.exit(2);
}

const win = new Window({ url: 'http://localhost/' });
globalThis.window = win;
globalThis.document = win.document;
globalThis.Node = win.Node;
globalThis.HTMLElement = win.HTMLElement;

const { findSection } = await import('../src/sections/_registry.js');
const section = findSection(sectionId);
if (!section) {
  console.error(`no section with id "${sectionId}"`);
  process.exit(1);
}

const el = section.render({ A: null, B: null });
const css = readFileSync(join(ROOT, 'src', 'shell', 'shell.css'), 'utf8');

const doc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>${section.title} — preview</title>
<style>${css}</style>
<style>body{margin:0;background:var(--bg,#F2F6FA)}
main{padding:26px;max-width:1080px;margin:0 auto}</style>
</head><body><main>${el.outerHTML}</main></body></html>
`;

writeFileSync(outPath, doc, 'utf8');
console.log(`wrote ${outPath} (${doc.length} bytes) for section "${section.title}"`);
