/**
 * Internacionalização: catálogos tipados por namespace (`messages/*.ts`), sem dependências.
 *
 * Cada processo (renderer, main, engine) tem o próprio idioma atual, definido com `setLocale`.
 * Os textos são lidos com `msg()` — ex.: `msg().cleanup.title`, `msg().cleanup.items(3)`.
 * No renderer, trocar o idioma remonta a interface, então ler `msg()` durante o render basta.
 */
import categories from './messages/categories';
import charts from './messages/charts';
import cleanup from './messages/cleanup';
import common from './messages/common';
import engine from './messages/engine';
import explore from './messages/explore';
import format from './messages/format';
import home from './messages/home';
import largest from './messages/largest';
import main from './messages/main';
import nav from './messages/nav';
import scan from './messages/scan';
import search from './messages/search';
import settings from './messages/settings';
import suggestions from './messages/suggestions';
import types from './messages/types';
import { LOCALES, type Locale } from './locale';

export * from './locale';

const NAMESPACES = {
  categories,
  charts,
  cleanup,
  common,
  engine,
  explore,
  format,
  home,
  largest,
  main,
  nav,
  scan,
  search,
  settings,
  suggestions,
  types,
};

type Namespaces = typeof NAMESPACES;
export type Messages = { [K in keyof Namespaces]: Namespaces[K]['en'] };

const CATALOGS = Object.fromEntries(
  LOCALES.map(locale => [
    locale,
    Object.fromEntries(Object.entries(NAMESPACES).map(([ns, byLocale]) => [ns, byLocale[locale]])),
  ]),
) as Record<Locale, Messages>;

let current: Locale = 'en';

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** Textos no idioma atual. */
export function msg(): Messages {
  return CATALOGS[current];
}

/** Textos de um idioma específico (testes, e2e). */
export function messagesFor(locale: Locale): Messages {
  return CATALOGS[locale];
}
