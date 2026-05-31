import { h, on, clear } from '../lib/dom.js';
import { SECTIONS, GROUPS } from '../sections/_registry.js';
import { navStore } from '../state/nav.js';
import { modelStore } from '../state/model.js';
import { parseXer, parseP6Xml, getTable } from '@criticalpathpartners/lens-parser';
import { convertMpp } from '../mcp/client.js';
import { SAMPLE_XER } from '../sample/sample-schedule.js';

// File loader that picks the parser based on extension.
//   .xer / .txt → parseXer        (100% local)
//   .xml        → parseP6Xml      (100% local)
//   .mpp        → server-side mpxj conversion to P6 XML, then parseP6Xml local.
//                MS Project .mpp is a proprietary binary with no browser parser,
//                so the raw file is sent to /lens/convert (the ONLY server
//                exposure); everything after stays local. `onStatus` lets the
//                caller surface that round-trip.
// May throw (parseP6Xml rejects malformed XML; convertMpp throws on
// unavailable/rate-limit/failure) — callers must handle it.
async function parseUploadedFile(file, onStatus) {
  const name = file.name || '';
  if (/\.mpp$/i.test(name)) {
    if (onStatus) onStatus(`Converting "${name}" on the CPP server (MS Project files can’t be read in the browser)…`);
    const buf = await file.arrayBuffer();
    const xml = await convertMpp(buf);
    return parseP6Xml(xml, { filename: name.replace(/\.mpp$/i, '.xml') });
  }
  const text = await file.text();
  const isXml = /\.xml$/i.test(name) || /^\s*<\?xml/i.test(text.slice(0, 64));
  return isXml
    ? parseP6Xml(text, { filename: name })
    : parseXer(text, { filename: name });
}

// A parsed model is "usable" only if it has at least one PROJECT or TASK row.
// A non-XER text file parses without throwing (passthrough) but yields an empty
// model — loading that would render a viewer full of blank sections that looks
// broken. Detect it and tell the user instead.
function modelHasContent(model) {
  return getTable(model, 'PROJECT').length > 0 || getTable(model, 'TASK').length > 0;
}

function renderFileBox() {
  const fileA = h('input', { type: 'file', accept: '.xer,.xml,.mpp,.txt', id: 'lens-file-a' });
  const fileB = h('input', { type: 'file', accept: '.xer,.xml,.mpp,.txt', id: 'lens-file-b' });
  const analyze = h('button', {}, 'Analyze');
  const reset = h('button', { class: 'secondary' }, 'Reset');
  const sample = h('button', { class: 'secondary' }, 'Load a sample schedule');

  // Visible status line — explicit fg+bg so it reads on any sidebar background
  // (never relies on inherited contrast).
  const statusSlot = h('div', {
    style: { minHeight: '0', marginTop: '8px', fontSize: '12px', lineHeight: '1.4' }
  });
  function showStatus(msg, kind) {
    clear(statusSlot);
    if (!msg) return;
    const bg = kind === 'error' ? '#C8392F' : (kind === 'ok' ? '#15803D' : '#0F2540');
    statusSlot.appendChild(h('div', {
      style: {
        background: bg, color: '#ffffff', padding: '6px 10px',
        borderRadius: '4px', fontWeight: '600'
      }
    }, msg));
  }

  on(analyze, 'click', async () => {
    const fa = fileA.files[0];
    if (!fa) { showStatus('Pick a current XER, XML, or MPP file first.', 'error'); return; }

    analyze.disabled = true;
    try {
      showStatus('Parsing…', 'info');
      const A = await parseUploadedFile(fa, (m) => showStatus(m, 'info'));
      if (!modelHasContent(A)) {
        showStatus(
          `"${fa.name}" has no PROJECT or TASK data — is it a valid P6 XER/XML export?`,
          'error');
        return;
      }
      let B = null;
      if (fileB.files[0]) {
        const fb = fileB.files[0];
        B = await parseUploadedFile(fb, (m) => showStatus(m, 'info'));
        if (!modelHasContent(B)) {
          showStatus(
            `Baseline "${fb.name}" has no PROJECT or TASK data — loaded the current file only.`,
            'error');
          B = null;
        }
      }
      modelStore.set({ A, B });
      showStatus(
        `Loaded ${getTable(A, 'TASK').length} activities${B ? ' + baseline' : ''}.`,
        'ok');
    } catch (err) {
      // parseP6Xml throws on malformed XML; file.text() can reject. Surface it
      // instead of silently failing (which looks like a broken viewer).
      const reason = (err && err.message) ? err.message : 'unknown parse error';
      showStatus(`Couldn't read "${fa.name}": ${reason}`, 'error');
    } finally {
      analyze.disabled = false;
    }
  });

  on(reset, 'click', () => {
    fileA.value = '';
    fileB.value = '';
    showStatus('', null);
    modelStore.set({ A: null, B: null });
  });

  // One-click demo: parse the bundled synthetic schedule locally (no upload) so a
  // visitor can explore every section with zero setup. parseXer is synchronous and
  // the input is trusted/inlined, but wrap it anyway so a future parser change can't
  // throw an unhandled error into the click handler.
  on(sample, 'click', () => {
    try {
      const A = parseXer(SAMPLE_XER, { filename: 'sample-demo.xer' });
      modelStore.set({ A, B: null });
      showStatus(`Loaded sample — ${getTable(A, 'TASK').length} activities (demo data).`, 'ok');
    } catch (err) {
      showStatus('Could not load the sample schedule: ' + ((err && err.message) || 'unknown'), 'error');
    }
  });

  return h('div', { class: 'file-box' }, [
    h('label', {}, 'Current / update XER'), fileA,
    h('label', {}, 'Previous / baseline XER (optional)'), fileB,
    analyze, reset, sample, statusSlot
  ]);
}

function renderNav() {
  const buttons = [];
  const buttonsById = {};
  const root = h('nav', {});

  for (const group of GROUPS) {
    root.appendChild(h('div', { class: 'group' }, group));
    for (const s of SECTIONS.filter(x => x.group === group)) {
      const b = h('button', { 'data-id': s.id }, s.title);
      on(b, 'click', () => navStore.set({ active: s.id }));
      root.appendChild(b);
      buttons.push(b);
      buttonsById[s.id] = b;
    }
  }

  navStore.subscribe(({ active }) => {
    for (const b of buttons) b.classList.remove('active');
    if (buttonsById[active]) buttonsById[active].classList.add('active');
  });

  const initial = navStore.get().active;
  if (buttonsById[initial]) buttonsById[initial].classList.add('active');

  return root;
}

export function renderSidebar() {
  return h('aside', { class: 'lens-sidebar' }, [
    renderFileBox(),
    renderNav()
  ]);
}
