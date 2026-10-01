import { describe, expect, it } from 'vitest';
import { defaultSettings, effectiveExclusions, settingsPatchSchema, settingsSchema } from './settings';

describe('settings', () => {
  it.each(['win32', 'darwin', 'linux'])('padrões de %s passam no schema', platform => {
    expect(settingsSchema.safeParse(defaultSettings(platform)).success).toBe(true);
  });

  it('exclusão definitiva começa desligada e macOS não restringe a um sistema de arquivos', () => {
    expect(defaultSettings('linux').allowPermanentDelete).toBe(false);
    expect(defaultSettings('darwin').oneFilesystem).toBe(false);
    expect(defaultSettings('linux').oneFilesystem).toBe(true);
  });

  it('valida patches parciais', () => {
    expect(settingsPatchSchema.safeParse({ theme: 'aurora' }).success).toBe(true);
    expect(settingsPatchSchema.safeParse({ theme: 'rosa' }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ threads: 999 }).success).toBe(false);
    expect(settingsPatchSchema.safeParse({ version: 2 }).data).toEqual({});
  });

  it('ignora exclusões que contêm a raiz da análise', () => {
    const ex = ['/Volumes', '/dev', 'node_modules', '*.tmp'];
    expect(effectiveExclusions(ex, '/Volumes/Backup', 'darwin')).toEqual(['/dev', 'node_modules', '*.tmp']);
    expect(effectiveExclusions(['C:\\Jogos'], 'c:\\jogos\\steam', 'win32')).toEqual([]);
    expect(effectiveExclusions(['/proc'], '/', 'linux')).toEqual(['/proc']);
  });
});
