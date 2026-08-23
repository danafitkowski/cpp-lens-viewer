import * as esbuild from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';

const target = process.argv.find(a => a.startsWith('--target='))?.slice(9) || 'all';
const watch = process.argv.includes('--watch');

// Wipe dist/ before every build. A stale artifact under an old output name
// sat there for three months carrying the exact deploy-target filename
// (index.html, May 2026 layout) — one wrong copy step away from deploying a
// build that predates the anonymizer privacy fixes. A build's output dir
// holds ONLY that build's outputs. (Skipped in watch mode: the watcher
// rebuilds into the same names repeatedly and a wipe would race it.)
if (!watch && existsSync('dist')) rmSync('dist', { recursive: true, force: true });
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
<title>CPP Lens — Free P6 Viewer</title><link rel="canonical" href="https://criticalpathpartners.ca/viewer/"><meta property="og:type" content="website"><meta property="og:title" content="CPP Lens — Free P6 Viewer"><meta property="og:description" content="Free P6 viewer: drop a Primavera XER, XML, or MPP schedule and see 30 diagnostic sections rendered in your browser. XER and XML are never uploaded; MPP is converted on the CPP server first."><meta property="og:url" content="https://criticalpathpartners.ca/viewer/"><meta property="og:image" content="https://criticalpathpartners.ca/og-image.png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="CPP Lens — Free P6 Viewer"><meta name="twitter:description" content="Free P6 viewer: drop a Primavera XER, XML, or MPP schedule and see 30 diagnostic sections rendered in your browser."><meta name="twitter:image" content="https://criticalpathpartners.ca/og-image.png">
<meta name="description" content="Free P6 viewer: drop a Primavera XER, XML, or MPP schedule and see 30 diagnostic sections rendered in your browser. XER and XML are never uploaded; MPP is converted on the CPP server first."/>
<style>${css}</style>
</head>
<body>
<a href="#lens-main" class="lens-skip">Skip to report</a>
<div id="lens-root"></div>
<noscript>
<div style="max-width:640px;margin:60px auto;padding:28px 32px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#161a1f;border:1px solid #d9dee4;border-left:4px solid #C8392F;border-radius:8px;line-height:1.6;">
<h1 style="font-size:20px;color:#0F2540;margin:0 0 10px;">CPP Lens — Free P6 Viewer</h1>
<p style="margin:0 0 10px;">Drop a Primavera P6 schedule (XER, XML, or MPP) and see a full diagnostic dashboard: schedule quality, DCMA checks, logic, float, Gantt, comparisons, and more. XER and XML schedules are parsed entirely in your browser and never uploaded. An MS Project .mpp file cannot be read in a browser, so it is sent to the CPP server to be converted. An optional deep forensic analysis is anonymized by default.</p>
<p style="margin:0;">This viewer needs JavaScript to run. Enable JavaScript for this page, or visit <a href="https://criticalpathpartners.ca/" style="color:#C8392F;">criticalpathpartners.ca</a> for sample reports and case studies.</p>
</div>
</noscript>
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
