// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { download } from '../../src/lib/download.js';

describe('download', () => {
  let createdAnchors;
  let origCreate;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    createdAnchors = [];
    origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') { createdAnchors.push(el); el.click = vi.fn(); }
      return el;
    });
    // Stub URL.createObjectURL / revokeObjectURL if missing in happy-dom
    if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:test';
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  });

  it('creates an anchor with download attribute and clicks it', () => {
    download('hello world', 'test.txt', 'text/plain');
    expect(createdAnchors.length).toBe(1);
    expect(createdAnchors[0].download).toBe('test.txt');
    expect(createdAnchors[0].click).toHaveBeenCalled();
  });

  it('defaults mime type to application/octet-stream', () => {
    download('data', 'file.bin');
    expect(createdAnchors.length).toBe(1);
    expect(createdAnchors[0].download).toBe('file.bin');
  });
});
