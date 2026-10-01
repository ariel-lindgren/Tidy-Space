import type { Locale } from './locale';

/**
 * Catálogo de um namespace: o português é a referência e define o formato (textos e funções
 * para plurais/interpolação); o inglês precisa ter exatamente as mesmas chaves e assinaturas.
 */
export function defineMessages<T extends object>(ptBR: T, en: T): Record<Locale, T> {
  return { 'pt-BR': ptBR, en };
}
