import { create } from 'zustand';
import { msg } from '@shared/i18n';
import type { AppInfo } from '@shared/ipc';
import type { CategoryId, NodeId, ScanProgress, ScanSummary } from '@shared/types';
import { api } from '../api';
import type { ColorMode } from '../lib/colors';
import { clearQueryCache } from '../lib/useQuery';
import { toast } from './uiStore';

export type Screen = 'home' | 'scan' | 'explore' | 'largest' | 'types' | 'clean' | 'settings';
export const SCREENS_NEEDING_SCAN: readonly Screen[] = ['explore', 'largest', 'types', 'clean'];

export interface ScanState {
  status: 'idle' | 'scanning' | 'error';
  target: string | null;
  progress: ScanProgress | null;
  error: string | null;
  startedAt: number;
}

/** Destaque pedido por "Mostrar no Explorar"; `nonce` permite repetir o mesmo item. */
export interface Flash {
  id: NodeId;
  nonce: number;
}

export interface AppState {
  info: AppInfo | null;
  screen: Screen;
  scan: ScanState;
  summary: ScanSummary | null;
  currentId: NodeId;
  flash: Flash | null;
  explore: { chart: 'treemap' | 'sunburst'; layout: 'chart' | 'split' | 'table'; colorMode: ColorMode };
  largest: { kind: 'file' | 'dir'; category: CategoryId | 'all'; olderThanDays: 0 | 180 | 365; text: string };
  typesCategory: CategoryId | null;
  paletteOpen: boolean;

  setInfo(info: AppInfo): void;
  go(screen: Screen): void;
  startScan(path: string): Promise<void>;
  cancelScan(): Promise<void>;
  scanProgress(p: ScanProgress): void;
  scanDone(s: ScanSummary): void;
  scanFailed(message: string): void;
  /** Troca a análise carregada (nova, reaberta ou atualizada após limpeza). */
  setSummary(s: ScanSummary | null): void;
  openSaved(id: string): Promise<void>;
  deleteSaved(id: string): Promise<void>;
  openFolder(id: NodeId): void;
  reveal(target: { id: NodeId; kind: string; parentId: NodeId | null }): void;
  patchExplore(p: Partial<AppState['explore']>): void;
  patchLargest(p: Partial<AppState['largest']>): void;
  setTypesCategory(c: CategoryId | null): void;
  setPaletteOpen(open: boolean): void;
}

const idleScan: ScanState = { status: 'idle', target: null, progress: null, error: null, startedAt: 0 };
let flashNonce = 0;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const useApp = create<AppState>((set, get) => ({
  info: null,
  screen: 'home',
  scan: idleScan,
  summary: null,
  currentId: 0,
  flash: null,
  explore: { chart: 'treemap', layout: 'split', colorMode: 'folder' },
  largest: { kind: 'file', category: 'all', olderThanDays: 0, text: '' },
  typesCategory: null,
  paletteOpen: false,

  setInfo: info => set({ info }),

  go: screen => {
    if (screen === 'scan' && get().scan.status !== 'scanning') screen = get().summary ? 'explore' : 'home';
    if (SCREENS_NEEDING_SCAN.includes(screen) && !get().summary) {
      toast(msg().scan.scanFirst, 'info');
      return;
    }
    set({ screen });
  },

  startScan: async path => {
    set({
      scan: { status: 'scanning', target: path, progress: null, error: null, startedAt: Date.now() },
      screen: 'scan',
    });
    try {
      await api().scan.start(path);
    } catch (err) {
      get().scanFailed(message(err));
    }
  },

  cancelScan: async () => {
    await api()
      .scan.cancel()
      .catch(() => undefined);
    set(s => ({ scan: idleScan, screen: s.screen === 'scan' ? (s.summary ? 'explore' : 'home') : s.screen }));
    toast(msg().scan.cancelled, 'x');
  },

  scanProgress: progress => set(s => (s.scan.status === 'scanning' ? { scan: { ...s.scan, progress } } : {})),

  scanDone: summary => {
    const onScanScreen = get().screen === 'scan';
    get().setSummary(summary);
    set(s => ({ scan: { ...s.scan, status: 'idle' } }));
    // Se o usuário saiu da tela de progresso, avisa com atalho para abrir o resultado.
    if (!onScanScreen) {
      toast(msg().scan.done(summary.rootPath), 'check', { label: msg().scan.open, run: () => get().go('explore') });
    }
  },

  scanFailed: error => {
    set(s => ({
      scan: { ...s.scan, status: 'error', error },
      screen: s.screen === 'scan' ? (s.summary ? 'explore' : 'home') : s.screen,
    }));
    toast(msg().scan.failed(error), 'alert');
  },

  setSummary: summary => {
    const prev = get().summary;
    const sameScan = !!prev && !!summary && prev.id === summary.id;
    if (!sameScan) clearQueryCache();
    set({
      summary,
      ...(sameScan ? {} : { currentId: summary?.rootId ?? 0, flash: null, typesCategory: null }),
    });
    if (!summary && SCREENS_NEEDING_SCAN.includes(get().screen)) set({ screen: 'home' });
  },

  openSaved: async id => {
    try {
      get().setSummary(await api().scans.open(id));
      set({ screen: 'explore' });
    } catch (err) {
      toast(msg().scan.openFailed(message(err)), 'alert');
    }
  },

  deleteSaved: async id => {
    try {
      const current = get().summary;
      const next = await api().scans.delete(id);
      if (current?.id === id) get().setSummary(next);
      toast(msg().scan.deleted, 'trash');
    } catch (err) {
      toast(msg().scan.deleteFailed(message(err)), 'alert');
    }
  },

  openFolder: id => set({ currentId: id, screen: 'explore' }),

  reveal: ({ id, kind, parentId }) => {
    const folder = kind === 'dir' ? id : (parentId ?? 0);
    set({ currentId: folder, flash: kind === 'dir' ? null : { id, nonce: ++flashNonce }, screen: 'explore' });
  },

  patchExplore: p => set(s => ({ explore: { ...s.explore, ...p } })),
  patchLargest: p => set(s => ({ largest: { ...s.largest, ...p } })),
  setTypesCategory: typesCategory => set({ typesCategory }),
  setPaletteOpen: paletteOpen => set({ paletteOpen }),
}));
