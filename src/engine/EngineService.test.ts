import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanProgress } from '@shared/types';
import { EngineService, type EngineDeps } from './EngineService';
import type { EngineEvent } from './protocol';
import type { Scanner } from './scanner/Scanner';
import { snapshotFromTree, type Snapshot } from './snapshot';
import { ROOT, SAMPLE, tempDir } from './test/fixtures';

let tmp: ReturnType<typeof tempDir>;
const services: EngineService[] = [];
beforeEach(() => {
  tmp = tempDir('tidyspace-engine-');
});
afterEach(() => {
  services.splice(0).forEach(s => s.close());
  tmp.cleanup();
});

const progress: ScanProgress = {
  phase: 'scanning',
  files: 1,
  dirs: 1,
  bytes: 300,
  errors: 0,
  currentPath: ROOT,
  elapsedMs: 5,
};

function setup(scan?: Scanner['scan']) {
  const events: EngineEvent[] = [];
  const deps: EngineDeps = {
    scanner: {
      kind: 'node',
      scan:
        scan ??
        (async (options, onProgress) => {
          onProgress(progress);
          return snapshotFromTree(options.root, SAMPLE);
        }),
    },
    nativeError: 'sem addon',
    dataDir: tmp.dir,
    listVolumes: async () => [],
    volumeStats: async () => ({ total: 100_000, available: 60_000 }),
    suggestionEnv: () => ({ platform: 'win32', home: 'C:\\Users\\x', tmpDir: `${ROOT}\\proj`, now: Date.now() }),
    indexOptions: { separator: '\\', caseInsensitive: true },
    emit: e => events.push(e),
  };
  const service = new EngineService(deps);
  services.push(service);
  return { service, events };
}

const options = (root = ROOT) => ({
  root,
  threads: 0,
  followSymlinks: false,
  oneFilesystem: true,
  hardLinks: true,
  includeHidden: true,
  excludes: [],
});

async function until(events: EngineEvent[], type: EngineEvent['type'], count = 1) {
  await vi.waitFor(() => expect(events.filter(e => e.type === type)).toHaveLength(count), { timeout: 5000 });
}

