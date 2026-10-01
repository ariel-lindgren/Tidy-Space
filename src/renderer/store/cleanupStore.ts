import { create } from 'zustand';
import { msg } from '@shared/i18n';
import { api } from '../api';
import { runCleanup, type CleanupMode, type CleanupOutcome } from '../features/cleanup/runCleanup';
import { useApp } from './appStore';
import { useQueue, type QueueItem } from './queueStore';
import { toast } from './uiStore';

/**
 * Velocidade medida da Lixeira do Windows (arquivos/s) numa pasta com 30 mil arquivos
 * pequenos: ~2.900/s. Usamos um valor conservador — a API não informa progresso por arquivo,
 * então a barra do item atual é uma estimativa, limitada a 95% até o sistema confirmar.
 */
export const REMOVAL_FILES_PER_SECOND = 2500;
const ITEM_OVERHEAD_SECONDS = 0.5;

export function estimateSeconds(item: Pick<QueueItem, 'files'>): number {
  return ITEM_OVERHEAD_SECONDS + Math.max(1, item.files) / REMOVAL_FILES_PER_SECOND;
}

/** Fração estimada (0–0,95) do item atual, pelo tempo decorrido. */
export function estimateFraction(item: Pick<QueueItem, 'files'>, elapsedMs: number): number {
  return Math.min(0.95, elapsedMs / 1000 / estimateSeconds(item));
}

export interface CleanupJob {
  items: QueueItem[];
  mode: CleanupMode;
  /** Índice do item em andamento (= quantos já terminaram). */
  current: number;
  startedAt: number;
  itemStartedAt: number;
  bytesDone: number;
  stopping: boolean;
  outcome: CleanupOutcome | null;
}

interface CleanupState {
  job: CleanupJob | null;
  /** Janela de progresso aberta (a limpeza continua mesmo com ela fechada). */
  dialogOpen: boolean;
  start(items: QueueItem[], mode: CleanupMode): void;
  stop(): void;
  openDialog(): void;
  /** Fecha a janela; se já terminou, descarta o resultado. */
  closeDialog(): void;
}

let controller: AbortController | null = null;

export const useCleanup = create<CleanupState>((set, get) => ({
  job: null,
  dialogOpen: false,

  start: (items, mode) => {
    if (get().job && !get().job?.outcome) return;
    controller = new AbortController();
    const now = Date.now();
    set({
      dialogOpen: true,
      job: {
        items,
        mode,
        current: 0,
        startedAt: now,
        itemStartedAt: now,
        bytesDone: 0,
        stopping: false,
        outcome: null,
      },
    });
    const byId = new Map(items.map(i => [i.id, i]));
    const action = mode === 'permanent' ? api().files.deletePermanently : api().files.trash;
    void runCleanup(
      items.map(i => i.id),
      mode,
      async batch => {
        const r = await action(batch);
        // Aplica cada item assim que termina: a árvore e a fila refletem o progresso real.
        if (r.summary) useApp.getState().setSummary(r.summary);
        useQueue.getState().remove(r.done);
        return r;
      },
      done =>
        set(s => {
          if (!s.job) return s;
          const finished = s.job.items.slice(0, done);
          return {
            job: {
              ...s.job,
              current: done,
              itemStartedAt: Date.now(),
              bytesDone: finished.reduce((a, i) => a + (byId.get(i.id)?.size ?? 0), 0),
            },
          };
        }),
      1,
      controller.signal,
    ).then(outcome => {
      set(s => (s.job ? { job: { ...s.job, outcome, current: s.job.items.length } } : s));
      if (!get().dialogOpen) {
        const failed = outcome.failed.length;
        const m = msg().cleanup;
        toast(failed ? m.finishedWithFailures(failed) : m.finished, failed ? 'alert' : 'check', {
          label: m.viewResult,
          run: () => get().openDialog(),
        });
      }
    });
  },

  stop: () => {
    controller?.abort();
    set(s => (s.job ? { job: { ...s.job, stopping: true } } : s));
  },

  openDialog: () => set({ dialogOpen: true }),

  closeDialog: () => set(s => ({ dialogOpen: false, job: s.job?.outcome ? null : s.job })),
}));
