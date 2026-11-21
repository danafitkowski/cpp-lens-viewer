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
 * Anonymization is on for every run. The choice is held in this render only:
 * it is never saved, so every page load and every new render of this section
 * starts with it on, and it switches back on after each run made with it off.
 * A run with it off is submitted only after the user confirms a warning that
 * says what is uploaded, who can open the report, and how long it is kept
 * (audit finding, 21 Nov 2026: the screen promised that activity names never
 * leave the browser, which was false with anonymization off, and the off
 * choice persisted in localStorage for later sessions).
 *
 * The anon map never leaves the browser; only SHA-256(map) is sent so the
 * result can be receipt-validated locally. The hash is taken after BOTH models
 * are tokenized, so it covers everything that was actually uploaded.
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
import { buildResultPanel } from './deep-forensic-result.js';
import { SAMPLE_FILENAME, SAMPLE_DEMO_FRAGNETS } from '../sample/sample-schedule.js';
import { LENS_VERSION } from '../version.js';

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE ERROR TRANSLATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate a raw Engine schema error into plain-language guidance.
 *
 * The Engine's adapters refuse a run that is missing tool-specific options with
 * messages like "time-impact-analysis requires options.fragnets: list of {id,
 * name, liability, activities, ties}". Shown raw, that is a dead end: the
 * viewer has no fragnet UI, so the user is told to supply a data structure they
 * have no way to enter. Every known "requires options..." message is mapped
 * here to what the user should actually do instead; an unrecognized
 * "requires options.X" still gets a generic translation naming the missing
 * input. Messages that are not schema refusals pass through untranslated.
 *
 * Exported for tests (tests/sections/deep-forensic-error-translation.test.js).
 *
 * @param {string} message - raw Engine error text
 * @returns {string|null} plain-language guidance, or null when the message is
 *   not a recognized schema error (caller shows the raw message instead)
 */