describe('EngineService', () => {
  it('varre, grava no banco (com progresso das duas fases) e responde consultas', async () => {
    const { service, events } = setup();
    expect(service.summary()).toBeNull();
    const { scanId } = service.startScan({ options: options() });
    await until(events, 'done');
    const phases = events.filter(e => e.type === 'progress').map(e => (e.type === 'progress' ? e.progress.phase : ''));
    expect(phases[0]).toBe('scanning');
    expect(phases).toContain('saving');
    const done = events.find(e => e.type === 'done');
    expect(done).toMatchObject({
      scanId,
      summary: {
        rootPath: ROOT,
        size: 9915,
        disk: 9915,
        logical: 16915,
        cloud: 7000,
        files: 7,
        engine: 'node',
        measure: 'disk',
        volume: { total: 100_000 },
      },
    });
    expect(service.details({ id: 0 }).largestFile?.name).toBe('big.iso');
    expect(
      service.children({ id: 0, sort: 'size', direction: 'desc', offset: 0, limit: 2 }).items.map(i => i.name),
    ).toEqual(['big.iso', 'Videos']);
    expect(service.findPath({ path: `${ROOT}\\Videos` })).not.toBeNull();
    expect(service.listScans()).toHaveLength(1);
  });

  it('reabre a análise mais recente ao iniciar (persistência entre sessões)', async () => {
    const first = setup();
    first.service.startScan({ options: options() });
    await until(first.events, 'done');
    const id = first.service.summary()?.id;
    first.service.close();
    services.splice(services.indexOf(first.service), 1);

    const second = setup();
    expect(second.service.summary()).toMatchObject({ id, rootPath: ROOT, disk: 9915 });
  });

  it('abre análises antigas, apaga e respeita o limite de análises guardadas', async () => {
    const { service, events } = setup();
    service.configure({ measure: 'disk', keepScans: 2, locale: 'pt-BR' });
    for (const [i, root] of ['C:\\a', 'C:\\b', 'C:\\c'].entries()) {
      service.startScan({ options: options(root) });
      await until(events, 'done', i + 1);
    }
    const saved = service.listScans();
    expect(saved.map(s => s.rootPath)).toEqual(['C:\\c', 'C:\\b']);
    expect(saved[0]?.storageBytes).toBeGreaterThan(0);

    const reopened = await service.openScan({ id: saved[1]?.id as string });
    expect(reopened).toMatchObject({ rootPath: 'C:\\b', volume: { available: 60_000 } });
    expect(service.deleteScan({ id: saved[1]?.id as string })).toBeNull();
    expect(() => service.top({ kind: 'file', limit: 1 })).toThrow(/nenhuma análise/);
    service.deleteAllScans();
    expect(service.listScans()).toEqual([]);
  });

  it('mantém só a análise mais recente de cada local', async () => {
    const { service, events } = setup();
    service.startScan({ options: options('C:\\a') });
    await until(events, 'done', 1);
    service.startScan({ options: options('c:\\A\\') });
    await until(events, 'done', 2);
    expect(service.listScans()).toHaveLength(1);
    expect(service.summary()?.rootPath).toBe('c:\\A\\');
  });

  it('troca a medida (em disco ↔ lógico) sem varrer de novo', async () => {
    const { service, events } = setup();
    service.startScan({ options: options() });
    await until(events, 'done');
    expect(service.configure({ measure: 'logical', keepScans: 5, locale: 'pt-BR' })?.size).toBe(16915);
    expect(service.view({ id: 0, depth: 1, maxChildren: 1, minFraction: 0 }).children?.[0]?.name).toBe('Videos');
  });

  it('marca removidos, atualiza versão e totais do catálogo', async () => {
    const { service, events } = setup();
    service.startScan({ options: options() });
    await until(events, 'done');
    const big = service.findPath({ path: `${ROOT}\\big.iso` }) as number;
    expect(service.resolve({ ids: [big, 0, 9999] })).toEqual([
      { id: big, path: `${ROOT}\\big.iso`, size: 5000, kind: 'file' },
    ]);
    expect(service.markRemoved({ ids: [big] })).toMatchObject({ disk: 4915, treeVersion: 1 });
    expect(service.listScans()[0]?.disk).toBe(4915);
  });

  it('descarta resultado cancelado e mantém a análise anterior', async () => {
    const { service, events } = setup();
    service.startScan({ options: options() });
    await until(events, 'done');
    const cancelled = setup(async options => snapshotFromTree(options.root, SAMPLE, { cancelled: true }));
    cancelled.service.startScan({ options: options('C:\\x') });
    await until(cancelled.events, 'cancelled');
    expect(cancelled.service.summary()?.rootPath).toBe(ROOT);
  });

  it('ignora eventos de uma varredura substituída por outra', async () => {
    let release: () => void = () => {};
    const { service, events } = setup(
      options =>
        new Promise<Snapshot>(resolve => {
          const prev = release;
          release = () => {
            prev();
            resolve(snapshotFromTree(options.root, SAMPLE));
          };
        }),
    );
    service.startScan({ options: options('C:\\old') });
    service.startScan({ options: options('C:\\new') });
    release();
    await until(events, 'done');
    await new Promise(r => setTimeout(r, 50));
    expect(events.filter(e => e.type === 'done')).toHaveLength(1);
    expect(service.summary()?.rootPath).toBe('C:\\new');
  });

  it('reporta erro do scanner e rejeita métodos desconhecidos', async () => {
    const { service, events } = setup(async () => Promise.reject(new Error('sem permissão')));
    service.startScan({ options: options() });
    await until(events, 'error');
    expect(events).toEqual([{ kind: 'event', type: 'error', scanId: 1, message: 'sem permissão' }]);
    expect(() => service.dispatch('nope' as never, [])).toThrow(/desconhecido/);
    expect(() => service.dispatch('constructor' as never, [])).toThrow(/desconhecido/);
    expect(service.engineInfo()).toEqual({ engine: 'node', engineChoice: 'auto', nativeError: 'sem addon' });
  });
});
