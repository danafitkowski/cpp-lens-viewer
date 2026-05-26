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
  largeFloatHours: 320,
  largeDateShiftDays: 5,
  projectHealthTarget: 80,
  dashboardLayout: ['total-activities', 'pct-complete', 'critical-pct']
};

export const prefsStore = new Store(load() || DEFAULT_PREFS);

prefsStore.subscribe(save);
