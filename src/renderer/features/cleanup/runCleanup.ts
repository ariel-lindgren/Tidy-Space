import type { FileActionResult, NodeId } from '@shared/types';

export type CleanupMode = 'trash' | 'permanent';

export interface CleanupOutcome extends FileActionResult {
  mode: CleanupMode;
  /** O usuário parou antes do fim; estes ids não foram processados. */
  skipped: NodeId[];
}

/**
 * Executa a limpeza em lotes para poder mostrar progresso real. O último `summary` não nulo
 * é o estado final da árvore (versão incrementada pelo engine).
 */
export async function runCleanup(
  ids: readonly NodeId[],
  mode: CleanupMode,
  action: (batch: NodeId[]) => Promise<FileActionResult>,
  onProgress: (done: number, total: number) => void,
  batchSize = 5,
  signal?: AbortSignal,
): Promise<CleanupOutcome> {
  const outcome: CleanupOutcome = { mode, done: [], failed: [], bytes: 0, summary: null, skipped: [] };
  for (let i = 0; i < ids.length; i += batchSize) {
    // Parar só entre lotes: o que já foi enviado ao sistema termina normalmente.
    if (signal?.aborted) {
      outcome.skipped = ids.slice(i);
      break;
    }
    const batch = ids.slice(i, i + batchSize);
    try {
      const r = await action(batch);
      outcome.done.push(...r.done);
      outcome.failed.push(...r.failed);
      outcome.bytes += r.bytes;
      if (r.summary) outcome.summary = r.summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcome.failed.push(...batch.map(id => ({ id, path: '', error: message })));
    }
    onProgress(Math.min(ids.length, i + batch.length), ids.length);
  }
  return outcome;
}
