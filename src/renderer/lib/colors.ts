import { category } from '@shared/categories';
import type { CategoryId } from '@shared/types';

export type ColorMode = 'folder' | 'type';

/** Cores vêm de variáveis CSS do tema, então trocar de tema recolore tudo sem re-render. */
export const categoryColor = (c: CategoryId): string => `var(--c${category(c).color})`;

export const paletteColor = (index: number): string => `var(--c${(index % 8) + 1})`;

export function nodeColor(mode: ColorMode, cat: CategoryId, branchIndex: number, isGroup = false): string {
  if (mode === 'type') return categoryColor(cat);
  return isGroup ? 'var(--c0)' : paletteColor(branchIndex);
}
