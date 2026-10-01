import { msg } from '@shared/i18n';
import type { NodeId, Suggestion } from '@shared/types';
import type { TreeIndex } from '../tree/TreeIndex';
import { DEFAULT_RULES, RuleContext, type SuggestionEnv, type SuggestionRule } from './rules';

/** Sugestão calculada na gravação da análise; tamanhos e itens são lidos depois do banco. */
export type ComputedSuggestion = Omit<Suggestion, 'size' | 'itemCount' | 'items'> & { itemIds: NodeId[] };

/**
 * Aplica as regras ao índice. Cada byte aparece em no máximo uma sugestão: itens dentro de algo
 * já reivindicado (por esta ou por uma regra anterior) são descartados, assim como itens que
 * contêm algo já reivindicado. Custo O(n + k·log k) — marcação por intervalos da pré-ordem.
 */
export function computeSuggestions(
  index: TreeIndex,
  env: SuggestionEnv,
  rules: readonly SuggestionRule[] = DEFAULT_RULES,
): ComputedSuggestion[] {
  const ctx = new RuleContext(index, env);
  const claimed = new Uint8Array(index.size);
  const starts: number[] = []; // inícios de intervalos reivindicados, ordenados

  const containsClaimed = (id: NodeId) => {
    let lo = 0;
    let hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((starts[mid] as number) <= id) lo = mid + 1;
      else hi = mid;
    }
    return lo < starts.length && (starts[lo] as number) < index.endOf(id);
  };
  const claim = (id: NodeId) => {
    claimed.fill(1, id, index.endOf(id));
    let lo = 0;
    let hi = starts.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((starts[mid] as number) < id) lo = mid + 1;
      else hi = mid;
    }
    starts.splice(lo, 0, id);
  };

  const out: ComputedSuggestion[] = [];
  for (const rule of rules) {
    if (rule.platforms && !rule.platforms.includes(env.platform)) continue;
    // Ordem crescente: um ancestral sempre é avaliado antes dos seus descendentes.
    const ids = [...new Set(rule.collect(ctx))]
      .filter(id => id > 0 && index.has(id) && index.freeableOf(id) > 0)
      .sort((a, b) => a - b);
    const picked: NodeId[] = [];
    for (const id of ids) {
      if (claimed[id] || containsClaimed(id)) continue;
      claim(id);
      picked.push(id);
    }
    if (!picked.length) continue;
    const { title, description } = msg().suggestions[rule.id];
    out.push({
      id: rule.id,
      title,
      description,
      icon: rule.icon,
      risk: rule.risk,
      action: rule.action,
      ...(rule.command ? { command: rule.command(env) } : {}),
      itemIds: picked,
    });
  }
  return out;
}
