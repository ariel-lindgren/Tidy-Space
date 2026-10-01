import type { ScanProgress } from '@shared/types';
import type { Snapshot } from '../snapshot';
import type { ScanOptions, Scanner } from './Scanner';

/**
 * Decorador que atrasa a varredura (emitindo progresso nesse meio tempo). Só é usado quando
 * `TIDYSPACE_TEST_SCAN_DELAY_MS` está definido — permite testar de forma determinística fluxos
 * que dependem de uma varredura em andamento (sair da tela e voltar, cancelar etc.).
 */
export class DelayedScanner implements Scanner {
  constructor(
    private readonly inner: Scanner,
    private readonly delayMs: number,
  ) {}

  get kind() {
    return this.inner.kind;
  }

  async scan(options: ScanOptions, onProgress: (p: ScanProgress) => void, signal: AbortSignal): Promise<Snapshot> {
    const started = Date.now();
    await new Promise<void>(resolve => {
      const tick = setInterval(() => {
        onProgress({
          phase: 'scanning',
          files: 0,
          dirs: 0,
          bytes: 0,
          errors: 0,
          currentPath: options.root,
          elapsedMs: Date.now() - started,
        });
      }, 100);
      const done = () => {
        clearInterval(tick);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, this.delayMs);
      signal.addEventListener('abort', done, { once: true });
    });
    return this.inner.scan(options, onProgress, signal);
  }
}
