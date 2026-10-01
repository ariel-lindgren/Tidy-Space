import { describe, expect, it, vi } from 'vitest';
import type { ScanSummary } from '@shared/types';
import { runCleanup } from './runCleanup';

const summary = (v: number) => ({ treeVersion: v }) as ScanSummary;

describe('runCleanup', () => {
  it('processa em lotes, acumula resultados e reporta progresso', async () => {
    const action = vi.fn(async (batch: number[]) => ({
      done: batch.filter(id => id !== 3),
      failed: batch.includes(3) ? [{ id: 3, path: '/x', error: 'em uso' }] : [],
      bytes: batch.length * 10,
      summary: summary(batch[0] as number),
    }));
    const progress = vi.fn();
    const r = await runCleanup([1, 2, 3, 4, 5], 'trash', action, progress, 2);
    expect(action).toHaveBeenCalledTimes(3);
    expect(r.done).toEqual([1, 2, 4, 5]);
    expect(r.failed).toHaveLength(1);
    expect(r.bytes).toBe(50);
    expect(r.summary).toEqual(summary(5));
    expect(progress.mock.calls).toEqual([
      [2, 5],
      [4, 5],
      [5, 5],
    ]);
  });

  it('um lote com erro não interrompe os demais', async () => {
    const action = vi.fn(async (batch: number[]) => {
      if (batch[0] === 1) throw new Error('sem acesso');
      return { done: batch, failed: [], bytes: 1, summary: null };
    });
    const r = await runCleanup([1, 2], 'permanent', action, () => {}, 1);
    expect(r.done).toEqual([2]);
    expect(r.failed).toEqual([{ id: 1, path: '', error: 'sem acesso' }]);
    expect(r.mode).toBe('permanent');
  });

  it('para entre lotes quando o usuário pede', async () => {
    const controller = new AbortController();
    const action = vi.fn(async (batch: number[]) => {
      controller.abort();
      return { done: batch, failed: [], bytes: batch.length, summary: null };
    });
    const r = await runCleanup([1, 2, 3, 4, 5], 'trash', action, () => {}, 2, controller.signal);
    expect(action).toHaveBeenCalledTimes(1);
    expect(r.done).toEqual([1, 2]);
    expect(r.skipped).toEqual([3, 4, 5]);
  });
});
