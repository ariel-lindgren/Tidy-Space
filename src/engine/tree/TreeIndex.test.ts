import { describe, expect, it } from 'vitest';
import { snapshotFromTree } from '../snapshot';
import { DAY, idOf, NOW, ROOT, SAMPLE, sampleIndex } from '../test/fixtures';
import { TreeIndex } from './TreeIndex';

describe('TreeIndex', () => {
  it('agrega tamanho lógico, em disco e só na nuvem de baixo para cima', () => {
    const index = sampleIndex();
    expect(index.logicalOf(0)).toBe(16915);
    expect(index.diskOf(0)).toBe(9915);
    expect(index.cloudOf(0)).toBe(7000);
    expect(index.filesOf(0)).toBe(7);
    expect(index.dirsOf(0)).toBe(5);
    const videos = idOf(index, `${ROOT}\\Videos`);
    expect([index.logicalOf(videos), index.diskOf(videos), index.cloudOf(videos)]).toEqual([11000, 4000, 7000]);
    expect(index.mtimeOf(videos)).toBe(NOW - DAY);
  });

  it('marca arquivos só na nuvem com 0 bytes em disco', () => {
    const index = sampleIndex();
    const item = index.topItem(idOf(index, `${ROOT}\\Videos\\nuvem.mp4`));
    expect(item).toMatchObject({ cloudOnly: true, size: 0, disk: 0, logical: 7000, cloud: 7000 });
  });

  it('calcula categoria dominante (em disco), participação e maior arquivo de cada pasta', () => {
    const index = sampleIndex();
    const videos = idOf(index, `${ROOT}\\Videos`);
    const proj = idOf(index, `${ROOT}\\proj`);
    expect(index.categoryOf(videos)).toBe('video');
    expect(index.categoryShare(videos)).toBeCloseTo(1);
    expect(index.categoryOf(proj)).toBe('code');
    expect(index.categoryOf(0)).toBe('install');
    expect(index.categoryShare(0)).toBeCloseTo(5000 / 9915, 3);
    expect(index.name(index.largestFileOf(0) as number)).toBe('big.iso');
    expect(index.name(index.largestFileOf(videos) as number)).toBe('a.mp4');
    expect(index.largestFileOf(idOf(index, `${ROOT}\\empty`))).toBeNull();
  });

  it('usa o tamanho lógico para decidir a categoria de pastas inteiramente na nuvem', () => {
    const index = new TreeIndex(
      snapshotFromTree('/r', {
        name: '',
        children: [{ name: 'd', children: [{ name: 'x.pdf', size: 10, cloud: true }] }],
      }),
      {
        separator: '/',
        caseInsensitive: false,
      },
    );
    expect(index.categoryOf(1)).toBe('doc');
  });

  it('ordena filhos por bytes em disco e resolve caminhos nos dois sentidos', () => {
    const index = sampleIndex();
    expect(Array.from(index.children(0), i => index.name(i))).toEqual([
      'big.iso',
      'Videos',
      'proj',
      'notes.txt',
      'empty',
    ]);
    const lib = idOf(index, 'c:/DATA/proj/node_modules/lib.js');
    expect(index.path(lib)).toBe(`${ROOT}\\proj\\node_modules\\lib.js`);
    expect(index.trail(lib).map(c => c.name)).toEqual([ROOT, 'proj', 'node_modules', 'lib.js']);
    expect(index.find('C:\\outro')).toBeNull();
    expect(index.find(`${ROOT}\\nope`)).toBeNull();
  });

  it('usa separador posix e diferencia maiúsculas quando configurado', () => {
    const index = new TreeIndex(snapshotFromTree('/', SAMPLE), { separator: '/', caseInsensitive: false });
    expect(index.path(idOf(index, '/Videos/a.mp4'))).toBe('/Videos/a.mp4');
    expect(index.find('/videos')).toBeNull();
  });

  it('isWithin/endOf usam o intervalo contíguo da subárvore', () => {
    const index = sampleIndex();
    const proj = idOf(index, `${ROOT}\\proj`);
    expect(index.isWithin(idOf(index, `${ROOT}\\proj\\src\\index.ts`), proj)).toBe(true);
    expect(index.isWithin(idOf(index, `${ROOT}\\Videos\\a.mp4`), proj)).toBe(false);
    expect(index.endOf(proj) - proj).toBe(5);
  });

  it('rejeita snapshot vazio', () => {
    const empty = { ...snapshotFromTree('/', { name: '' }), names: [] };
    expect(() => new TreeIndex(empty, { separator: '/', caseInsensitive: false })).toThrow();
  });
});
