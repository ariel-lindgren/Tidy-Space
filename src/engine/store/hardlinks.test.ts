import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { snapshotFromTree, type TreeEntry } from '../snapshot';
import { computeSuggestions } from '../suggestions/computeSuggestions';
import { tempDir } from '../test/fixtures';
import { TreeIndex } from '../tree/TreeIndex';
import { ScanReader } from './ScanReader';
import { writeScan } from './writeScan';

const NOW = Date.UTC(2026, 8, 30);
const old = NOW - 400 * 86_400_000;
const ROOT = 'C:\\Users\\ana';
const env = {
  platform: 'win32',
  home: ROOT,
  tmpDir: 'C:\\Temp',
  localAppData: `${ROOT}\\AppData\\Local`,
  now: NOW,
};
const meta = { engine: 'native' as const, elapsedMs: 1, finishedAt: NOW, errorCount: 0, issues: [], volume: null };

/**
 * Layout do pnpm: o conteúdo real mora no store e os node_modules dos projetos são hard links
 * para ele. O scanner conta o conteúdo uma vez (no primeiro nome visto) e marca todos os nomes.
 */
const tree: TreeEntry = {
  name: '',
  children: [
    {
      name: 'pnpm-app',
      children: [
        { name: 'package.json', size: 1, mtime: old },
        {
          name: 'node_modules',
          mtime: old,
          children: [
            {
              name: '.pnpm',
              children: [
                // Primeiro nome visto: carrega os bytes; marcado como compartilhado.
                { name: 'lib.js', size: 5000, hardlink: true },
                { name: 'lock.yaml', size: 100 },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'npm-app',
      children: [
        { name: 'package.json', size: 1, mtime: old },
        { name: 'node_modules', mtime: old, children: [{ name: 'dep.js', size: 3000 }] },
      ],
    },
    {
      name: 'AppData',
      children: [
        {
          name: 'Local',
          children: [
            {
              name: 'pnpm',
              children: [
                {
                  name: 'store',
                  children: [
                    // Mesmo conteúdo do lib.js: já contado, aparece com 0 bytes.
                    { name: 'lib-hash', size: 0, hardlink: true },
                    // Pacote que nenhum projeto usa: é o que `pnpm store prune` libera.
                    { name: 'orphan-hash', size: 800 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

let tmp: ReturnType<typeof tempDir> | undefined;
let reader: ScanReader | undefined;
afterEach(() => {
  reader?.close();
  reader = undefined;
  tmp?.cleanup();
});

async function open(): Promise<{ index: TreeIndex; reader: ScanReader; file: string }> {
  tmp = tempDir();
  const index = new TreeIndex(snapshotFromTree(ROOT, tree), { separator: '\\', caseInsensitive: true });
  const file = path.join(tmp.dir, 'scan.db');
  await writeScan(file, index, meta, computeSuggestions(index, env), () => {});
  reader = new ScanReader('s', file, true);
  return { index, reader, file };
}

describe('hard links (pnpm)', () => {
  it('agrega o conteúdo compartilhado e calcula o que a remoção libera', async () => {
    const { index } = await open();
    const nm = index.find(`${ROOT}\\pnpm-app\\node_modules`) as number;
    expect(index.diskOf(nm)).toBe(5100);
    expect(index.sharedOf(nm)).toBe(5000);
    expect(index.freeableOf(nm)).toBe(100);
    expect(index.sharedOf(0)).toBe(5000);
  });

  it('sugestões medem o que seria liberado; o store vira o comando "pnpm store prune"', async () => {
    const { reader: r } = await open();
    const byId = Object.fromEntries(r.suggestions().map(s => [s.id, s]));
    expect(byId['node-modules']?.size).toBe(3000 + 100);
    expect(byId['node-modules']?.items.map(i => [i.path, i.size])).toEqual([
      [`${ROOT}\\npm-app\\node_modules`, 3000],
      [`${ROOT}\\pnpm-app\\node_modules`, 100],
    ]);
    expect(byId['pnpm-store']).toMatchObject({ action: 'command', command: 'pnpm store prune', size: 800 });
    // O store não é oferecido para ir à Lixeira como cache comum.
    expect(byId['package-caches']).toBeUndefined();
  });

  it('remoção informa só os bytes liberados e desconta o compartilhado dos ancestrais', async () => {
    const { reader: r } = await open();
    const nm = r.find(`${ROOT}\\pnpm-app\\node_modules`) as number;
    expect(r.resolve([nm])[0]?.size).toBe(100);
    expect(r.details(nm).node).toMatchObject({ disk: 5100, shared: 5000 });
    r.markRemoved([nm]);
    expect(r.root()).toMatchObject({ shared: 0 });
    expect(r.details(r.find(`${ROOT}\\pnpm-app`) as number).node).toMatchObject({ disk: 1, shared: 0 });
  });

  it('abre análises gravadas antes da coluna "shared"', async () => {
    const { file } = await open();
    reader?.close();
    reader = undefined;
    const db = new DatabaseSync(file);
    db.exec('ALTER TABLE entries DROP COLUMN shared');
    db.close();
    reader = new ScanReader('s', file, true);
    expect(reader.root().shared).toBe(0);
    expect(reader.root().disk).toBeGreaterThan(0);
  });
});
