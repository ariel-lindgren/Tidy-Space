/** Temas disponíveis (sem dependências, para não arrastar o zod para o bundle da interface). */
export const THEMES = ['neon', 'aurora', 'solar', 'glacier'] as const;
export type ThemeId = (typeof THEMES)[number];
