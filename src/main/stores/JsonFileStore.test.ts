import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '@shared/settings';
import { createSettingsStore } from './index';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-store-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('JsonFileStore', () => {
  it('usa padrões quando o arquivo não existe e grava de forma atômica', async () => {
    const file = path.join(dir, 'sub', 'settings.json');
    const store = createSettingsStore(file, 'linux');
    expect(await store.read()).toEqual(defaultSettings('linux'));
    await store.update(s => ({ ...s, theme: 'aurora' }));
    expect(JSON.parse(readFileSync(file, 'utf8')).theme).toBe('aurora');
    expect(readdirSync(path.dirname(file)).filter(f => f.endsWith('.tmp'))).toEqual([]);
  });

  it('completa configurações antigas com os padrões', async () => {
    const file = path.join(dir, 'settings.json');
    writeFileSync(file, JSON.stringify({ theme: 'solar' }));
    const s = await createSettingsStore(file, 'win32').read();
    expect(s.theme).toBe('solar');
    expect(s.allowPermanentDelete).toBe(false);
  });

  it('isola arquivo corrompido e volta aos padrões', async () => {
    const file = path.join(dir, 'settings.json');
    writeFileSync(file, '{ não é json');
    const s = await createSettingsStore(file, 'linux').read();
    expect(s).toEqual(defaultSettings('linux'));
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(dir).some(f => f.startsWith('settings.json.corrupt-'))).toBe(true);
  });

  it('rejeita gravar valor inválido', async () => {
    const store = createSettingsStore(path.join(dir, 's.json'), 'linux');
    await expect(store.write({ ...defaultSettings('linux'), threads: -1 })).rejects.toThrow();
  });

  it('serializa leitura-modificação-gravação concorrentes (sem perder atualizações)', async () => {
    const store = createSettingsStore(path.join(dir, 's.json'), 'linux');
    await Promise.all(['a', 'b', 'c'].map(p => store.update(s => ({ ...s, exclusions: [...s.exclusions, p] }))));
    const saved = JSON.parse(readFileSync(path.join(dir, 's.json'), 'utf8'));
    expect(saved.exclusions.slice(-3)).toEqual(['a', 'b', 'c']);
  });
});
