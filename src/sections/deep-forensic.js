/**
 * Deep Forensic — MCP handoff modal, wired to lens-facade-v0.1.0.
 *
 * Flow:
 *   1. (Optional) anonymize the in-memory model client-side.
 *   2. writeXer(model) → re-emit canonical XER text → base64 the bytes.
 *   3. POST /lens/run, poll /lens/job/:id, open /lens/r/:id in a new tab.
 *
 * Anonymization is on by default. The anon map never leaves the browser;
 * only SHA-256(map) is sent so the result can be receipt-validated locally.
 */

import { h, clear } from '../lib/dom.js';
import { writeXer } from '@criticalpathpartners/lens-parser';
import { runDeepForensic } from '../mcp/client.js';
import { anonymizeModel } from '../mcp/anonymizer.js';
import { prefsStore } from '../state/prefs.js';

// Convert a Uint8Array to a base64 string. Chunked to avoid blowing the
// call stack on large XERs (String.fromCharCode(...arr) caps at ~64K args).
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    id:          'forensic-delay-analysis',
    title:       'Windows Analysis',
    label:       'MIP 3.3',
    description: 'Contemporaneous Period Analysis — attribute delay windows to owner, contractor, or concurrent causes.'
  },
  {
    id:          'time-impact-analysis',
    title:       'Time Impact Analysis',
    label:       'MIP 3.7',
    description: 'Prospective fragnet insertion — quantify the impact of a specific event on project completion.'
  },
  {
    id:          'collapsed-as-built',
    title:       'Collapsed As-Built',
    label:       'MIP 3.8',
    description: 'Remove excusable delays from as-built to show a compressed but-for completion date.'
  },
  {
    id:          'claim-workbench',
    title:       'Claim Workbench',
    label:       'Forensic',
    description: 'Mixed evidence ledger — chain-of-custody diff, trust scoring, and slip-to-evidence linkage.'
  },
  {
    id:          'schedule-risk-analysis',
    title:       'Schedule Risk Analysis',
    label:       'Monte Carlo',
    description: 'P50/P80 completion forecasts with sensitivity ranks and risk register integration.'
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────────────────────

export function render({ A, B }) {
  if (!A) {
    return h('div', { class: 'lens-section-content' }, [
      h('h2', {}, 'Deep Forensic'),
      h('div', { class: 'lens-card' }, [
        h('p', {}, 'Load an XER, then pick a forensic tool to run on it.')
      ])
    ]);
  }

  // Read anonymize preference
  const prefs = prefsStore.get();
  let anonymize = prefs.anonymizeOnMcpUpload !== false;

  // ── Explainer card ──────────────────────────────────────────────────────────
  const explainerCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Run Deep Forensic Analysis'),
    h('p', {},
      'Submit your XER to the CPP Engine for a forensic analysis.  ' +
      'Anonymized by default — your activity names never leave the browser.  ' +
      'Rate-limited to 5 runs per day per IP.'
    )
  ]);

  // ── Anonymize toggle ────────────────────────────────────────────────────────
  const anonCheckbox = h('input', {
    type:    'checkbox',
    id:      'deep-forensic-anon-toggle',
    style:   { marginRight: '8px' }
  });
  // Set initial checked state imperatively (can't use attribute for boolean in h())
  anonCheckbox.checked = anonymize;
  anonCheckbox.addEventListener('change', () => {
    anonymize = anonCheckbox.checked;
    prefsStore.update({ ...prefsStore.get(), anonymizeOnMcpUpload: anonymize });
  });

  const anonLabel = h('label', {
    for: 'deep-forensic-anon-toggle',
    style: { cursor: 'pointer', fontWeight: '600' }
  }, 'Anonymize XER before upload (recommended)');

  const anonRow = h('div', {
    class: 'lens-card',
    style: { display: 'flex', alignItems: 'center', gap: '8px' }
  }, [anonCheckbox, anonLabel]);

  // ── Tool picker ─────────────────────────────────────────────────────────────
  let selectedTool = TOOLS[0].id;

  const radioInputs = [];

  const toolCards = TOOLS.map(tool => {
    const radio = h('input', {
      type:  'radio',
      name:  'deep-forensic-tool',
      value: tool.id,
      id:    `deep-forensic-tool-${tool.id}`,
      style: { marginRight: '10px', marginTop: '2px', flexShrink: '0' }
    });
    radio.checked = (tool.id === selectedTool);
    radio.addEventListener('change', () => {
      if (radio.checked) selectedTool = tool.id;
    });
    radioInputs.push(radio);

    const labelEl = h('label', {
      for:   `deep-forensic-tool-${tool.id}`,
      style: { cursor: 'pointer', flex: '1' }
    }, [
      h('strong', {}, `${tool.title} `),
      h('span', {
        style: { fontSize: '11px', background: '#0F2540', color: '#fff',
                 padding: '1px 6px', borderRadius: '3px', marginRight: '6px' }
      }, tool.label),
      h('br', {}),
      h('span', { style: { color: '#555', fontSize: '13px' } }, tool.description)
    ]);

    return h('div', {
      class: 'lens-card',
      style: { display: 'flex', alignItems: 'flex-start', gap: '8px',
               padding: '10px 14px', cursor: 'pointer' }
    }, [radio, labelEl]);
  });

  const toolPickerCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Select a forensic tool'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, toolCards)
  ]);

  // ── Status area ─────────────────────────────────────────────────────────────
  const statusArea = h('div', {
    style: { minHeight: '28px', fontWeight: '600', fontSize: '14px', marginTop: '8px' }
  });

  function setStatus(msg, color = '#1f3a5f') {
    clear(statusArea);
    statusArea.appendChild(h('span', { style: { color } }, msg));
  }

  // ── Run button ──────────────────────────────────────────────────────────────
  const runBtn = h('button', {
    style: {
      background: '#C8392F', color: '#fff', padding: '12px 28px',
      border: 'none', borderRadius: '4px', cursor: 'pointer',
      fontWeight: '700', fontSize: '15px', marginTop: '12px'
    },
    onclick: async () => {
      runBtn.disabled = true;
      runBtn.style.opacity = '0.7';

      // Open a placeholder tab synchronously so the popup blocker keeps it
      // attached to the user click. We assign location.href once the job
      // finishes. Closed on rate_limit / failure paths.
      const resultTab = window.open('about:blank', '_blank');

      try {
        setStatus('Anonymizing XER...');

        let xerModel = A;
        let anonMapSha256 = '';

        if (anonymize) {
          const { model, map } = anonymizeModel(A);
          xerModel = model;
          // SHA-256 of the anon map (map never sent to server — only its hash)
          const mapJson   = JSON.stringify(map);
          const mapBytes  = new TextEncoder().encode(mapJson);
          try {
            const hashBuf  = await crypto.subtle.digest('SHA-256', mapBytes);
            const hashArr  = Array.from(new Uint8Array(hashBuf));
            anonMapSha256  = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
          } catch {
            anonMapSha256 = '';
          }
        }

        setStatus('Encoding XER...');
        const xerText = writeXer(xerModel);
        const xerBytes = new TextEncoder().encode(xerText);
        const xerBase64 = bytesToBase64(xerBytes);

        setStatus('Submitting to Engine...');

        const result = await runDeepForensic({
          tool:          selectedTool,
          xerBase64,
          anonymized:    anonymize,
          anonMapSha256,
          lensVersion:   '1.0.0'
        });

        if (result.status === 'rate_limited') {
          if (resultTab) resultTab.close();
          setStatus(
            'Daily limit reached — try again tomorrow or contact us for engagement-grade access.',
            '#B45309'
          );
        } else if (result.status === 'done' && result.resultUrl) {
          if (resultTab) {
            resultTab.location.href = result.resultUrl;
          } else {
            window.open(result.resultUrl, '_blank');
          }
          setStatus('Result opened in new tab.', '#15803D');
        } else {
          if (resultTab) resultTab.close();
          const detail = (result.errors && result.errors[0]) || `status: ${result.status}`;
          throw new Error(detail);
        }

      } catch (err) {
        if (resultTab && !resultTab.closed) resultTab.close();
        setStatus(
          'Run failed: ' + (err && err.message ? err.message : 'unknown error'),
          '#C8392F'
        );
      } finally {
        runBtn.disabled = false;
        runBtn.style.opacity = '1';
      }
    }
  }, 'Run Deep Forensic');

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Deep Forensic'),
    explainerCard,
    anonRow,
    toolPickerCard,
    runBtn,
    statusArea
  ]);
}
