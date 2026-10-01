/**
 * Motor de varredura pedido na inicialização (`--engine=` ou `TIDYSPACE_ENGINE`):
 * - `auto` (padrão): Rust; se o módulo não carregar, Node.
 * - `native` (ou `rust`): exige o Rust — se não carregar, as análises falham com o motivo.
 * - `node`: só TypeScript, sem nada nativo (reproduz o fallback mesmo com o módulo disponível).
 */
export const ENGINE_CHOICES = ['auto', 'native', 'node'] as const;
export type EngineChoice = (typeof ENGINE_CHOICES)[number];

/** Valor vazio → `auto`; inválido → `null` (quem chama avisa e usa `auto`). */
export function parseEngineChoice(value: string | undefined | null): EngineChoice | null {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return 'auto';
  if (v === 'rust') return 'native';
  return (ENGINE_CHOICES as readonly string[]).includes(v) ? (v as EngineChoice) : null;
}
