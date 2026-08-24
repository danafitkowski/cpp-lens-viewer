/**
 * Deep Forensic — MCP handoff modal, wired to lens-facade-v0.1.0.
 *
 * Flow:
 *   1. (Optional) anonymize the in-memory models client-side — the current
 *      schedule (A) and, when one is loaded, its baseline (B), under ONE map.
 *   2. writeXer(model) → re-emit canonical XER text → gzip + base64 each file.
 *   3. POST /lens/run, poll /lens/job/:id, embed /lens/r/:id in an in-viewer
 *      result panel (see deep-forensic-result.js).
 *
 * Anonymization is on by default. The anon map never leaves the browser;
 * only SHA-256(map) is sent so the result can be receipt-validated locally.
 * The hash is taken after BOTH models are tokenized, so it covers everything
 * that was actually uploaded.
 *
 * The baseline used to be dropped here: render took { A, B }, the submit
 * handler read only A, and the call omitted xerBaselineBase64 even though the
 * transport has always sent the field. Every run compared the current schedule
 * against itself — one-day analysis period, 0wd slip, no slipped activities —
 * and said nothing about it. Two files in, two files out, or the run is
 * refused; see ENGINE_TOOLS in ../mcp/client.js.
 */

import { h, clear } from '../lib/dom.js';
import { writeXer, gzipToBase64 } from '@criticalpathpartners/lens-parser';
import { runDeepForensic, toolRequiresBaseline, ENGINE_TOOLS } from '../mcp/client.js';
import { anonymizeModelPair } from '../mcp/anonymizer.js';
import { prefsStore } from '../state/prefs.js';
import { buildResultPanel } from './deep-forensic-result.js';
import { LENS_VERSION } from '../version.js';

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

