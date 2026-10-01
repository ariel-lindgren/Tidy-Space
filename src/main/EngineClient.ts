import { msg } from '@shared/i18n';
import type { EngineEvent, EngineMessage, EngineMethodName, EngineMethods, EngineRequest } from '../engine/protocol';

/** O mínimo que o cliente precisa de um processo filho — permite testar sem Electron. */
export interface EngineProcess {
  postMessage(message: EngineRequest): void;
  onMessage(cb: (message: EngineMessage) => void): void;
  onExit(cb: (code: number) => void): void;
  kill(): void;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export interface EngineClientOptions {
  spawn: () => EngineProcess;
  timeoutMs?: number;
  restartDelayMs?: number;
  onCrash?: (code: number) => void;
  /** Chamado a cada (re)início do processo, para reenviar configuração. */
  onStart?: () => void;
}

/** RPC tipado com o processo engine: request/response com timeout e eventos de varredura. */
export class EngineClient {
  private proc: EngineProcess | null = null;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(e: EngineEvent) => void>();
  private seq = 0;
  private stopping = false;

  constructor(private readonly options: EngineClientOptions) {}

  start(): void {
    this.stopping = false;
    const proc = this.options.spawn();
    this.proc = proc;
    proc.onMessage(msg => {
      if (msg.kind === 'event') {
        this.listeners.forEach(l => l(msg));
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    });
    proc.onExit(code => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.rejectAll(new Error(msg().main.engineExited));
      if (this.stopping) return;
      this.options.onCrash?.(code);
      setTimeout(() => !this.stopping && this.start(), this.options.restartDelayMs ?? 500);
    });
    this.options.onStart?.();
  }

  call<K extends EngineMethodName>(
    method: K,
    ...params: Parameters<EngineMethods[K]>
  ): Promise<Awaited<ReturnType<EngineMethods[K]>>> {
    const proc = this.proc;
    if (!proc) return Promise.reject(new Error(msg().main.engineUnavailable));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(msg().main.engineTimeout(method)));
      }, this.options.timeoutMs ?? 60_000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      proc.postMessage({ id, method, params });
    });
  }

  onEvent(cb: (e: EngineEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  stop(): void {
    this.stopping = true;
    this.rejectAll(new Error(msg().main.appQuitting));
    this.proc?.kill();
    this.proc = null;
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}
