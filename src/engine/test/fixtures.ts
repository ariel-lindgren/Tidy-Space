import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotFromTree, type TreeEntry } from '../snapshot';
import { TreeIndex } from '../tree/TreeIndex';

export const DAY = 86_400_000;
export const NOW = Date.now();

/**
 * Árvore de exemplo (estilo Windows). Totais — lógico 16.915, em disco 9.915, só na nuvem 7.000;
 * 7 arquivos e 5 pastas. `nuvem.mp4` é um placeholder do OneDrive (0 bytes no disco).
 */
export const SAMPLE: TreeEntry = {
  name: '',
  children: [
    { name: 'big.iso', size: 5000, mtime: NOW - 400 * DAY },
    {
      name: 'Videos',
      children: [
        { name: 'a.mp4', size: 3000, mtime: NOW - 10 * DAY },
        { name: 'b.mkv', size: 1000, mtime: NOW - 2 * DAY },
        { name: 'nuvem.mp4', size: 7000, cloud: true, mtime: NOW - DAY },
      ],
    },
    {
      name: 'proj',
      children: [
        { name: 'src', children: [{ name: 'index.ts', size: 10, mtime: NOW - DAY }] },
        { name: 'node_modules', children: [{ name: 'lib.js', size: 900, mtime: NOW - DAY }] },
      ],
    },
    { name: 'empty', children: [] },
    { name: 'notes.txt', size: 5, mtime: NOW - 500 * DAY },
  ],
};

export const ROOT = 'C:\\data';

export function sampleIndex(tree: TreeEntry = SAMPLE, root = ROOT): TreeIndex {
  return new TreeIndex(snapshotFromTree(root, tree), { separator: '\\', caseInsensitive: true });
}

export function idOf(index: { find(p: string): number | null }, p: string): number {
  const id = index.find(p);
  if (id === null) throw new Error(`não achou ${p}`);
  return id;
}

export function tempDir(prefix = 'tidyspace-'): { dir: string; cleanup(): void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
