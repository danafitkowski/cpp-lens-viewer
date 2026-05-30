import { h, on, clear } from '../lib/dom.js';
import { SECTIONS, GROUPS } from '../sections/_registry.js';
import { navStore } from '../state/nav.js';
import { modelStore } from '../state/model.js';
import { parseXer, parseP6Xml, getTable } from '@criticalpathpartners/lens-parser';

// File loader that picks the parser based on extension. P6 XML uploads
// produce the same model shape as XER so downstream sections don't notice.
// May throw (parseP6Xml rejects malformed XML) — callers must handle it.
async function parseUploadedFile(file) {
  const text = await file.text();
  const name = file.name || '';
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
  const fileA = h('input', { type: 'file', accept: '.xer,.xml,.txt', id: 'lens-file-a' });
  const fileB = h('input', { type: 'file', accept: '.xer,.xml,.txt', id: 'lens-file-b' });
  const analyze = h('button', {}, 'Analyze');
  const reset = h('button', { class: 'secondary' }, 'Reset');

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
    if (!fa) { showStatus('Pick a current XER or XML file first.', 'error'); return; }

    analyze.disabled = true;
    try {
      showStatus('Parsing…', 'info');
      const A = await parseUploadedFile(fa);
      if (!modelHasContent(A)) {
        showStatus(
          `"${fa.name}" has no PROJECT or TASK data — is it a valid P6 XER/XML export?`,
          'error');
        return;
      }
      let B = null;
      if (fileB.files[0]) {
        const fb = fileB.files[0];
        B = await parseUploadedFile(fb);
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

  return h('div', { class: 'file-box' }, [
    h('label', {}, 'Current / update XER'), fileA,
    h('label', {}, 'Previous / baseline XER (optional)'), fileB,
    analyze, reset, statusSlot
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
