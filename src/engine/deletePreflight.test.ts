import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeBlock, nodeChecker } from './deletePreflight';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-del-'));
  mkdirSync(path.join(dir, 'a', 'b'), { recursive: true });
  writeFileSync(path.join(dir, 'a', 'b', 'x.txt'), 'x');
});
afterEach(() => {
  try {
    chmodSync(path.join(dir, 'a', 'b'), 0o755);
  } catch {
    /* ignora */
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('verificação antes de remover', () => {
  it('no Windows sem módulo nativo, não há como verificar (e não bloqueia)', async () => {
    expect(await nodeChecker('win32')(path.join(dir, 'a'))).toEqual({ ok: true, verified: false });
  });

  it.skipIf(process.platform === 'win32')('unix: libera árvore gravável', async () => {
    expect(await nodeChecker('linux')(path.join(dir, 'a'))).toEqual({ ok: true, verified: true });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'unix: aponta item em pasta sem escrita',
    async () => {
      chmodSync(path.join(dir, 'a', 'b'), 0o555);
      const r = await nodeChecker('linux')(path.join(dir, 'a'));
      expect(r).toMatchObject({ ok: false, blocker: 'permission', blockedPath: path.join(dir, 'a', 'b', 'x.txt') });
    },
  );

  it('item que sumiu é reportado', async () => {
    if (process.platform === 'win32') return;
    expect(await nodeChecker('linux')(path.join(dir, 'nope'))).toMatchObject({ ok: false, blocker: 'missing' });
  });

  it('descreve o motivo para o usuário', () => {
    expect(describeBlock({ ok: false, verified: true, blocker: 'permission', blockedPath: 'C:\\a\\b' }, 'C:\\a')).toBe(
      'requer permissão de administrador (C:\\a\\b)',
    );
    expect(describeBlock({ ok: false, verified: true, blocker: 'in-use', blockedPath: 'C:\\a' }, 'C:\\a')).toBe(
      'em uso por outro programa',
    );
    expect(describeBlock({ ok: false, verified: true, blocker: 'missing' }, 'x')).toBe('não existe mais no disco');
  });
});
