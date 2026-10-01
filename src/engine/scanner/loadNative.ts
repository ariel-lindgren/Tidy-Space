import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { msg } from '@shared/i18n';
import type { ScanProgress } from '@shared/types';

type NativeProgress = Omit<ScanProgress, 'phase'>;

/** Forma do módulo gerado por `src/native/node` (ver `index.d.ts` gerado pelo napi). */
export interface NativeAddon {
  ScanJob: new (options: {
    root: string;
    threads?: number;
    followSymlinks?: boolean;
    hardLinks?: boolean;
    oneFilesystem?: boolean;
    includeHidden?: boolean;
    excludes?: string[];
  }) => {
    progress(): NativeProgress;
    cancel(): void;
    run(): Promise<{
      rootPath: string;
      names: string;
      parents: Uint32Array;
      kinds: Uint8Array;
      sizes: Float64Array;
      allocated: Float64Array;
      flags: Uint8Array;
      mtimes: Float64Array;
      issues: { path: string; message: string }[];
      errorCount: number;
      cancelled: boolean;
      elapsedMs: number;
    }>;
  };
  checkDeletable(
    path: string,
    maxEntries: number,
  ): {
    ok: boolean;
    blockedPath?: string | null;
    blocker?: string | null;
    message?: string | null;
    checked: number;
    truncated: boolean;
  };
  listVolumes(): {
    name: string;
    mountPoint: string;
    fileSystem: string;
    total: number;
    available: number;
    removable: boolean;
    kind: string;
  }[];
}

export type LoadResult = { addon: NativeAddon; file: string } | { addon: null; error: string };

/**
 * Procura `scanner.<plataforma>-<arch>[-abi].node` nas pastas candidatas (empacotado em
 * `resources/native`, ou `src/native/node/dist` em desenvolvimento) e tenta carregar.
 */
export function loadNativeAddon(searchDirs: readonly string[]): LoadResult {
  const prefix = `scanner.${process.platform}-${process.arch}`;
  const require = createRequire(import.meta.url);
  const errors: string[] = [];
  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    const candidates = readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.node'));
    for (const file of candidates) {
      const full = path.join(dir, file);
      try {
        return { addon: require(full) as NativeAddon, file: full };
      } catch (err) {
        errors.push(`${full}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return {
    addon: null,
    error: errors.length
      ? errors.join('; ')
      : msg().engine.nativeModuleNotFound(`${prefix}*.node`, searchDirs.join(', ')),
  };
}
