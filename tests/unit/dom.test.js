// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { h, on, bySelector, clear, mount } from '../../src/lib/dom.js';

describe('dom kit', () => {
  it('h() creates an element with text and attrs', () => {
    const el = h('div', { class: 'foo', id: 'bar' }, 'hello');
    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('foo');
    expect(el.id).toBe('bar');
    expect(el.textContent).toBe('hello');
  });

  it('h() accepts child elements', () => {
    const child = h('span', {}, 'inner');
    const parent = h('div', {}, child);
    expect(parent.children[0]).toBe(child);
  });

  it('h() accepts an array of children', () => {
    const parent = h('div', {}, [h('p', {}, 'a'), h('p', {}, 'b')]);
    expect(parent.children).toHaveLength(2);
  });

  it('on() attaches a click handler and returns an off function', () => {
    let clicked = 0;
    const el = h('button', {}, 'go');
    const off = on(el, 'click', () => clicked++);
    el.click();
    expect(clicked).toBe(1);
    off();
    el.click();
    expect(clicked).toBe(1);
  });

  it('clear() removes all children', () => {
    const el = h('div', {}, [h('p'), h('p')]);
    clear(el);
    expect(el.children).toHaveLength(0);
  });

  it('mount() replaces children with new content', () => {
    const root = h('div', {}, [h('p', {}, 'old')]);
    mount(root, h('span', {}, 'new'));
    expect(root.textContent).toBe('new');
  });

  it('bySelector returns first match scoped to root', () => {
    const root = h('div', {}, [h('p', { class: 'x' }, 'one'), h('p', { class: 'x' }, 'two')]);
    document.body.appendChild(root);
    expect(bySelector('.x', root).textContent).toBe('one');
    document.body.removeChild(root);
  });
});
