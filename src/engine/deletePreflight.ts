import { constants } from 'node:fs';
import { access, lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { msg } from '@shared/i18n';
import type { NativeAddon } from './scanner/loadNative';

export type DeleteBlocker = 'permission' | 'in-use' | 'missing' | 'other';

export interface DeleteCheck {
  ok: boolean;
  blocker?: DeleteBlocker;
  /** Primeiro item (dentro da pasta, se for o caso) que impede a remoção. */
  blockedPath?: string;
  message?: string;
  /** false quando não há como verificar nesta plataforma/motor (a remoção segue sem garantia). */
  verified: boolean;
}

/** Verifica se um caminho pode ser removido pelo usuário atual, sem pedir elevação. */
export type DeleteChecker = (target: string) => Promise<DeleteCheck>;

/** Limite de entradas verificadas por item (pastas gigantes são verificadas parcialmente). */
export const MAX_CHECK_ENTRIES = 20_000;

export function nativeChecker(addon: NativeAddon): DeleteChecker {
  return async target => {
    const r = addon.checkDeletable(target, MAX_CHECK_ENTRIES);
    return {
      ok: r.ok,
      verified: true,
      ...(r.blocker ? { blocker: r.blocker as DeleteBlocker } : {}),
      ...(r.blockedPath ? { blockedPath: r.blockedPath } : {}),
      ...(r.message ? { message: r.message } : {}),
    };
  };
}

/**
 * Fallback sem módulo nativo. Unix: remover exige escrita e execução na pasta que contém cada
 * item. Windows: o Node não enxerga ACLs — não há como verificar (a remoção tem timeout).
 */
export function nodeChecker(platform: string = process.platform): DeleteChecker {
  if (platform === 'win32') return async () => ({ ok: true, verified: false });
  return async target => {
    const stack = [target];
    let checked = 0;
    while (stack.length && checked < MAX_CHECK_ENTRIES) {
      const current = stack.pop() as string;
      checked++;
      let isDir: boolean;
      try {
        isDir = (await lstat(current)).isDirectory();
      } catch (err) {
        return { ok: false, verified: true, blocker: 'missing', blockedPath: current, message: String(err) };
      }
      try {
        await access(path.dirname(current), constants.W_OK | constants.X_OK);
      } catch (err) {
        return { ok: false, verified: true, blocker: 'permission', blockedPath: current, message: String(err) };
      }
      if (isDir) {
        try {
          stack.push(...(await readdir(current)).map(n => path.join(current, n)));
        } catch (err) {
          return { ok: false, verified: true, blocker: 'permission', blockedPath: current, message: String(err) };
        }
      }
    }
    return { ok: true, verified: true };
  };
}

/** Texto para o usuário explicando por que um item não pôde ser removido. */
export function describeBlock(check: DeleteCheck, itemPath: string): string {
  const where = check.blockedPath && check.blockedPath !== itemPath ? ` (${check.blockedPath})` : '';
  const t = msg().engine;
  switch (check.blocker) {
    case 'permission':
      return t.blockPermission(where);
    case 'in-use':
      return t.blockInUse(where);
    case 'missing':
      return t.blockMissing;
    default:
      return t.blockOther(where, check.message ?? t.unknownError);
  }
}
