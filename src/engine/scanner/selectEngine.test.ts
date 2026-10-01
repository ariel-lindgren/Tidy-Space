import { describe, expect, it, vi } from 'vitest';
import { parseEngineChoice } from '@shared/engineChoice';
import type { NativeAddon } from './loadNative';
import { NativeScanner } from './NativeScanner';
import { NodeScanner } from './NodeScanner';
import { selectEngine } from './selectEngine';

const addon = {} as NativeAddon;
const ok = () => ({ addon, file: 'scanner.node' });
const missing = () => ({ addon: null, error: 'módulo não encontrado' });

describe('--engine', () => {
  it('interpreta o argumento', () => {
    expect(parseEngineChoice(undefined)).toBe('auto');
    expect(parseEngineChoice('')).toBe('auto');
    expect(parseEngineChoice(' Node ')).toBe('node');
    expect(parseEngineChoice('rust')).toBe('native');
    expect(parseEngineChoice('native')).toBe('native');
    expect(parseEngineChoice('turbo')).toBeNull();
  });

  it('auto: Rust quando disponível, senão Node', () => {
    expect(selectEngine('auto', ok).scanner).toBeInstanceOf(NativeScanner);
    const fallback = selectEngine('auto', missing);
    expect(fallback.scanner).toBeInstanceOf(NodeScanner);
    expect(fallback).toMatchObject({ addon: null, nativeError: 'módulo não encontrado' });
  });

  it('node: não carrega o módulo nativo', () => {
    const load = vi.fn(ok);
    const s = selectEngine('node', load);
    expect(s.scanner).toBeInstanceOf(NodeScanner);
    expect(s.addon).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('native: sem o módulo, a análise falha com o motivo (sem cair para o Node)', async () => {
    const s = selectEngine('native', missing);
    expect(s.scanner.kind).toBe('native');
    await expect(s.scanner.scan({} as never, () => {}, new AbortController().signal)).rejects.toThrow(
      /--engine=native.*módulo não encontrado/,
    );
  });
});