// Presentation only. Whether a tool needs two files is NOT restated here — it
// is read from ENGINE_TOOLS in ../mcp/client.js, the one place that knows the
// Engine's contract, so the picker and the transport can never disagree.
export const TOOLS = [
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

  const hasBaseline = !!B;

  // ── Explainer card ──────────────────────────────────────────────────────────
  const explainerCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Run Deep Forensic Analysis'),
    h('p', {},
      'Submit your schedule to the CPP Engine for a forensic analysis.  ' +
      'Anonymized by default — your activity names never leave the browser.  ' +
      'Rate-limited to 25 runs per day per IP.'
    )
  ]);

  // ── Baseline status ─────────────────────────────────────────────────────────
  // States plainly what will be uploaded. A forensic run that quietly sent one
  // file is how this section produced a windows analysis with a one-day period
  // and 0wd of slip.
  const baselineCard = h('div', { class: 'lens-card' }, hasBaseline
    ? [
        h('h3', {}, 'Baseline: loaded'),
        h('p', {},
          'Both files are submitted — the current schedule (A) and the baseline (B).  ' +
          'With anonymization on they are tokenized under one map, so the same activity ' +
          'carries the same token in each file and the reported SHA-256 covers both.'
        )
      ]
    : [
        h('h3', {}, 'Baseline: none loaded'),
        h('p', {},
          'Only the current schedule (A) will be submitted.  ' +
          'Tools that compare a baseline against the current schedule are disabled below — ' +
          'load a second XER in the sidebar to enable them.'
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
    // FX-028: prefsStore.update(reducer) invokes its arg as a function — passing
    // an object threw "reducer is not a function" on every toggle, so the pref
    // never persisted. Use .set() like every other call site.
    prefsStore.set({ ...prefsStore.get(), anonymizeOnMcpUpload: anonymize });
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
  // A tool that needs two files cannot be selected with one. The default falls
  // to the first tool that can actually run rather than silently substituting a
  // different analysis behind a disabled radio.
  const blocked = (tool) => toolRequiresBaseline(tool.id) && !hasBaseline;
  let selectedTool = (TOOLS.find(t => !blocked(t)) || TOOLS[0]).id;

  const radioInputs = [];

  const toolCards = TOOLS.map(tool => {
    const isBlocked = blocked(tool);

    const radio = h('input', {
      type:  'radio',
      name:  'deep-forensic-tool',
      value: tool.id,
      id:    `deep-forensic-tool-${tool.id}`,
      style: { marginRight: '10px', marginTop: '2px', flexShrink: '0' }
    });
    radio.checked  = (tool.id === selectedTool);
    radio.disabled = isBlocked;
    radio.addEventListener('change', () => {
      if (radio.checked && !isBlocked) selectedTool = tool.id;
    });
    radioInputs.push(radio);

    const labelChildren = [
      h('strong', {}, `${tool.title} `),
      h('span', {
        style: { fontSize: '11px', background: '#0F2540', color: '#fff',
                 padding: '1px 6px', borderRadius: '3px', marginRight: '6px' }
      }, tool.label),
      h('br', {}),
      h('span', { style: { color: '#555', fontSize: '13px' } }, tool.description)
    ];
    if (isBlocked) {
      labelChildren.push(h('br', {}));
      labelChildren.push(h('span', {
        style: { color: '#B45309', fontSize: '13px', fontWeight: '600' }
      }, 'Requires a baseline XER — load a second file (B) in the sidebar.'));
    } else if (hasBaseline) {
      // Say what the Engine does with the baseline for THIS method. Two of the
      // five do not read it, and a user who loaded one should not be left to
      // assume it was used.
      const use = (ENGINE_TOOLS[tool.id] || {}).baselineUse;
      if (use) {
        labelChildren.push(h('br', {}));
        labelChildren.push(h('span', {
          style: { color: '#555', fontSize: '12px', fontStyle: 'italic' }
        }, `Baseline: ${use}.`));
      }
    }

    const labelEl = h('label', {
      for:   `deep-forensic-tool-${tool.id}`,
      style: { cursor: isBlocked ? 'not-allowed' : 'pointer', flex: '1',
               opacity: isBlocked ? '0.75' : '1' }
    }, labelChildren);

    return h('div', {
      class: 'lens-card',
      style: { display: 'flex', alignItems: 'flex-start', gap: '8px',
               padding: '10px 14px', cursor: isBlocked ? 'not-allowed' : 'pointer' }
    }, [radio, labelEl]);
  });

  const toolPickerCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Select a forensic tool'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, toolCards)
  ]);

  // ── Status area ─────────────────────────────────────────────────────────────
  const statusArea = h('div', {
    id: 'deep-forensic-status',
    role: 'status',
    style: { minHeight: '28px', fontWeight: '600', fontSize: '14px', marginTop: '8px' }
  });

  function setStatus(msg, color = '#1f3a5f') {
    clear(statusArea);
    statusArea.appendChild(h('span', { style: { color } }, msg));
  }

  // In-viewer result panel slot (populated on a successful run).
  const resultPanelSlot = h('div', {});

  // ── Run button ──────────────────────────────────────────────────────────────
  const runBtn = h('button', {
    style: {
      background: '#C8392F', color: '#fff', padding: '12px 28px',
      border: 'none', borderRadius: '4px', cursor: 'pointer',
      fontWeight: '700', fontSize: '15px', marginTop: '12px'
    },
    onclick: async () => {
      // Second gate, behind the disabled radio: a two-file method never gets
      // submitted with one file, whatever the UI state got into.
      if (toolRequiresBaseline(selectedTool) && !B) {
        clear(resultPanelSlot);
        setStatus(
          'This analysis compares a baseline against the current schedule — ' +
          'load a baseline XER (file B) in the sidebar first.',
          '#C8392F'
        );
        return;
      }

      runBtn.disabled = true;
      runBtn.style.opacity = '0.7';

      try {
        setStatus(anonymize ? 'Anonymizing XER...' : 'Preparing XER...');

        let xerModel = A;
        let baselineModel = B || null;
        let anonMapSha256 = '';

        if (anonymize) {
          // ONE map across both files. Anonymizing them separately would give
          // the same activity a different token in each, and the reported hash
          // would cover only the current schedule.
          const pair = anonymizeModelPair(A, baselineModel);
          xerModel = pair.current;
          baselineModel = pair.baseline;
          // SHA-256 of the anon map (map never sent to server — only its hash),
          // taken after BOTH models are tokenized so the receipt covers
          // everything that is about to be uploaded.
          const mapJson   = JSON.stringify(pair.map);
          const mapBytes  = new TextEncoder().encode(mapJson);
          try {
            const hashBuf  = await crypto.subtle.digest('SHA-256', mapBytes);
            const hashArr  = Array.from(new Uint8Array(hashBuf));
            anonMapSha256  = hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
          } catch {
            anonMapSha256 = '';
          }
        }

        setStatus(baselineModel ? 'Compressing XERs...' : 'Compressing XER...');
        const xerText = writeXer(xerModel);
        // gzip + base64. The /lens/run facade sniffs the gzip magic 0x1f 0x8b
        // on the decoded bytes and inflates transparently (facade v0.1.2+).
        // Shrinks the wire payload ~80% on typical EPC schedules.
        const xerBase64 = await gzipToBase64(xerText);
        const xerBaselineBase64 = baselineModel
          ? await gzipToBase64(writeXer(baselineModel))
          : undefined;

        setStatus(xerBaselineBase64
          ? 'Submitting to Engine (schedule + baseline)...'
          : 'Submitting to Engine...');

        const result = await runDeepForensic({
          tool:          selectedTool,
          xerBase64,
          xerBaselineBase64,
          anonymized:    anonymize,
          anonMapSha256,
          // Read from package.json via src/version.js. This used to be the
          // release string written out as a literal, a second source of truth
          // that would have gone stale on the next bump and told the Engine
          // the wrong client version. Guarded by
          // tests/unit/lens-version.test.js, which also forbids writing the
          // number into a comment here.
          lensVersion:   LENS_VERSION
        });

        if (result.status === 'rate_limited') {
          clear(resultPanelSlot);
          setStatus(
            'Daily limit reached — try again tomorrow or contact us for engagement-grade access.',
            '#B45309'
          );
        } else if (result.status === 'done' && result.resultUrl) {
          clear(resultPanelSlot);
          resultPanelSlot.appendChild(buildResultPanel({
            jobId: result.jobId, resultUrl: result.resultUrl
          }));
          setStatus('Done — result below. Use Share to send a link.', '#15803D');
        } else {
          clear(resultPanelSlot);
          const detail = (result.errors && result.errors[0]) || `status: ${result.status}`;
          throw new Error(detail);
        }

      } catch (err) {
        clear(resultPanelSlot);
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
    baselineCard,
    anonRow,
    toolPickerCard,
    runBtn,
    statusArea,
    resultPanelSlot
  ]);
}
