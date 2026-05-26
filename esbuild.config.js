import * as esbuild from 'esbuild';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

const target = process.argv.find(a => a.startsWith('--target='))?.slice(9) || 'all';
const watch = process.argv.includes('--watch');

if (!existsSync('dist')) mkdirSync('dist');

const sharedOpts = {
  bundle: true,
  format: 'esm',
  target: 'es2020',
  platform: 'browser',
  loader: {
    '.css': 'text',
    '.svg': 'text',
    '.woff2': 'base64'
  },
  define: { 'process.env.NODE_ENV': '"production"' }
};

async function buildLib() {
  await esbuild.build({
    ...sharedOpts,
    entryPoints: ['src/viewer.js'],
    outfile: 'dist/lens-viewer.js',
    sourcemap: false,
    minify: true
  });
  console.log('Built dist/lens-viewer.js');
}

async function buildViewer() {
  // 1) bundle JS (in memory)
  const jsResult = await esbuild.build({
    ...sharedOpts,
    entryPoints: ['src/viewer.js'],
    write: false,
    sourcemap: false,
    minify: true
  });
  const js = jsResult.outputFiles[0].text;

  // 2) bundle CSS separately so it can go in <style> (the JS bundle imports
  // shell.css as text and injects it differently when running in browser —
  // here we inline it explicitly)
  const cssResult = await esbuild.build({
    ...sharedOpts,
    entryPoints: ['src/shell/shell.css'],
    write: false,
    minify: true,
    loader: { '.css': 'css' }
  });
  const css = cssResult.outputFiles[0].text;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>CPP Lens — Primavera P6 viewer</title>
<meta name="description" content="Free in-browser Primavera P6 schedule viewer with deep forensic capabilities."/>
<style>${css}</style>
</head>
<body>
<div id="lens-root"></div>
<script type="module">${js}</script>
</body>
</html>`;

  writeFileSync('dist/lens-viewer.html', html);
  console.log(`Built dist/lens-viewer.html (${(html.length / 1024).toFixed(1)} KB)`);
}

if (watch) {
  const ctx = await esbuild.context({
    ...sharedOpts,
    entryPoints: ['src/viewer.js'],
    outfile: 'dist/lens-viewer.js'
  });
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  if (target === 'lib' || target === 'all') await buildLib();
  if (target === 'viewer' || target === 'all') await buildViewer();
}
