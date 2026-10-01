import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 5 * 1024 * 1024;

export type Log = (message: string) => void;

/**
 * Log simples em arquivo (`<userData>/logs/tidyspace.log`), com rotação em 5 MB. Serve para
 * diagnosticar operações demoradas ou com falha (ex.: remoções) sem depender do console.
 */
export function createFileLogger(dir: string): Log & { file: string } {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'tidyspace.log');
  const log = ((message: string) => {
    try {
      const size = statSync(file, { throwIfNoEntry: false })?.size ?? 0;
      if (size > MAX_BYTES) renameSync(file, `${file}.1`);
      appendFileSync(file, `${new Date().toISOString()} ${message}\n`, 'utf8');
    } catch {
      /* log nunca derruba o app */
    }
  }) as Log & { file: string };
  log.file = file;
  return log;
}
