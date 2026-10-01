import { describe, expect, it } from 'vitest';
import { Excludes } from './excludes';

// Mesmos casos de src/native/core/src/exclude.rs — as duas implementações precisam concordar.
describe('Excludes', () => {
  it('casa por nome exato', () => {
    const e = new Excludes(['node_modules'], false);
    expect(e.matches('/a/node_modules', 'node_modules')).toBe(true);
    expect(e.matches('/a/node_modules2', 'node_modules2')).toBe(false);
  });

  it('casa extensão sem diferenciar maiúsculas', () => {
    const e = new Excludes(['*.tmp'], true);
    expect(e.matches('/a/x.TMP', 'x.TMP')).toBe(true);
    expect(e.matches('/a/tmp', 'tmp')).toBe(false);
  });

  it('casa prefixo de caminho só em fronteira de componente', () => {
    const e = new Excludes(['C:\\Jogos\\'], true);
    expect(e.matches('c:/jogos', 'jogos')).toBe(true);
    expect(e.matches('C:\\Jogos\\Steam', 'Steam')).toBe(true);
    expect(e.matches('C:\\Jogos2', 'Jogos2')).toBe(false);
  });

  it('ignora padrões vazios e escolhe sensibilidade pela plataforma', () => {
    expect(new Excludes(['', '  '], false).isEmpty).toBe(true);
    expect(Excludes.forPlatform(['Foo'], 'linux').matches('/Foo', 'foo')).toBe(false);
    expect(Excludes.forPlatform(['Foo'], 'darwin').matches('/Foo', 'foo')).toBe(true);
  });
});
