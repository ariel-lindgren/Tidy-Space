import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { snapshotFromTree } from '../snapshot';
import { DelayedScanner } from './DelayedScanner';
import type { ScanOptions, Scanner } from './Scanner';

const inner: Scanner = { kind: 'node', scan: async () => snapshotFromTree('/x', { name: '', children: [] }) };
const options = { root: '/x' } as ScanOptions;
let dir: string | undefined;
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

describe('DelayedScanner (testes E2E)', () => {
  it('segura a varredura enquanto o arquivo de retenção existir', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-hold-'));
    const hold = path.join(dir, 'hold');
    writeFileSync(hold, '');
    let finished = false;
    const scan = new DelayedScanner(inner, 0, hold)
      .scan(options, () => {}, new AbortController().signal)
      .then(() => (finished = true));
    await new Promise(r => setTimeout(r, 350));
    expect(finished).toBe(false);
    rmSync(hold);
    await scan;
    expect(finished).toBe(true);
  });

  it('cancelar libera a espera', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-hold-'));
    const hold = path.join(dir, 'hold');
    writeFileSync(hold, '');
    const controller = new AbortController();
    const scan = new DelayedScanner(inner, 0, hold).scan(options, () => {}, controller.signal);
    controller.abort();
    await expect(scan).resolves.toBeDefined();
  });
});
