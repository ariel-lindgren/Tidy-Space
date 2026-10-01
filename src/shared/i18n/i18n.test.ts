import { describe, expect, it } from 'vitest';
import { messagesFor, resolveLocale, systemLocale } from './index';

/** Formato de um catálogo: chaves aninhadas; folhas são 'string' ou 'fn/<aridade>'. */
function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'string') return [`${path}: string`];
  if (typeof value === 'function') return [`${path}: fn/${value.length}`];
  return Object.entries(value as object).flatMap(([k, v]) => shape(v, path ? `${path}.${k}` : k));
}

function leaves(value: unknown, path = ''): [string, unknown][] {
  if (typeof value !== 'object' || value === null) return [[path, value]];
  return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

describe('i18n', () => {
  it('inglês e português têm exatamente as mesmas chaves e assinaturas', () => {
    expect(shape(messagesFor('en')).sort()).toEqual(shape(messagesFor('pt-BR')).sort());
  });

  it('nenhum texto vazio e nenhum texto em português esquecido no catálogo em inglês', () => {
    for (const [key, value] of leaves(messagesFor('en'))) {
      const text = typeof value === 'function' ? String((value as (...a: unknown[]) => unknown)(2, 'x', 'y')) : value;
      expect(text, key).not.toBe('');
      expect(String(text), key).not.toMatch(/[ãõçáéíóúâêô]/i);
    }
  });

  it('idioma do sistema: português → pt-BR; qualquer outro → inglês', () => {
    expect(systemLocale(['pt-BR', 'en-US'])).toBe('pt-BR');
    expect(systemLocale(['pt-PT'])).toBe('pt-BR');
    expect(systemLocale(['pt'])).toBe('pt-BR');
    expect(systemLocale(['en-GB'])).toBe('en');
    expect(systemLocale(['de-DE', 'pt-BR'])).toBe('en');
    expect(systemLocale([])).toBe('en');
    expect(resolveLocale('system', ['pt-BR'])).toBe('pt-BR');
    expect(resolveLocale('en', ['pt-BR'])).toBe('en');
    expect(resolveLocale('pt-BR', ['ja-JP'])).toBe('pt-BR');
  });
});
