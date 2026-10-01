import type { MouseEvent } from 'react';
import { create } from 'zustand';
import type { Units } from '@shared/format';
import { msg } from '@shared/i18n';
import type { NodeId, TreeViewNode } from '@shared/types';
import type { ColorMode } from '../lib/colors';

/**
 * O destaque cruzado (tabela ↔ gráfico) vem de `useHover` e o tooltip de {@link useTooltip}:
 * nenhum dos dois passa por props, então mexer o mouse não re-renderiza a tela.
 */
export interface ChartProps {
  view: TreeViewNode;
  colorMode: ColorMode;
  animate: boolean;
  /** Direção da última navegação — muda a animação de entrada. */
  direction: 'down' | 'up';
  units: Units;
  canGoUp: boolean;
  onDrill(id: NodeId): void;
  onUp(): void;
  onSelect(node: TreeViewNode): void;
  onHover(node: TreeViewNode | null, parent: TreeViewNode | null, e?: MouseEvent): void;
  onContext(node: TreeViewNode, e: MouseEvent): void;
}

export interface TooltipTarget {
  node: TreeViewNode;
  parent: TreeViewNode | null;
  x: number;
  y: number;
}

/**
 * Nome exibido de um nó. O grupo "itens menores" é rotulado aqui a partir de `groupedCount`,
 * para acompanhar o idioma da interface (o nome vindo do motor fica como fallback).
 */
export function nodeName(node: TreeViewNode): string {
  return node.kind === 'group' && node.groupedCount !== undefined
    ? msg().charts.smallerItems(node.groupedCount)
    : node.name;
}

export const useTooltip = create<{ target: TooltipTarget | null; set(t: TooltipTarget | null): void }>(set => ({
  target: null,
  set: target => set({ target }),
}));
