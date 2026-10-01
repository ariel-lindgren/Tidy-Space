import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { messagesFor, setLocale } from '@shared/i18n';
import { computeSuggestions } from '../suggestions/computeSuggestions';
import { idOf, ROOT, sampleIndex, tempDir } from '../test/fixtures';
import { Catalog } from './Catalog';
import { ScanReader } from './ScanReader';
import { writeScan } from './writeScan';

let tmp: ReturnType<typeof tempDir>;
let file: string;
let reader: ScanReader;

const meta = {
  engine: 'native' as const,
  elapsedMs: 1234,
  finishedAt: 1_700_000_000_000,
  errorCount: 2,
  issues: [{ path: 'x', message: 'negado' }],
  volume: { total: 1e6, available: 4e5 },
};
// "Temp" deste ambiente = C:\data\proj → sugere src e node_modules.
const env = { platform: 'win32', home: 'C:\\Users\\x', tmpDir: `${ROOT}\\proj`, now: Date.now() };

beforeEach(async () => {
  tmp = tempDir();
  file = path.join(tmp.dir, 'scan.db');
  const index = sampleIndex();
  const progress: number[] = [];
  await writeScan(file, index, meta, computeSuggestions(index, env), saved => progress.push(saved));
  expect(progress.at(-1)).toBe(index.size);
  reader = new ScanReader('abc-123', file, true);
});
afterEach(() => {
  reader.close();
  tmp.cleanup();
});

