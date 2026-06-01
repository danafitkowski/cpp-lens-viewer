import { describe, it, expect } from 'vitest';
import { parseUploadedFile } from '../../src/shell/sidebar.js';
import { getTable } from '@criticalpathpartners/lens-parser';

// Minimal File-like exposing just what parseUploadedFile uses.
function fileOf(bytes, name, sizeOverride) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    name,
    size: sizeOverride != null ? sizeOverride : u8.length,
    async arrayBuffer() { return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); },
    async text() { return new TextDecoder('utf-8').decode(u8); },
  };
}
const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));

describe('FX-032: upload size cap (reject before reading into memory)', () => {
  it('rejects an oversize XER at 60 MB', async () => {
    const f = fileOf(new Uint8Array(8), 'huge.xer', 200 * 1024 * 1024);
    await expect(parseUploadedFile(f)).rejects.toThrow(/caps XER\/XML uploads at 60 MB/);
  });
  it('rejects an oversize .mpp at 100 MB', async () => {
    const f = fileOf(new Uint8Array(8), 'huge.mpp', 150 * 1024 * 1024);
    await expect(parseUploadedFile(f)).rejects.toThrow(/caps MPP uploads at 100 MB/);
  });
});

describe('FX-031: encoding detection (cp1252 fallback, not UTF-8)', () => {
  it('decodes a no-BOM cp1252 XER as windows-1252, not mojibake', async () => {
    const bytes = new Uint8Array([
      ...ascii('%T\tTASK\n%F\ttask_id\ttask_code\ttask_name\n%R\t1\tA100\tCaf'),
      0xE9,             // é (cp1252)
      0x20, 0x96, 0x20, // " – " (cp1252 en-dash 0x96)
      ...ascii('end\n%E\n'),
    ]);
    const model = await parseUploadedFile(fileOf(bytes, 'client.xer'));
    const name = getTable(model, 'TASK')[0].task_name;
    expect(name).toContain('é');     // accented letter decoded as cp1252, not the UTF-8 mojibake
    expect(name).not.toContain('�'); // old file.text() (UTF-8) produced replacement chars here
    // (en-dash 0x96 → U+2013 in a real browser's windows-1252; Node's TextDecoder
    //  leaves the C1 range at U+0096, so we don't assert the exact glyph here.)
  });

  it('honours + strips a UTF-8 BOM', async () => {
    const bytes = new Uint8Array([
      0xEF, 0xBB, 0xBF,
      ...ascii('%T\tTASK\n%F\ttask_id\ttask_code\n%R\t1\tA1\n%E\n'),
    ]);
    const model = await parseUploadedFile(fileOf(bytes, 'bom.xer'));
    expect(getTable(model, 'TASK').length).toBe(1);
  });
});
