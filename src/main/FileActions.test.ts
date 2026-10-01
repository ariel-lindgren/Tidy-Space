import { describe, expect, it, vi } from 'vitest';
import { msg } from '@shared/i18n';
import { defaultSettings } from '@shared/settings';
import type { DeleteCheck } from '../engine/deletePreflight';
import type { ResolvedNode } from '../engine/protocol';
import { FileActions, type FileActionDeps } from './FileActions';

const nodes: ResolvedNode[] = [
  { id: 1, path: '/home/ana/Downloads/a.iso', size: 100, kind: 'file' },
  { id: 2, path: '/etc', size: 5, kind: 'dir' },
  { id: 3, path: '/home/ana/.cache/x', size: 50, kind: 'dir' },
  { id: 4, path: '/home/ana/protegido', size: 70, kind: 'dir' },
  { id: 5, path: '/home/ana/aberto.log', size: 10, kind: 'file' },
];

/** Verificação simulada: "protegido" exige admin, "aberto" está em uso. */
const check = (p: string): DeleteCheck =>
  p.includes('protegido')
    ? { ok: false, verified: true, blocker: 'permission', blockedPath: `${p}/sub/x.dll` }
    : p.includes('aberto')
      ? { ok: false, verified: true, blocker: 'in-use', blockedPath: p }
      : { ok: true, verified: true };

function setup(overrides: Partial<FileActionDeps> = {}) {
  const call = vi.fn(async (method: string, p: { ids?: number[]; paths?: string[] }) => {
    if (method === 'resolve') return nodes.filter(n => p.ids?.includes(n.id));
    if (method === 'checkDeletable') return (p.paths ?? []).map(check);
    return { treeVersion: 1 };
  });
  const deps: FileActionDeps = {
    engine: { call: call as unknown as FileActionDeps['engine']['call'] },
    trashItem: vi.fn(async (path: string) => {
      if (path.endsWith('/x')) throw new Error('em uso');
    }),
    removePermanently: vi.fn(async () => {}),
    getSettings: async () => defaultSettings('linux'),
    safety: { platform: 'linux', home: '/home/ana' },
    ...overrides,
  };
  return { actions: new FileActions(deps), deps, call };
}

describe('FileActions', () => {
  it('move para a Lixeira só o que é permitido e informa falhas', async () => {
    const { actions, deps, call } = setup();
    const r = await actions.trash([1, 2, 3, 9]);
    expect(r.done).toEqual([1]);
    expect(r.bytes).toBe(100);
    expect(r.failed.map(f => [f.id, f.error])).toEqual([
      [9, 'item não encontrado na análise atual'],
      [2, 'protegido: pasta protegida do sistema'],
      [3, 'em uso'],
    ]);
    expect(r.failed.map(f => f.reason)).toEqual(['missing', 'protected', 'other']);
    expect(deps.trashItem).not.toHaveBeenCalledWith('/etc');
    expect(call).toHaveBeenLastCalledWith('markRemoved', { ids: [1] });
    expect(r.summary).toEqual({ treeVersion: 1 });
  });

  it('pula, sem tocar o disco, itens que exigem administrador ou estão em uso', async () => {
    const { actions, deps } = setup();
    const r = await actions.trash([4, 5, 1]);
    expect(r.done).toEqual([1]);
    expect(r.failed.map(f => [f.id, f.error])).toEqual([
      [4, 'requer permissão de administrador (/home/ana/protegido/sub/x.dll)'],
      [5, 'em uso por outro programa'],
    ]);
    expect(r.failed.map(f => f.reason)).toEqual(['permission', 'in-use']);
    expect(deps.trashItem).toHaveBeenCalledTimes(1);
  });

  it('não trava quando o sistema não responde: o item expira e os demais seguem', async () => {
    const { actions } = setup({
      timeoutMs: 30,
      trashItem: vi.fn((p: string) => (p.endsWith('.iso') ? new Promise<void>(() => {}) : Promise.resolve())),
    });
    const r = await actions.trash([1, 3]);
    expect(r.done).toEqual([3]);
    expect(r.failed).toEqual([
      { id: 1, path: '/home/ana/Downloads/a.iso', error: msg().main.timeout, reason: 'timeout' },
    ]);
  });

  it('não marca nada quando tudo falha', async () => {
    const { actions, call } = setup();
    const r = await actions.trash([2]);
    expect(r.summary).toBeNull();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('exclusão definitiva exige a configuração habilitada', async () => {
    const { actions, deps } = setup();
    await expect(actions.deletePermanently([1])).rejects.toThrow(/desativada/);
    expect(deps.removePermanently).not.toHaveBeenCalled();

    const enabled = setup({ getSettings: async () => ({ ...defaultSettings('linux'), allowPermanentDelete: true }) });
    const r = await enabled.actions.deletePermanently([1]);
    expect(r.done).toEqual([1]);
    expect(enabled.deps.removePermanently).toHaveBeenCalledWith('/home/ana/Downloads/a.iso');
  });
});
