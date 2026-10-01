import { describe, expect, it, vi } from 'vitest';
import type { EngineMessage, EngineRequest } from '../engine/protocol';
import { EngineClient, type EngineProcess } from './EngineClient';

class FakeProcess implements EngineProcess {
  sent: EngineRequest[] = [];
  private msg: (m: EngineMessage) => void = () => {};
  private exit: (c: number) => void = () => {};
  killed = false;
  postMessage(m: EngineRequest) {
    this.sent.push(m);
  }
  onMessage(cb: (m: EngineMessage) => void) {
    this.msg = cb;
  }
  onExit(cb: (c: number) => void) {
    this.exit = cb;
  }
  kill() {
    this.killed = true;
  }
  reply(m: EngineMessage) {
    this.msg(m);
  }
  die(code: number) {
    this.exit(code);
  }
}

function setup(timeoutMs = 1000) {
  const procs: FakeProcess[] = [];
  const onCrash = vi.fn();
  const client = new EngineClient({
    spawn: () => {
      const p = new FakeProcess();
      procs.push(p);
      return p;
    },
    timeoutMs,
    restartDelayMs: 0,
    onCrash,
  });
  client.start();
  return { client, procs, onCrash };
}

describe('EngineClient', () => {
  it('correlaciona respostas por id', async () => {
    const { client, procs } = setup();
    const a = client.call('summary');
    const b = client.call('findPath', { path: '/x' });
    const [ra, rb] = procs[0]?.sent ?? [];
    procs[0]?.reply({ kind: 'reply', id: rb?.id as number, ok: true, result: 7 });
    procs[0]?.reply({ kind: 'reply', id: ra?.id as number, ok: false, error: 'falhou' });
    await expect(b).resolves.toBe(7);
    await expect(a).rejects.toThrow('falhou');
    expect(rb).toMatchObject({ method: 'findPath', params: [{ path: '/x' }] });
  });

  it('entrega eventos aos ouvintes', () => {
    const { client, procs } = setup();
    const seen = vi.fn();
    const off = client.onEvent(seen);
    procs[0]?.reply({ kind: 'event', type: 'cancelled', scanId: 1 });
    off();
    procs[0]?.reply({ kind: 'event', type: 'cancelled', scanId: 2 });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('expira chamadas sem resposta', async () => {
    vi.useFakeTimers();
    const { client } = setup(50);
    const p = client.call('summary');
    vi.advanceTimersByTime(60);
    await expect(p).rejects.toThrow(/tempo esgotado/);
    vi.useRealTimers();
  });

  it('rejeita pendentes e reinicia se o processo morrer', async () => {
    const { client, procs, onCrash } = setup();
    const p = client.call('summary');
    procs[0]?.die(3);
    await expect(p).rejects.toThrow(/encerrado/);
    expect(onCrash).toHaveBeenCalledWith(3);
    await new Promise(r => setTimeout(r, 5));
    expect(procs).toHaveLength(2);
  });

  it('não reinicia após stop', async () => {
    const { client, procs } = setup();
    client.stop();
    procs[0]?.die(0);
    await new Promise(r => setTimeout(r, 5));
    expect(procs).toHaveLength(1);
    expect(procs[0]?.killed).toBe(true);
    await expect(client.call('summary')).rejects.toThrow(/indisponível/);
  });
});
