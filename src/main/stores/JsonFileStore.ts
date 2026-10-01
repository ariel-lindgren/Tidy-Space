import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';

export interface JsonFileStoreOptions<T> {
  file: string;
  schema: z.ZodType<T>;
  defaults: () => T;
  /** Converte formatos antigos/incompletos para o atual antes da validação. */
  migrate?: (raw: unknown) => unknown;
  onCorrupt?: (file: string, reason: string) => void;
}

/**
 * Persistência local em JSON:
 * - validação com zod na leitura (arquivo inválido → backup `.corrupt-<data>` e valores padrão);
 * - gravação atômica (arquivo temporário + rename), então uma queda nunca deixa o JSON pela metade;
 * - gravações serializadas numa fila.
 */
export class JsonFileStore<T> {
  private cache: T | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly options: JsonFileStoreOptions<T>) {}

  get file(): string {
    return this.options.file;
  }

  async read(): Promise<T> {
    if (this.cache) return this.cache;
    const { file, schema, defaults, migrate = (x: unknown) => x } = this.options;
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') await this.quarantine(String(err));
      this.cache = defaults();
      return this.cache;
    }
    try {
      const parsed = schema.safeParse(migrate(JSON.parse(text)));
      if (parsed.success) {
        this.cache = parsed.data;
        return this.cache;
      }
      await this.quarantine(parsed.error.message);
    } catch (err) {
      await this.quarantine(String(err));
    }
    this.cache = defaults();
    return this.cache;
  }

  write(value: T): Promise<T> {
    return this.exclusive(() => this.persist(value));
  }

  /** Leitura-modificação-gravação atômica em relação a outras chamadas deste store. */
  update(fn: (current: T) => T): Promise<T> {
    return this.exclusive(async () => this.persist(fn(await this.read())));
  }

  private exclusive<R>(task: () => Promise<R>): Promise<R> {
    const run = this.queue.then(task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async persist(value: T): Promise<T> {
    const valid = this.options.schema.parse(value);
    await atomicWrite(this.options.file, `${JSON.stringify(valid, null, 2)}\n`);
    this.cache = valid;
    return valid;
  }

  private async quarantine(reason: string): Promise<void> {
    const { file, onCorrupt } = this.options;
    onCorrupt?.(file, reason);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await rename(file, `${file}.corrupt-${stamp}`).catch(() => undefined);
  }
}

async function atomicWrite(file: string, data: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data, 'utf8');
  await rename(tmp, file);
}
