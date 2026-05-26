import { describe, it, expect, vi } from 'vitest';
import { Store } from '../../src/state/model.js';

describe('Store', () => {
  it('starts with the given initial state', () => {
    const s = new Store({ count: 0 });
    expect(s.get().count).toBe(0);
  });

  it('set() updates state and notifies subscribers', () => {
    const s = new Store({ count: 0 });
    const cb = vi.fn();
    s.subscribe(cb);
    s.set({ count: 1 });
    expect(s.get().count).toBe(1);
    expect(cb).toHaveBeenCalledWith({ count: 1 });
  });

  it('update() applies a reducer function', () => {
    const s = new Store({ count: 0 });
    s.update(prev => ({ ...prev, count: prev.count + 1 }));
    expect(s.get().count).toBe(1);
  });

  it('unsubscribe removes the listener', () => {
    const s = new Store({ count: 0 });
    const cb = vi.fn();
    const off = s.subscribe(cb);
    off();
    s.set({ count: 1 });
    expect(cb).not.toHaveBeenCalled();
  });
});