export function translateEngineError(message) {
  const msg = String(message || '');
  if (/requires options\.fragnets/i.test(msg)) {
    return 'Time Impact Analysis needs a fragnet: the delay event to insert, ' +
      'with its activities and logic ties into the schedule. The viewer does ' +
      'not have a fragnet builder yet. Load the built-in sample schedule to ' +
      'run a canned demo fragnet, or pick another tool from the list.';
  }
  if (/requires options\.delay_events/i.test(msg)) {
    return 'Collapsed As-Built needs a list of delay events to remove from ' +
      'the as-built schedule: which activities each event affected and by how ' +
      'many days. The viewer does not have a delay-event editor yet. Pick ' +
      'another tool from the list, or contact CPP to run this method on your schedule.';
  }
  const generic = msg.match(/requires options\.([A-Za-z0-9_]+)/i);
  if (generic) {
    return `This analysis needs an extra input the viewer cannot collect yet (${generic[1]}). ` +
      'Pick another tool from the list, or contact CPP to run it on your schedule.';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WHAT HAPPENS TO AN UPLOAD (server facts, stated once)
// ─────────────────────────────────────────────────────────────────────────────

// Read from cpp-forensic-mcp, not assumed:
//   - Reports: written to <data dir>/lens-jobs/<jobId>/result.html (or .json)
//     on the server's persistent volume (lens/dispatcher.py _persist_result,
//     lens/storage.py jobs_dir), and swept once they are older than
//     CPP_LENS_RESULT_TTL_DAYS, default 365, at boot and then daily
//     (serve_http.py, lens/storage.py prune_old_job_dirs, lens/db.py
//     prune_old_jobs). Nothing in that path looks at whether the run was
//     anonymized.
//   - Access: GET /lens/r/<jobId> serves a finished report to anyone who asks
//     for it by id (lens/facade.py lens_result). There is no account or
//     password; the id is 22 random URL-safe characters (lens/jobs.py).
//   - The uploaded XER: written to a temp file for the run and deleted when
//     the analysis finishes (lens/dispatcher.py _run_in_worker).
// If the server's TTL changes, this number changes with it.
export const REPORT_RETENTION_DAYS = 365;

/** What is uploaded, who can open the report, and how long it is kept. True
 *  in both states; exported so tests pin the words the user reads. */
export function uploadPrivacyText(anonymize) {
  const what = anonymize
    ? 'Anonymization is on. Before upload, this browser replaces activity names, ' +
      'WBS names, resource names, notes, the project name and other free text with ' +
      'tokens, and the list that maps the tokens back to names stays in this browser. ' +
      'Activity IDs (codes), dates, durations, logic and calendars are uploaded as ' +
      'they are; if your activity IDs contain names, those are uploaded too.'
    : 'Anonymization is off. Activity names and activity IDs (codes), WBS names, ' +
      'resource names, notes and the project name are uploaded as they appear in ' +
      'your file, and the report can show them.';
  return what + ' ' +
    `The report is kept on the CPP server for ${REPORT_RETENTION_DAYS} days after the run, ` +
    'then deleted. Anyone who has its link can open it; there is no password. ' +
    'The uploaded XER is deleted from the server when the run finishes.';
}

/** The warning shown, and confirmed, before a run with anonymization off. */
export function identifiableWarningText({ hasBaseline } = {}) {
  const files = hasBaseline ? 'both files (the schedule and the baseline)' : 'your file';
  return 'Anonymization is off for this run. Activity names and activity IDs (codes), ' +
    'WBS names, resource names, notes and the project name in ' + files + ' will be ' +
    'uploaded to the CPP Engine as they are, and the report can show them. ' +
    'Anyone who has the report’s link can open it; there is no password. ' +
    `The report is kept on the CPP server for ${REPORT_RETENTION_DAYS} days after the run, then deleted. ` +
    'Anonymization switches back on after this run.';
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

// Presentation only. Whether a tool needs two files is NOT restated here — it
// is read from ENGINE_TOOLS in ../mcp/client.js, the one place that knows the
// Engine's contract, so the picker and the transport can never disagree.
//
// `availability` says who can actually run a tool from this screen:
//   'demo'    — Time Impact Analysis needs a fragnet and the viewer cannot
//               build one. The only fragnet it has is the built-in sample's
//               demo fragnet, so TIA runs on the sample and nothing else.
//   'analyst' — Collapsed As-Built needs a list of delay events and the viewer
//               cannot collect one, so it never runs from here.
// Both used to be selectable for a user's own file, and the run then failed
// on the missing input (audit finding, 21 Nov 2026).
export const TOOL_AVAILABILITY_TEXT = {
  demo: 'Demo only: runs on the built-in sample schedule and its demo fragnet.',
  analyst: 'Analyst / API only: needs delay-event inputs the viewer cannot collect.'
};

export const TOOL_UNAVAILABLE_TEXT = {
  demo: 'Not available for your own schedule. Time Impact Analysis needs a fragnet ' +
    '(the delay event to insert, with its activities and logic ties), and the viewer ' +
    'cannot build one. Load the built-in sample schedule to see it run on the demo ' +
    'fragnet, or ask CPP to run a TIA on your schedule.',
  analyst: 'Not available in the viewer. Collapsed As-Built needs a list of delay events ' +
    '(which activities each event affected, and by how many days), and the viewer cannot ' +
    'collect one. A CPP analyst can run it on your schedule, or it can be called through ' +
    'the CPP Engine API with those inputs.'
};

export const TOOLS = [
  {
    id:          'forensic-delay-analysis',
    title:       'Windows Analysis',
    label:       'MIP 3.3',
    description: 'Contemporaneous Period Analysis: measure how far completion moved in each window and which activities drove it. Who is responsible is for the analyst to decide from the project records.'
  },
  {
    id:          'time-impact-analysis',
    title:       'Time Impact Analysis',
    label:       'MIP 3.7',
    availability: 'demo',
    description: 'Prospective fragnet insertion: quantify the impact of a specific event on project completion.'
  },
  {
    id:          'collapsed-as-built',
    title:       'Collapsed As-Built',
    label:       'MIP 3.8',
    availability: 'analyst',
    description: 'Remove excusable delays from as-built to show a compressed but-for completion date.'
  },
  {
    id:          'claim-workbench',
    title:       'Claim Workbench',
    label:       'Forensic',
    description: 'Mixed evidence ledger: chain-of-custody diff, trust scoring, and slip-to-evidence linkage.'
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

  // On for every render. Never read from or written to saved preferences: an
  // opt-out applies to the run it was made for and no other.
  let anonymize = true;

  const hasBaseline = !!B;

  // Built-in sample detection: the sample loader stamps SAMPLE_FILENAME on the
  // model, and with the sample loaded, Time Impact Analysis runs the canned
  // demo fragnet automatically (see SAMPLE_DEMO_FRAGNETS). Without this, the
  // default first click on Run could never succeed: TIA is the pre-selected
  // tool when no baseline is loaded, and the Engine refuses TIA with no fragnet.
  const isSample = !!(A && A.filename === SAMPLE_FILENAME);

  // ── Explainer card ──────────────────────────────────────────────────────────
  // The upload paragraph is rewritten whenever the toggle changes, so what it
  // says is true for the state the user is looking at. "Your activity names
  // never leave the browser" used to be printed here unconditionally.
  const privacyNote = h('p', { id: 'deep-forensic-privacy-note' }, uploadPrivacyText(true));
  const explainerCard = h('div', { class: 'lens-card' }, [
    h('h3', {}, 'Run Deep Forensic Analysis'),
    h('p', {},
      'Submit your schedule to the CPP Engine for a forensic analysis.  ' +
      'Rate-limited to 25 runs per day per IP address.'
    ),
    privacyNote,
    h('p', { style: { color: '#555', fontSize: '13px' } },
      'Separately, the server logs each run for operations: the tool, its status and ' +
      'timing, whether the file was anonymized, the viewer version, and a hash of your ' +
      'IP address. That log holds no schedule content.'
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
          'Both files are submitted: the current schedule (A) and the baseline (B).  ' +
          'With anonymization on they are tokenized under one map, so the same activity ' +
          'carries the same token in each file and the reported SHA-256 covers both.'
        )
      ]
    : [
        h('h3', {}, 'Baseline: none loaded'),
        h('p', {},
          'Only the current schedule (A) will be submitted.  ' +
          'Tools that compare a baseline against the current schedule are disabled below.  ' +
          'Load a second XER in the sidebar to enable them.'
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

  const anonLabel = h('label', {
    for: 'deep-forensic-anon-toggle',
    style: { cursor: 'pointer', fontWeight: '600' }
  }, 'Anonymize XER before upload (on for every run)');

  // Shown while the box is unchecked. The full warning, with the confirm
  // button, comes when Run is clicked; nothing is sent before that.
  const anonOffNote = h('p', {
    id: 'deep-forensic-anon-off-note',
    style: { color: '#B45309', fontSize: '13px', fontWeight: '600', margin: '6px 0 0' }
  }, 'Off: activity names and codes will be uploaded for the next run. You will be ' +
     'asked to confirm before anything is sent, and anonymization switches back on after the run.');

  // ── Confirmation before an identifiable submission ──────────────────────────
  const confirmSlot = h('div', {});

  function hideConfirm() { clear(confirmSlot); }

  function syncAnon() {
    anonCheckbox.checked = anonymize;
    anonOffNote.style.display = anonymize ? 'none' : '';
    privacyNote.textContent = uploadPrivacyText(anonymize);
    if (anonymize) hideConfirm();
  }

  anonCheckbox.addEventListener('change', () => {
    // Held in this closure only. It used to be written to prefsStore, which
    // saves to localStorage, so an opt-out outlived the session it was made in.
    anonymize = anonCheckbox.checked;
    syncAnon();
  });

  const anonRow = h('div', { class: 'lens-card' }, [
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
      [anonCheckbox, anonLabel]),
    anonOffNote
  ]);

  // ── Tool picker ─────────────────────────────────────────────────────────────
  // A tool that needs two files cannot be selected with one. The default falls
  // to the first tool that can actually run rather than silently substituting a
  // different analysis behind a disabled radio.
  // A tool is also unavailable when the viewer cannot supply its inputs: TIA
  // off the sample (no fragnet), Collapsed As-Built always (no delay events).
  const unavailableReason = (tool) => {
    if (tool.availability === 'analyst') return TOOL_UNAVAILABLE_TEXT.analyst;
    if (tool.availability === 'demo' && !isSample) return TOOL_UNAVAILABLE_TEXT.demo;
    return null;
  };
  const needsBaseline = (tool) => toolRequiresBaseline(tool.id) && !hasBaseline;
  const blocked = (tool) => needsBaseline(tool) || !!unavailableReason(tool);
  let selectedTool = (TOOLS.find(t => !blocked(t)) || TOOLS[0]).id;

  // ── Demo fragnet card (sample schedule + Time Impact Analysis only) ─────────
  // TIA needs a fragnet and the viewer has no fragnet builder, so the sample
  // ships with a canned one. This card says exactly what will be submitted, in
  // the words the run will use, BEFORE the click. Hidden whenever another tool
  // is selected; never rendered for a user-loaded schedule.
  const demoFragnet = SAMPLE_DEMO_FRAGNETS[0];
  const demoFragnetCard = isSample
    ? h('div', {
        class: 'lens-card',
        id: 'deep-forensic-demo-fragnet',
        style: { borderLeft: '4px solid #0F2540' }
      }, [
        h('h3', {}, 'Demo fragnet (sample schedule)'),
        h('p', {},
          'Time Impact Analysis needs a delay event (a fragnet) to insert. ' +
          'The built-in sample runs with a canned demo fragnet: ' +
          demoFragnet.name.replace(/^Demo fragnet: /, '') + '. It inserts ' +
          `${demoFragnet.activities[0].duration_days} working days of rework ` +
          'between Metal Stud Framing (A3010) and Electrical Rough-In (A4000) ' +
          'on the critical path, so the result shows a real impacted ' +
          'completion date. This is the only fragnet the viewer has: with your ' +
          'own schedule loaded, Time Impact Analysis is not available here.')
      ])
    : null;

  function syncDemoFragnetCard() {
    if (!demoFragnetCard) return;
    demoFragnetCard.style.display =
      (selectedTool === 'time-impact-analysis') ? '' : 'none';
  }

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
      syncDemoFragnetCard();
    });
    radioInputs.push(radio);

    const labelChildren = [
      h('strong', {}, `${tool.title} `),
      h('span', {
        style: { fontSize: '11px', background: '#0F2540', color: '#fff',
                 padding: '1px 6px', borderRadius: '3px', marginRight: '6px' }
      }, tool.label)
    ];
    if (tool.availability) {
      labelChildren.push(h('span', {
        class: 'deep-forensic-availability',
        'data-availability': tool.availability,
        style: { fontSize: '11px', background: '#FEF3C7', color: '#92400E',
                 padding: '1px 6px', borderRadius: '3px', marginRight: '6px' }
      }, tool.availability === 'demo' ? 'Demo only' : 'Analyst / API only'));
    }
    labelChildren.push(h('br', {}));
    labelChildren.push(h('span', { style: { color: '#555', fontSize: '13px' } }, tool.description));
    if (tool.availability) {
      labelChildren.push(h('br', {}));
      labelChildren.push(h('span', {
        style: { color: '#555', fontSize: '12px' }
      }, TOOL_AVAILABILITY_TEXT[tool.availability]));
    }
    const reason = unavailableReason(tool);
    if (isBlocked) {
      labelChildren.push(h('br', {}));
      labelChildren.push(h('span', {
        class: 'deep-forensic-blocked-reason',
        style: { color: '#B45309', fontSize: '13px', fontWeight: '600' }
      }, reason || 'Requires a baseline XER. Load a second file (B) in the sidebar.'));
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
  // Click → gates → (anonymization off: warning + explicit confirm) → submit.
  async function onRunClick() {
    // Second gate, behind the disabled radio: a two-file method never gets
    // submitted with one file, whatever the UI state got into.
    if (toolRequiresBaseline(selectedTool) && !B) {
      clear(resultPanelSlot);
      setStatus(
        'This analysis compares a baseline against the current schedule. ' +
        'Load a baseline XER (file B) in the sidebar first.',
        '#C8392F'
      );
      return;
    }
    // Same for a tool the viewer cannot supply inputs for.
    const tool = TOOLS.find(t => t.id === selectedTool);
    const reason = tool ? unavailableReason(tool) : null;
    if (reason) {
      clear(resultPanelSlot);
      setStatus(reason, '#C8392F');
      return;
    }

    if (!anonymize) {
      // Nothing is sent until the user confirms this, for this run.
      showIdentifiableConfirm();
      return;
    }
    await submitRun();
  }

  function showIdentifiableConfirm() {
    hideConfirm();
    clear(resultPanelSlot);
    clear(statusArea);
    const confirmBtn = h('button', {
      id: 'deep-forensic-confirm-identifiable',
      style: {
        background: '#B45309', color: '#fff', padding: '8px 16px', border: 'none',
        borderRadius: '4px', cursor: 'pointer', fontWeight: '700', marginRight: '8px'
      },
      onclick: async () => { hideConfirm(); await submitRun(); }
    }, 'Upload with names and codes');
    const cancelBtn = h('button', {
      id: 'deep-forensic-cancel-identifiable',
      style: {
        background: '#fff', color: '#0F2540', padding: '8px 16px',
        border: '1px solid #0F2540', borderRadius: '4px', cursor: 'pointer', fontWeight: '700'
      },
      onclick: () => {
        anonymize = true;
        syncAnon();
        setStatus('Cancelled. Nothing was uploaded; anonymization is back on.');
      }
    }, 'Cancel and turn anonymization back on');
    confirmSlot.appendChild(h('div', {
      class: 'lens-card',
      id: 'deep-forensic-identifiable-warning',
      role: 'alert',
      style: { borderLeft: '4px solid #B45309', marginTop: '12px' }
    }, [
      h('h3', {}, 'Upload without anonymization?'),
      h('p', {}, identifiableWarningText({ hasBaseline: !!B })),
      h('div', {}, [confirmBtn, cancelBtn])
    ]));
  }

  async function submitRun() {
    const identifiable = !anonymize;
    runBtn.disabled = true;
    runBtn.style.opacity = '0.7';

    try {
      setStatus(!identifiable ? 'Anonymizing XER...' : 'Preparing XER...');

      let xerModel = A;
      let baselineModel = B || null;
      let anonMapSha256 = '';

      if (!identifiable) {
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

      // Tool-specific options. The ONLY case the viewer can fill today is the
      // built-in sample running TIA, which submits the canned demo fragnet
      // announced in the card above. The anonymizer preserves task_code (it
      // tokenizes names/memos only; see ../mcp/anonymizer.js), so the
      // fragnet's ties still resolve against the uploaded file with
      // anonymization on.
      const options = (isSample && selectedTool === 'time-impact-analysis')
        ? { fragnets: SAMPLE_DEMO_FRAGNETS, project_name: 'CPP Lens sample (demo fragnet)' }
        : {};

      const result = await runDeepForensic({
        tool:          selectedTool,
        xerBase64,
        xerBaselineBase64,
        anonymized:    !identifiable,
        anonMapSha256,
        options,
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
          'Daily limit reached. Try again tomorrow or contact us for engagement-grade access.',
          '#B45309'
        );
      } else if (result.status === 'done' && result.resultUrl) {
        clear(resultPanelSlot);
        resultPanelSlot.appendChild(buildResultPanel({
          jobId: result.jobId, resultUrl: result.resultUrl
        }));
        setStatus('Done. Result below; use Share to send a link.', '#15803D');
      } else {
        clear(resultPanelSlot);
        const detail = (result.errors && result.errors[0]) || `status: ${result.status}`;
        throw new Error(detail);
      }

    } catch (err) {
      clear(resultPanelSlot);
      // Known Engine schema refusals become plain-language guidance; anything
      // else surfaces as-is so a real failure is never papered over.
      const raw = (err && err.message) ? err.message : 'unknown error';
      const friendly = translateEngineError(raw);
      setStatus(friendly ? friendly : 'Run failed: ' + raw, '#C8392F');
    } finally {
      runBtn.disabled = false;
      runBtn.style.opacity = '1';
      // An opt-out covers the run it was confirmed for, nothing after it.
      if (identifiable) {
        anonymize = true;
        syncAnon();
      }
    }
  }

  const runBtn = h('button', {
    style: {
      background: '#C8392F', color: '#fff', padding: '12px 28px',
      border: 'none', borderRadius: '4px', cursor: 'pointer',
      fontWeight: '700', fontSize: '15px', marginTop: '12px'
    },
    onclick: onRunClick
  }, 'Run Deep Forensic');

  syncDemoFragnetCard();
  syncAnon();

  return h('div', { class: 'lens-section-content' }, [
    h('h2', {}, 'Deep Forensic'),
    explainerCard,
    baselineCard,
    anonRow,
    toolPickerCard,
    ...(demoFragnetCard ? [demoFragnetCard] : []),
    runBtn,
    confirmSlot,
    statusArea,
    resultPanelSlot
  ]);
}
