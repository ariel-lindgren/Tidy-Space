import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { snapshotFromTree } from '../snapshot';
import { tempDir } from '../test/fixtures';
import { TreeIndex } from '../tree/TreeIndex';
import { ScanReader } from './ScanReader';
import { writeScan } from './writeScan';

let tmp: ReturnType<typeof tempDir> | undefined;
afterEach(() => tmp?.cleanup());

describe('análises gravadas com a regra antiga de node_modules', () => {
  it('não oferecem node_modules de instalações do Node nem de pastas sem package.json', async () => {
    tmp = tempDir();
    const tree = {
      name: '',
      children: [
        {
          name: 'nvm',
          children: [{ name: 'v18', children: [{ name: 'node_modules', children: [{ name: 'a.js', size: 900 }] }] }],
        },
        { name: 'solto', children: [{ name: 'node_modules', children: [{ name: 'b.js', size: 800 }] }] },
        {
          name: 'app',
          children: [
            { name: 'package.json', size: 1 },
            { name: 'node_modules', children: [{ name: 'c.js', size: 700 }] },
          ],
        },
      ],
    };
    const index = new TreeIndex(snapshotFromTree('/u', tree), { separator: '/', caseInsensitive: false });
    // Simula a regra antiga: todos os node_modules foram sugeridos.
    const ids: number[] = [];
    for (let i = 0; i < index.size; i++) if (index.name(i) === 'node_modules') ids.push(i);
    expect(ids).toHaveLength(3);
    const file = path.join(tmp.dir, 'old.db');
    const meta = { engine: 'native' as const, elapsedMs: 0, finishedAt: 0, errorCount: 0, issues: [], volume: null };
    const legacy = {
      id: 'node-modules',
      title: 't',
      description: 'd',
      icon: 'code',
      risk: 'review' as const,
      action: 'queue' as const,
      itemIds: ids,
    };
    await writeScan(file, index, meta, [legacy], () => {});
    const reader = new ScanReader('x-y', file, false);
    expect(reader.suggestionItems('node-modules').map(i => i.path)).toEqual(['/u/app/node_modules']);
    expect(reader.suggestions()[0]).toMatchObject({ itemCount: 1, size: 700 });
    reader.close();
  });
});
