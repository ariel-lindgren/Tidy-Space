import { describe, expect, it } from 'vitest';
import { snapshotFromTree, type TreeEntry } from '../snapshot';
import { TreeIndex } from '../tree/TreeIndex';
import { computeSuggestions, type ComputedSuggestion } from './computeSuggestions';
import type { SuggestionEnv } from './rules';

const NOW = Date.UTC(2026, 8, 30);
const DAY = 86_400_000;
const old = NOW - 400 * DAY;
const recent = NOW - DAY;

const winTree: TreeEntry = {
  name: '',
  children: [
    { name: 'hiberfil.sys', size: 8000, mtime: recent },
    { name: '$Recycle.Bin', children: [{ name: '$R1.zip', size: 700 }] },
    { name: 'Windows', children: [{ name: 'Temp', children: [{ name: 'x.log', size: 50 }] }] },
    {
      name: 'Users',
      children: [
        {
          name: 'ana',
          children: [
            {
              name: 'AppData',
              children: [
                {
                  name: 'Local',
                  children: [
                    {
                      name: 'Temp',
                      children: [
                        { name: 'a.tmp', size: 300 },
                        { name: 'sub', children: [{ name: 'b.tmp', size: 200 }] },
                      ],
                    },
                    { name: 'npm-cache', children: [{ name: 'x.tgz', size: 900 }] },
                    { name: 'CrashDumps', children: [{ name: 'app.dmp', size: 60 }] },
                  ],
                },
              ],
            },
            {
              name: 'Downloads',
              children: [
                { name: 'setup.exe', size: 400, mtime: old },
                { name: 'new.msi', size: 400, mtime: recent },
                { name: 'nuvem.iso', size: 9000, mtime: old, cloud: true },
              ],
            },
            {
              name: 'code',
              children: [
                {
                  name: 'velho',
                  children: [
                    { name: 'package.json', size: 1, mtime: old },
                    {
                      name: 'node_modules',
                      children: [
                        { name: 'lib.js', size: 1000, mtime: old },
                        { name: 'node_modules', children: [{ name: 'x.js', size: 5 }] },
                      ],
                    },
                  ],
                },
                {
                  name: 'ativo',
                  children: [
                    { name: 'package.json', size: 1, mtime: recent },
                    { name: 'node_modules', children: [{ name: 'lib.js', size: 1000, mtime: old }] },
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

const winEnv: SuggestionEnv = {
  platform: 'win32',
  home: 'C:\\Users\\ana',
  tmpDir: 'C:\\Users\\ana\\AppData\\Local\\Temp',
  localAppData: 'C:\\Users\\ana\\AppData\\Local',
  winDir: 'C:\\Windows',
  systemDrive: 'C:',
  now: NOW,
};

const winIndex = () =>
  new TreeIndex(snapshotFromTree('C:\\', winTree), { separator: '\\', caseInsensitive: true, now: () => NOW });

/** Nomes e bytes em disco de cada sugestão, para asserções legíveis. */
function summarize(index: TreeIndex, list: ComputedSuggestion[]) {
  return Object.fromEntries(
    list.map(s => [
      s.id,
      { names: s.itemIds.map(i => index.name(i)).sort(), disk: s.itemIds.reduce((a, i) => a + index.sizeOf(i), 0), s },
    ]),
  );
}

describe('computeSuggestions (Windows)', () => {
  it('encontra temporários, caches, dumps, instaladores antigos e node_modules inativos', () => {
    const index = winIndex();
    const s = summarize(index, computeSuggestions(index, winEnv));
    expect(s.temp).toMatchObject({ names: ['a.tmp', 'sub', 'x.log'], disk: 550 });
    expect(s['package-caches']?.disk).toBe(900);
    expect(s['crash-dumps']?.disk).toBe(60);
    // Arquivos só na nuvem não liberam espaço: ficam de fora.
    expect(s.installers?.names).toEqual(['setup.exe']);
    expect(s['node-modules']?.s.itemIds.map(i => index.path(i))).toEqual(['C:\\Users\\ana\\code\\velho\\node_modules']);
  });

  it('nunca sugere node_modules de instalações do Node nem de pastas que não são projetos', () => {
    const tree: TreeEntry = {
      name: '',
      children: [
        {
          name: 'AppData',
          children: [
            {
              name: 'Roaming',
              children: [
                {
                  name: 'nvm',
                  children: [
                    {
                      name: 'v18.18.0',
                      children: [
                        { name: 'node.exe', size: 50, mtime: old },
                        { name: 'node_modules', children: [{ name: 'npm.js', size: 900, mtime: old }] },
                      ],
                    },
                  ],
                },
                {
                  name: 'npm',
                  children: [{ name: 'node_modules', children: [{ name: 'tool.js', size: 800, mtime: old }] }],
                },
              ],
            },
          ],
        },
        {
          name: 'solto',
          children: [
            { name: 'notas.txt', size: 1, mtime: old },
            { name: 'node_modules', children: [{ name: 'x.js', size: 700, mtime: old }] },
          ],
        },
        {
          name: 'projeto',
          children: [
            { name: 'package.json', size: 1, mtime: old },
            { name: 'node_modules', children: [{ name: 'y.js', size: 600, mtime: old }] },
          ],
        },
      ],
    };
    const index = new TreeIndex(snapshotFromTree('C:\\Users\\ana', tree), {
      separator: '\\',
      caseInsensitive: true,
      now: () => NOW,
    });
    const nm = computeSuggestions(index, winEnv).find(s => s.id === 'node-modules');
    expect(nm?.itemIds.map(i => index.path(i))).toEqual(['C:\\Users\\ana\\projeto\\node_modules']);
  });

  it('sugere comandos para Lixeira e hibernação', () => {
    const index = winIndex();
    const s = summarize(index, computeSuggestions(index, winEnv));
    expect(s.hibernation?.s).toMatchObject({ action: 'command', command: 'powercfg /hibernate off' });
    expect(s.trash?.s.action).toBe('command');
  });

  it('não conta o mesmo item em duas sugestões e ignora regras de outras plataformas', () => {
    const index = winIndex();
    const list = computeSuggestions(index, { ...winEnv, platform: 'linux' });
    const ids = list.flatMap(x => x.itemIds);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ids) for (const b of ids) if (a !== b) expect(index.isWithin(a, b)).toBe(false);
    expect(list.find(x => x.id === 'hibernation')).toBeUndefined();
  });

  it('continua linear com dezenas de milhares de candidatos (regressão de desempenho)', () => {
    const many: TreeEntry = {
      name: '',
      children: [
        { name: 'tmp', children: Array.from({ length: 30_000 }, (_, i) => ({ name: `f${i}.dmp`, size: 10 })) },
      ],
    };
    const index = new TreeIndex(snapshotFromTree('/', many), { separator: '/', caseInsensitive: false });
    const started = performance.now();
    const list = computeSuggestions(index, { platform: 'linux', home: '/home/x', tmpDir: '/tmp', now: NOW });
    expect(performance.now() - started).toBeLessThan(1500);
    // Os .dmp já foram reivindicados pela regra de temporários.
    expect(list.map(s => [s.id, s.itemIds.length])).toEqual([['temp', 30_000]]);
  });
});

describe('computeSuggestions (Linux)', () => {
  it('usa ~/.cache e /tmp sem contar o cache do pip duas vezes', () => {
    const tree: TreeEntry = {
      name: '',
      children: [
        { name: 'tmp', children: [{ name: 'x', size: 10 }] },
        {
          name: 'home',
          children: [
            {
              name: 'ana',
              children: [
                {
                  name: '.cache',
                  children: [
                    { name: 'pip', size: 30 },
                    { name: 'thumbnails', children: [{ name: 't.png', size: 20 }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const index = new TreeIndex(snapshotFromTree('/', tree), {
      separator: '/',
      caseInsensitive: false,
      now: () => NOW,
    });
    const s = summarize(
      index,
      computeSuggestions(index, { platform: 'linux', home: '/home/ana', tmpDir: '/tmp', now: NOW }),
    );
    expect(s.temp?.disk).toBe(10);
    expect(s['package-caches']?.disk).toBe(30);
    expect(s['user-caches']?.disk).toBe(20);
  });
});
