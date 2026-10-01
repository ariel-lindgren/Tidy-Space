import { describe, expect, it } from 'vitest';
import { category, categoryOfName, extensionOf } from './categories';

describe('categories', () => {
  it('extrai extensão em minúsculas', () => {
    expect(extensionOf('Filme.MKV')).toBe('mkv');
    expect(extensionOf('.bashrc')).toBe('');
    expect(extensionOf('sem-extensao')).toBe('');
    expect(extensionOf('arquivo.')).toBe('');
  });

  it('classifica por extensão', () => {
    expect(categoryOfName('a.mp4')).toBe('video');
    expect(categoryOfName('disk.vhdx')).toBe('vdisk');
    expect(categoryOfName('x.unknown')).toBe('other');
    expect(category('video').label).toBe('Vídeos');
  });
});
