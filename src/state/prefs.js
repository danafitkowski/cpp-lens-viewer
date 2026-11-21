import { Store } from './model.js';

const KEY = 'cpp-lens-prefs-v1';

// Keys that must never be read from or written to storage. The Deep Forensic
// anonymize choice used to live here as `anonymizeOnMcpUpload`, so one click
// to turn it off stayed off for every later session in that browser, and the
// next upload sent activity names without the user choosing that again (audit
// finding, 21 Nov 2026). Anonymization is now on for every run, held in the
// section itself (src/sections/deep-forensic.js), and an old saved `false` is
// dropped on load so it can never switch it off again.
const NEVER_PERSISTED = ['anonymizeOnMcpUpload'];

function strip(prefs) {
  if (!prefs || typeof prefs !== 'object') return prefs;
  const out = { ...prefs };
  for (const k of NEVER_PERSISTED) delete out[k];
  return out;
}

function load() {
  try {
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(KEY) : null;
    return raw ? strip(JSON.parse(raw)) : null;
  } catch { return null; }
}

function save(prefs) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(strip(prefs)));
  } catch { /* ignore */ }
}

const DEFAULT_PREFS = {
  longDurationDays: 20,
  // Working days, like longDurationDays beside it — not `largeFloatHours: 320`,
  // which was 40 days only on an 8 hr/day calendar. Nothing reads this yet; it
  // is stated in days now so that whatever wires it up cannot inherit the
  // baked-in 8 the section thresholds have just been rid of. The conversion,
  // when it is needed, is sections/_shared/working-days.js and nowhere else.
  largeFloatDays: 40,
  largeDateShiftDays: 5,
  projectHealthTarget: 80,
  dashboardLayout: ['total-activities', 'pct-complete', 'critical-pct']
};

export const prefsStore = new Store(load() || DEFAULT_PREFS);

prefsStore.subscribe(save);

// Exported for tests: the load path, so a test can prove that a saved
// `anonymizeOnMcpUpload: false` from an older build is ignored on the next
// page load.
export { load as loadPrefsFromStorage, KEY as PREFS_STORAGE_KEY };
