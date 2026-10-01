import { existsSync } from 'node:fs';
import type { ScanProgress } from '@shared/types';
import type { Snapshot } from '../snapshot';
import type { ScanOptions, Scanner } from './Scanner';

/**
 * Decorador que atrasa a varredura (emitindo progresso nesse meio tempo). Só é usado nos testes
 * E2E, para exercitar fluxos que dependem de uma varredura em andamento (sair da tela e voltar,
 * aviso de conclusão etc.):
 * - `TIDYSPACE_TEST_SCAN_DELAY_MS`: atraso fixo;
 * - `TIDYSPACE_TEST_SCAN_HOLD`: caminho de um arquivo; enquanto ele existir, a varredura não
 *   termina. O teste decide quando ela acaba, independentemente da velocidade da máquina.
 */
export class DelayedScanner implements Scanner {
  constructor(
    private readonly inner: Scanner,
    private readonly delayMs: number,
    private readonly holdFile?: string,
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
      const hold = this.holdFile;
      // Depois do atraso, continua esperando enquanto o arquivo de retenção existir.
      const check = () => {
        if (hold && existsSync(hold)) timer = setTimeout(check, 100);
        else done();
      };
      let timer = setTimeout(check, this.delayMs);
      signal.addEventListener('abort', done, { once: true });
    });
    return this.inner.scan(options, onProgress, signal);
  }
}
