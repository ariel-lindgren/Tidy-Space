import { msg } from '@shared/i18n';
import type { Settings } from '@shared/settings';
import type { FailureReason, FileActionResult, NodeId } from '@shared/types';
import { describeBlock, type DeleteBlocker } from '../engine/deletePreflight';
import type { EngineClient } from './EngineClient';
import { checkDeletable, type SafetyEnv } from './safety';

export interface FileActionDeps {
  engine: Pick<EngineClient, 'call'>;
  /** `shell.trashItem` no app real. */
  trashItem(path: string): Promise<void>;
  /** `fs.rm(path, { recursive: true })` no app real. */
  removePermanently(path: string): Promise<void>;
  getSettings(): Promise<Settings>;
  safety: SafetyEnv;
  /**
   * Tempo máximo por item antes de desistir dele (padrão 10 min). Pastas com centenas de
   * milhares de arquivos levam minutos na Lixeira do Windows — o limite é só contra travas reais.
   */
  timeoutMs?: number;
  log?: (message: string) => void;
}

class TimeoutError extends Error {}

/** Motivo da falha (para o renderer agrupar/explicar) a partir do bloqueio da pré-checagem. */
const BLOCK_REASON: Record<DeleteBlocker, FailureReason> = {
  permission: 'permission',
  'in-use': 'in-use',
  missing: 'missing',
  other: 'other',
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(msg().main.timeout)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Ações destrutivas. O renderer só envia ids; os caminhos vêm do índice do engine (nunca do
 * renderer). Cada item passa por três barreiras antes de tocar o disco:
 * 1. política de segurança (pastas do sistema, pasta pessoal, raízes de volume);
 * 2. verificação de permissão sem elevação (evita o diálogo de administrador do Windows,
 *    que deixava a operação esperando indefinidamente);
 * 3. tempo máximo por item — se o sistema ainda assim travar, o item falha e os demais seguem.
 */
export class FileActions {
  constructor(private readonly deps: FileActionDeps) {}

  trash(ids: NodeId[]): Promise<FileActionResult> {
    return this.run(ids, p => this.deps.trashItem(p));
  }

  async deletePermanently(ids: NodeId[]): Promise<FileActionResult> {
    const settings = await this.deps.getSettings();
    if (!settings.allowPermanentDelete) throw new Error(msg().main.permanentDeleteDisabled);
    return this.run(ids, p => this.deps.removePermanently(p));
  }

  private async run(ids: NodeId[], op: (path: string) => Promise<void>): Promise<FileActionResult> {
    const resolved = await this.deps.engine.call('resolve', { ids });
    const known = new Set(resolved.map(r => r.id));
    const result: FileActionResult = {
      done: [],
      failed: ids
        .filter(id => !known.has(id))
        .map(id => ({ id, path: '', error: msg().main.itemNotFound, reason: 'missing' as const })),
      bytes: 0,
      summary: null,
    };

    const allowed = resolved.filter(node => {
      const verdict = checkDeletable(node.path, this.deps.safety);
      if (!verdict.ok) {
        result.failed.push({
          id: node.id,
          path: node.path,
          error: msg().main.protectedItem(verdict.reason),
          reason: 'protected',
        });
      }
      return verdict.ok;
    });
    const checks = allowed.length
      ? await this.deps.engine.call('checkDeletable', { paths: allowed.map(n => n.path) })
      : [];

    for (const [i, node] of allowed.entries()) {
      const check = checks[i];
      if (check && !check.ok) {
        const error = describeBlock(check, node.path);
        const reason = BLOCK_REASON[check.blocker ?? 'other'] ?? 'other';
        result.failed.push({ id: node.id, path: node.path, error, reason });
        this.deps.log?.(`remover pulado ${node.path}: ${error}`);
        continue;
      }
      const started = Date.now();
      const log = this.deps.log ?? (() => {});
      log(`remover início ${node.path}`);
      try {
        await withTimeout(op(node.path), this.deps.timeoutMs ?? 600_000);
        result.done.push(node.id);
        result.bytes += node.size;
        log(`remover ok ${((Date.now() - started) / 1000).toFixed(1)}s ${node.path}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        const reason: FailureReason = err instanceof TimeoutError ? 'timeout' : 'other';
        result.failed.push({ id: node.id, path: node.path, error, reason });
        log(`remover falhou ${((Date.now() - started) / 1000).toFixed(1)}s ${node.path}: ${error}`);
      }
    }
    if (result.done.length) result.summary = await this.deps.engine.call('markRemoved', { ids: result.done });
    return result;
  }
}
