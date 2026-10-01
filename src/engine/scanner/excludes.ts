/**
 * Regras de exclusão — espelho exato de `src/native/core/src/exclude.rs` (os testes das duas
 * implementações usam os mesmos casos):
 * - contém separador → prefixo de caminho, respeitando fronteira de componente
 * - começa com "*." → extensão
 * - demais → nome exato
 */
type Rule = { type: 'path' | 'ext' | 'name'; value: string };

export class Excludes {
  private readonly rules: Rule[];

  constructor(
    patterns: readonly string[],
    private readonly caseInsensitive: boolean,
  ) {
    const fold = (s: string) => (caseInsensitive ? s.toLowerCase() : s);
    this.rules = patterns
      .map(p => p.trim())
      .filter(Boolean)
      .map((p): Rule => {
        if (p.includes('/') || p.includes('\\')) return { type: 'path', value: fold(normalize(p)) };
        if (p.startsWith('*.')) return { type: 'ext', value: fold(p.slice(1)) };
        return { type: 'name', value: fold(p) };
      });
  }

  static forPlatform(patterns: readonly string[], platform: string): Excludes {
    return new Excludes(patterns, platform === 'win32' || platform === 'darwin');
  }

  get isEmpty(): boolean {
    return this.rules.length === 0;
  }

  matches(fullPath: string, name: string): boolean {
    if (!this.rules.length) return false;
    const fold = (s: string) => (this.caseInsensitive ? s.toLowerCase() : s);
    const n = fold(name);
    let full: string | undefined;
    return this.rules.some(r => {
      if (r.type === 'name') return n === r.value;
      if (r.type === 'ext') return n.endsWith(r.value);
      full ??= fold(normalize(fullPath));
      return full === r.value || (full.startsWith(r.value) && full.charAt(r.value.length) === '/');
    });
  }
}

function normalize(p: string): string {
  const s = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return s || '/';
}
