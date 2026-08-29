// @vitest-environment happy-dom
//
// The file inputs accept .xer / .xml / .mpp / .txt, but were labelled
// "Current / update XER" — a user with an XML or MPP export had no way to know
// the loader takes them. The labels now state the formats, and the note under
// them states the one privacy-relevant difference: MPP is converted on the CPP
// server, XER/XML never leave the browser. Also pins the sample loader to
// SAMPLE_FILENAME, which the Deep Forensic demo fragnet keys on.
import { describe, it, expect, afterEach } from 'vitest';
import { renderSidebar } from '../../src/shell/sidebar.js';
import { modelStore } from '../../src/state/model.js';
import { SAMPLE_FILENAME } from '../../src/sample/sample-schedule.js';

afterEach(() => { modelStore.set({ A: null, B: null }); });

describe('sidebar file-box labels', () => {
  it('labels both inputs with the formats they actually accept', () => {
    const el = renderSidebar();
    const labels = [...el.querySelectorAll('.file-box label')].map(l => l.textContent);
    expect(labels).toContain('Current schedule (XER / XML / MPP)');
    expect(labels).toContain('Baseline schedule (XER / XML / MPP, optional)');
    // and the accept attribute still matches the promise on the label
    expect(el.querySelector('#lens-file-a').getAttribute('accept')).toBe('.xer,.xml,.mpp,.txt');
  });

  it('says where MPP goes and where XER/XML stay', () => {
    const el = renderSidebar();
    const note = el.querySelector('.file-box .file-box-note');
    expect(note).toBeTruthy();
    expect(note.textContent).toContain('MPP files are converted to P6 format on the CPP server');
    expect(note.textContent).toContain('read entirely in the browser');
  });

  it('the sample loader stamps SAMPLE_FILENAME on the model', () => {
    const el = renderSidebar();
    const sampleBtn = [...el.querySelectorAll('button')].find(b => /load a sample schedule/i.test(b.textContent));
    expect(sampleBtn).toBeTruthy();
    sampleBtn.dispatchEvent(new Event('click'));
    const { A } = modelStore.get();
    expect(A).toBeTruthy();
    expect(A.filename).toBe(SAMPLE_FILENAME);
  });
});
