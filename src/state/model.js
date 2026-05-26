/**
 * Minimal event-emitter state holder. Every viewer state slice uses this.
 */
export class Store {
  constructor(initial) {
    this._state = initial;
    this._listeners = new Set();
  }
  get() { return this._state; }
  set(next) {
    this._state = next;
    for (const fn of this._listeners) fn(this._state);
  }
  update(reducer) {
    this.set(reducer(this._state));
  }
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
}

/** Two parsed-XER slots: A is current/update, B is baseline/previous. */
export const modelStore = new Store({ A: null, B: null });
