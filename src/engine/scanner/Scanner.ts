import type { ScannerEngineKind, ScanProgress } from '@shared/types';
import type { Snapshot } from '../snapshot';

export interface ScanOptions {
  root: string;
  /** 0 = automático. */
  threads: number;
  followSymlinks: boolean;
  /** Identificar hard links (conteúdo contado uma vez, marcado com `FLAG.hardlink`). */
  hardLinks: boolean;
  oneFilesystem: boolean;
  includeHidden: boolean;
  excludes: string[];
}

/**
 * Estratégia de varredura. Implementações: {@link NativeScanner} (Rust, preferida) e
 * {@link NodeScanner} (fallback em TypeScript, usada quando o módulo nativo não carrega).
 * Ambas devolvem o mesmo {@link Snapshot}, então o resto do engine não sabe qual rodou.
 */
export interface Scanner {
  readonly kind: ScannerEngineKind;
  scan(options: ScanOptions, onProgress: (p: ScanProgress) => void, signal: AbortSignal): Promise<Snapshot>;
}

export const PROGRESS_INTERVAL_MS = 120;
