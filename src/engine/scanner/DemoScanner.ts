import type { ScanProgress } from '@shared/types';
import type { Snapshot } from '../snapshot';
import type { ScanOptions, Scanner } from './Scanner';

/**
 * Decorador para gerar os prints do README (`TIDYSPACE_DEMO=1`, ver e2e/demo.ts): a pasta
 * fictícia usa arquivos esparsos — GBs de tamanho lógico ocupando ~0 —, então aqui cada arquivo
 * passa a "ocupar" o próprio tamanho lógico, e sugestões e totais em disco ficam realistas.
 */
export class DemoScanner implements Scanner {
  constructor(private readonly inner: Scanner) {}

  get kind() {
    return this.inner.kind;
  }

  async scan(options: ScanOptions, onProgress: (p: ScanProgress) => void, signal: AbortSignal): Promise<Snapshot> {
    const s = await this.inner.scan(options, onProgress, signal);
    return { ...s, allocated: Float64Array.from(s.sizes), flags: new Uint8Array(s.flags.length) };
  }
}

/** Volume fictício dos prints (o disco real não aparece). */
export const DEMO_VOLUME = { total: 1024 ** 4, available: 0.38 * 1024 ** 4 };
