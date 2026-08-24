import { Store } from './model.js';

const KEY = 'cpp-lens-prefs-v1';

function load() {
  try {
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(KEY) : null;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(prefs) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

const DEFAULT_PREFS = {
  anonymizeOnMcpUpload: true,
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
