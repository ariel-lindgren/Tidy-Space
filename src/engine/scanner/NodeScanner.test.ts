import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FLAG, KIND, NO_PARENT } from '../snapshot';
import { NodeScanner } from './NodeScanner';
import type { ScanOptions } from './Scanner';

let root: string;
const write = (rel: string, bytes: number) => {
  const full = path.join(root, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, Buffer.alloc(bytes, 7));
};
const options = (extra: Partial<ScanOptions> = {}): ScanOptions => ({
  root,
  threads: 2,
  followSymlinks: false,
  oneFilesystem: true,
  hardLinks: true,
  includeHidden: true,
  excludes: [],
  ...extra,
});

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-'));
  write('a.bin', 100);
  write('sub/b.bin', 250);
  write('sub/deep/c.txt', 30);
  write('other/d.tmp', 5);
  mkdirSync(path.join(root, 'empty'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('NodeScanner', () => {
  it('produz snapshot em pré-ordem com todos os bytes', async () => {
    const progress: number[] = [];
    const s = await new NodeScanner().scan(options(), p => progress.push(p.bytes), new AbortController().signal);
    expect(s.names).toHaveLength(9);
    expect(s.sizes.reduce((a, b) => a + b, 0)).toBe(385);
    expect(s.parents[0]).toBe(NO_PARENT);
    for (let i = 1; i < s.names.length; i++) expect(s.parents[i]).toBeLessThan(i);
    expect(s.kinds[0]).toBe(KIND.dir);
    // Progresso conta bytes em disco; cada arquivo ocupa ao menos o próprio conteúdo.
    expect(progress.at(-1)).toBe(s.allocated.reduce((a, b) => a + b, 0));
    expect(s.allocated.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(385);
    expect(s.flags.every(f => f === 0)).toBe(true);
  });

  it('aplica exclusões', async () => {
    const s = await new NodeScanner().scan(
      options({ excludes: ['deep', '*.tmp'] }),
      () => {},
      new AbortController().signal,
    );
    expect(s.sizes.reduce((a, b) => a + b, 0)).toBe(350);
  });

  it('respeita cancelamento', async () => {
    const controller = new AbortController();
    controller.abort();
    const s = await new NodeScanner().scan(options(), () => {}, controller.signal);
    expect(s.cancelled).toBe(true);
    expect(s.names).toHaveLength(1);
  });

  it('falha quando a raiz não existe', async () => {
    await expect(
      new NodeScanner().scan(options({ root: path.join(root, 'nope') }), () => {}, new AbortController().signal),
    ).rejects.toThrow();
  });

  it('conta hard links uma vez só e marca todos os nomes', async () => {
    linkSync(path.join(root, 'sub', 'b.bin'), path.join(root, 'other', 'b-link.bin'));
    const s = await new NodeScanner().scan(options(), () => {}, new AbortController().signal);
    expect(s.sizes.reduce((a, b) => a + b, 0)).toBe(385);
    for (const name of ['b.bin', 'b-link.bin']) expect(s.flags[s.names.indexOf(name)]! & FLAG.hardlink).toBeTruthy();
    const off = await new NodeScanner().scan(options({ hardLinks: false }), () => {}, new AbortController().signal);
    expect(off.sizes.reduce((a, b) => a + b, 0)).toBe(635);
  });

  it.runIf(process.platform === 'win32')('não segue junctions', async () => {
    symlinkSync(path.join(root, 'sub'), path.join(root, 'junction'), 'junction');
    const s = await new NodeScanner().scan(options(), () => {}, new AbortController().signal);
    expect(s.kinds[s.names.indexOf('junction')]).toBe(KIND.symlink);
    expect(s.names.filter(n => n === 'b.bin')).toHaveLength(1);
  });

  it.skipIf(process.platform === 'win32')('não segue links simbólicos por padrão', async () => {
    symlinkSync(path.join(root, 'sub'), path.join(root, 'link'));
    const s = await new NodeScanner().scan(options(), () => {}, new AbortController().signal);
    expect(s.kinds[s.names.indexOf('link')]).toBe(KIND.symlink);
    expect(s.names.filter(n => n === 'b.bin')).toHaveLength(1);
  });
});
