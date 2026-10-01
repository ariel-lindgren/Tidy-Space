import type { EngineChoice } from '@shared/engineChoice';
import { msg } from '@shared/i18n';
import type { ScanProgress } from '@shared/types';
import type { Snapshot } from '../snapshot';
import type { LoadResult, NativeAddon } from './loadNative';
import { NativeScanner } from './NativeScanner';
import { NodeScanner } from './NodeScanner';
import type { ScanOptions, Scanner } from './Scanner';

export interface EngineSelection {
  scanner: Scanner;
  /** Módulo nativo para volumes e pré-checagem de exclusão; `null` = usa as versões em Node. */
  addon: NativeAddon | null;
  /** Por que o motor nativo não está em uso (exibido na interface). */
  nativeError: string | null;
}

/**
 * Escolhe o scanner (e o uso do módulo nativo) conforme o motor pedido. `load` só é chamado
 * quando o motor nativo pode ser usado — com `node`, o módulo nem é carregado.
 */
export function selectEngine(choice: EngineChoice, load: () => LoadResult): EngineSelection {
  if (choice === 'node') {
    return { scanner: new NodeScanner(), addon: null, nativeError: msg().engine.nodeEngineChosen };
  }
  const loaded = load();
  if (loaded.addon) return { scanner: new NativeScanner(loaded.addon), addon: loaded.addon, nativeError: null };
  if (choice === 'native') {
    return { scanner: new UnavailableScanner(loaded.error), addon: null, nativeError: loaded.error };
  }
  return { scanner: new NodeScanner(), addon: null, nativeError: loaded.error };
}

/** `--engine=native` sem o módulo: cada análise falha explicando o motivo. */
class UnavailableScanner implements Scanner {
  readonly kind = 'native' as const;
  constructor(private readonly reason: string) {}
  scan(_o: ScanOptions, _p: (p: ScanProgress) => void, _s: AbortSignal): Promise<Snapshot> {
    return Promise.reject(new Error(msg().engine.nativeRequired(this.reason)));
  }
}
