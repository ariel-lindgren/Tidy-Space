/** Idiomas da interface. */
export const LOCALES = ['pt-BR', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Preferência gravada nas configurações: `system` segue o idioma do sistema operacional. */
export const LANGUAGE_PREFERENCES = ['system', ...LOCALES] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

/**
 * Idioma da interface a partir das preferências do SO (ex.: `navigator.languages` ou
 * `app.getPreferredSystemLanguages()`): português → pt-BR; qualquer outro → inglês.
 */
export function systemLocale(languages: readonly string[]): Locale {
  const first = (languages[0] ?? '').toLowerCase();
  return first === 'pt' || first.startsWith('pt-') ? 'pt-BR' : 'en';
}

export function resolveLocale(preference: LanguagePreference | undefined, languages: readonly string[]): Locale {
  return preference && preference !== 'system' ? preference : systemLocale(languages);
}