describe('writeScan + ScanReader', () => {
  it('grava de forma atômica e preserva os metadados', () => {
    expect(readdirSync(tmp.dir)).toEqual(['scan.db']);
    expect(reader.meta).toMatchObject({
      rootPath: ROOT,
      separator: '\\',
      engine: 'native',
      elapsedMs: 1234,
      errorCount: 2,
      volume: { total: 1e6 },
    });
    expect(reader.root()).toMatchObject({ size: 9915, disk: 9915, logical: 16915, cloud: 7000, files: 7, dirs: 5 });
  });

  it('visão hierárquica: ordena pela medida, agrupa itens pequenos e omite o que tem tamanho zero', () => {
    const view = reader.view({ id: 0, depth: 2, maxChildren: 2, minFraction: 0 });
    expect(view.children?.map(c => c.name)).toEqual(['big.iso', 'Videos', '2 itens menores']);
    expect(view.children?.[2]).toMatchObject({ id: null, kind: 'group', size: 915, groupedCount: 2 });
    // Em disco, o arquivo só na nuvem não aparece; no lógico ele domina.
    expect(view.children?.[1]?.children?.map(c => c.name)).toEqual(['a.mp4', 'b.mkv']);
    reader.measure = 'logical';
    const logical = reader.view({ id: 0, depth: 2, maxChildren: 10, minFraction: 0 });
    expect(logical.children?.[0]).toMatchObject({ name: 'Videos', size: 11000, cloud: 7000 });
    expect(logical.children?.[0]?.children?.[0]).toMatchObject({ name: 'nuvem.mp4', cloudOnly: true });
  });

  it('pagina, ordena e filtra filhos (com % e _ tratados literalmente)', () => {
    const byName = reader.children({ id: 0, sort: 'name', direction: 'asc', offset: 0, limit: 2 });
    expect(byName.total).toBe(5);
    expect(byName.items.map(i => i.name)).toEqual(['big.iso', 'empty']);
    const bySize = reader.children({ id: 0, sort: 'size', direction: 'desc', offset: 1, limit: 2 });
    expect(bySize.items.map(i => i.name)).toEqual(['Videos', 'proj']);
    expect(
      reader
        .children({ id: 0, sort: 'size', direction: 'desc', filter: 'O', offset: 0, limit: 9 })
        .items.map(i => i.name),
    ).toEqual(['big.iso', 'Videos', 'proj', 'notes.txt']);
    expect(reader.children({ id: 0, sort: 'size', direction: 'desc', filter: '%', offset: 0, limit: 9 }).total).toBe(0);
  });

  it('lista os maiores com filtros e busca por nome', () => {
    expect(reader.top({ kind: 'file', limit: 3 }).map(i => i.name)).toEqual(['big.iso', 'a.mp4', 'b.mkv']);
    expect(reader.top({ kind: 'file', category: 'video', limit: 9 }).map(i => i.name)).toEqual([
      'a.mp4',
      'b.mkv',
      'nuvem.mp4',
    ]);
    expect(reader.top({ kind: 'file', olderThanDays: 365, limit: 9 }).map(i => i.name)).toEqual([
      'big.iso',
      'notes.txt',
    ]);
    const nm = reader.top({ kind: 'dir', text: 'node', limit: 9 });
    expect(nm.map(i => [i.name, i.path, i.parentPath])).toEqual([
      ['node_modules', `${ROOT}\\proj\\node_modules`, `${ROOT}\\proj`],
    ]);
    expect(reader.search('.MP4', 9).map(i => i.name)).toEqual(['a.mp4', 'nuvem.mp4']);
    expect(reader.search('  ', 9)).toEqual([]);
  });

  it('distribuição por tipo na medida escolhida', () => {
    expect(reader.types().categories[0]).toEqual({ category: 'install', size: 5000, count: 1 });
    reader.measure = 'logical';
    expect(reader.types().categories[0]).toEqual({ category: 'video', size: 11000, count: 3 });
    expect(reader.types().extensions.find(e => e.ext === 'mp4')).toMatchObject({ size: 10000, count: 2 });
  });

  it('detalhes: maior arquivo, categoria dominante e espaço recuperável', () => {
    const d = reader.details(0);
    expect(d.largestFile?.name).toBe('big.iso');
    expect(d.dominant.category).toBe('install');
    expect(d.dominant.share).toBeCloseTo(0.504, 2);
    expect(d.reclaimable).toBe(910);
    expect(reader.details(idOf(reader, `${ROOT}\\proj\\src`)).reclaimable).toBe(10);
    expect(reader.details(idOf(reader, `${ROOT}\\Videos`)).trail.map(c => c.name)).toEqual([ROOT, 'Videos']);
    expect(() => reader.details(999)).toThrow(/não existe/);
  });

  it('posição entre irmãos e resolução de caminhos', () => {
    expect(reader.rankOf(idOf(reader, `${ROOT}\\Videos`))).toBe(1);
    expect(reader.rankOf(idOf(reader, `${ROOT}\\big.iso`))).toBe(0);
    const lib = idOf(reader, 'c:/data/PROJ/node_modules/lib.js');
    expect(reader.path(lib)).toBe(`${ROOT}\\proj\\node_modules\\lib.js`);
    expect(reader.resolve([0, lib, 999])).toEqual([
      { id: lib, path: `${ROOT}\\proj\\node_modules\\lib.js`, size: 900, kind: 'file' },
    ]);
  });

  it('sugestões com tamanhos atuais', () => {
    const s = reader.suggestions();
    expect(s.map(x => [x.id, x.size, x.itemCount])).toEqual([['temp', 910, 2]]);
    expect(s[0]?.items.map(i => i.name)).toEqual(['node_modules', 'src']);
  });

  it('sugestões gravadas em português aparecem no idioma atual ao reabrir', () => {
    expect(reader.suggestions()[0]?.title).toBe('Arquivos temporários');
    setLocale('en');
    try {
      expect(reader.suggestions()[0]).toMatchObject(messagesFor('en').suggestions.temp);
    } finally {
      setLocale('pt-BR');
    }
  });

  it('lista completa de itens de uma sugestão', () => {
    expect(reader.suggestionItems('temp').map(i => [i.name, i.size])).toEqual([
      ['node_modules', 900],
      ['src', 10],
    ]);
    expect(reader.suggestionItems('inexistente')).toEqual([]);
  });

  it('remoção: desconta ancestrais, atualiza tipos e sugestões e persiste ao reabrir', () => {
    const a = idOf(reader, `${ROOT}\\Videos\\a.mp4`);
    const videos = idOf(reader, `${ROOT}\\Videos`);
    reader.markRemoved([a, a, 0, 999]);
    expect(reader.treeVersion).toBe(1);
    expect(reader.root()).toMatchObject({ disk: 6915, logical: 13915, files: 6 });
    expect(reader.details(videos).node).toMatchObject({ disk: 1000, childCount: 2 });
    expect(reader.types().categories.find(c => c.category === 'video')).toMatchObject({ size: 1000, count: 2 });
    expect(() => reader.details(a)).toThrow();

    reader.markRemoved([idOf(reader, `${ROOT}\\proj`)]);
    expect(reader.root()).toMatchObject({ disk: 6005, dirs: 2 });
    expect(reader.suggestions()).toEqual([]);
    expect(reader.details(0).reclaimable).toBe(0);

    reader.close();
    reader = new ScanReader('abc-123', file, true);
    expect(reader.treeVersion).toBe(2);
    expect(reader.root().disk).toBe(6005);
    expect(reader.types().categories.find(c => c.category === 'code')).toBeUndefined();
  });
});

describe('Catalog', () => {
  it('registra, lista (mais recente primeiro), poda e apaga arquivos', () => {
    const catalog = new Catalog(path.join(tmp.dir, 'data'));
    const add = (t: number) => {
      const { id, file: f } = catalog.allocate(t);
      catalog.add({
        id,
        file: f,
        rootPath: `/r${t}`,
        finishedAt: t,
        elapsedMs: 1,
        engine: 'node',
        files: 1,
        dirs: 0,
        disk: t,
        logical: t,
        cloud: 0,
        entries: 2,
      });
      return { id, file: f };
    };
    const a = add(1000);
    const b = add(2000);
    const c = add(3000);
    expect(catalog.list().map(s => s.rootPath)).toEqual(['/r3000', '/r2000', '/r1000']);
    expect(catalog.prune(1, a.id)).toEqual([b.id]);
    expect(catalog.list().map(s => s.id)).toEqual([c.id, a.id]);
    catalog.updateTotals(c.id, { files: 9, dirs: 9, disk: 9, logical: 9, cloud: 9 });
    expect(catalog.get(c.id)).toMatchObject({ files: 9, disk: 9 });
    catalog.remove(a.id);
    expect(catalog.get(a.id)).toBeNull();
    expect(existsSync(a.file)).toBe(false);
    catalog.close();
  });
});
