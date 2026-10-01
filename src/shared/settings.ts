import { z } from 'zod';
import { LANGUAGE_PREFERENCES } from './i18n/locale';
import { THEMES } from './themes';

export { THEMES, type ThemeId } from './themes';

export const SETTINGS_VERSION = 1;

export const settingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  /** Idioma da interface; `system` segue o sistema operacional (português → pt-BR, senão inglês). */
  language: z.enum(LANGUAGE_PREFERENCES),
  theme: z.enum(THEMES),
  motion: z.enum(['full', 'reduced', 'off']),
  backgroundFx: z.boolean(),
  units: z.enum(['binary', 'decimal']),
  /** Tamanho em disco (padrão; arquivos só na nuvem contam 0) ou tamanho lógico. */
  measure: z.enum(['disk', 'logical']),
  /** Quantas análises manter gravadas no banco local (as mais antigas são apagadas). */
  keepScans: z.number().int().min(1).max(50),
  includeHidden: z.boolean(),
  followSymlinks: z.boolean(),
  /**
   * Identifica hard links (pnpm, WinSxS do Windows) para contar o conteúdo uma vez só e mostrar
   * o que uma limpeza realmente libera. No Windows deixa a varredura dessas pastas mais lenta.
   */
  hardLinks: z.boolean(),
  /** Não atravessa para outros sistemas de arquivos (Linux/macOS), como `du -x`. */
  oneFilesystem: z.boolean(),
  /** 0 = automático (número de CPUs). */
  threads: z.number().int().min(0).max(64),
  exclusions: z.array(z.string().trim().min(1).max(1024)).max(500),
  /** Exclusão definitiva fica desligada por padrão; a ação padrão é mover para a Lixeira. */
  allowPermanentDelete: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const settingsPatchSchema = settingsSchema.omit({ version: true }).partial();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export function defaultSettings(platform: string): Settings {
  return {
    version: SETTINGS_VERSION,
    language: 'system',
    theme: 'neon',
    motion: 'full',
    backgroundFx: true,
    units: 'binary',
    measure: 'disk',
    keepScans: 5,
    includeHidden: true,
    followSymlinks: false,
    hardLinks: true,
    // No macOS a raiz "/" é um volume de sistema e os dados do usuário estão em outro volume
    // (unidos por firmlinks), então lá não dá para restringir a um só sistema de arquivos.
    oneFilesystem: platform !== 'darwin',
    threads: 0,
    exclusions: defaultExclusions(platform),
    allowPermanentDelete: false,
  };
}

/**
 * Pontos que não representam uso real de disco (ou que só o sistema lê). Exclusões que contêm a
 * raiz da análise são ignoradas naquela análise (ver `effectiveExclusions`).
 */
export function defaultExclusions(platform: string): string[] {
  switch (platform) {
    case 'win32':
      return ['C:\\System Volume Information'];
    case 'darwin':
      // /System/Volumes espelha /Users etc. (firmlinks) e /Volumes são outros discos.
      return ['/System/Volumes', '/Volumes', '/dev', '/private/var/vm'];
    default:
      return ['/proc', '/sys', '/dev', '/run', '/snap'];
  }
}

/** Remove exclusões que são a própria raiz ou ancestrais dela (senão nada seria analisado). */
export function effectiveExclusions(exclusions: readonly string[], root: string, platform: string): string[] {
  const fold = (p: string) => {
    const n = p.replace(/[\\/]+/g, '/').replace(/\/+$/, '') || '/';
    return platform === 'win32' || platform === 'darwin' ? n.toLowerCase() : n;
  };
  const r = fold(root);
  return exclusions.filter(e => {
    if (!e.includes('/') && !e.includes('\\')) return true;
    const x = fold(e);
    return !(r === x || r.startsWith(x === '/' ? '/' : `${x}/`));
  });
}
