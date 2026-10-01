import { create } from 'zustand';
import type { CategoryId, NodeId, TopItem } from '@shared/types';

export interface QueueItem {
  id: NodeId;
  name: string;
  path: string;
  parentPath: string;
  /** O que a limpeza libera: bytes em disco menos o conteúdo compartilhado por hard links. */
  size: number;
  /**
   * Bytes em disco que continuam ocupados após remover o item, porque o conteúdo tem outro nome
   * (hard links — ex.: `node_modules` do pnpm, ligado ao store).
   */
  shared: number;
  /** Arquivos dentro do item (estimativa de duração da remoção). */
  files: number;
  kind: string;
  category: CategoryId;
}

/** Item da fila a partir de um item da análise. */
export const toQueueItem = (
  i: Pick<TopItem, 'id' | 'name' | 'path' | 'parentPath' | 'disk' | 'shared' | 'files' | 'kind' | 'category'>,
): QueueItem => ({
  id: i.id,
  name: i.name,
  path: i.path,
  parentPath: i.parentPath,
  size: i.disk - i.shared,
  shared: i.shared,
  files: i.files,
  kind: i.kind,
  category: i.category,
});

const isInside = (child: string, parent: string) =>
  child.length > parent.length && child.startsWith(parent) && /[\\/]/.test(child.charAt(parent.length));

interface QueueState {
  items: QueueItem[];
  /** Adiciona sem duplicar: ignora itens dentro de outro já na fila e substitui filhos pelo pai. */
  add(items: QueueItem[]): { added: number; bytes: number };
  remove(ids: readonly NodeId[]): void;
  clear(): void;
}

export const useQueue = create<QueueState>((set, get) => ({
  items: [],
  add: incoming => {
    let items = [...get().items];
    let added = 0;
    let bytes = 0;
    for (const item of incoming) {
      if (items.some(q => q.id === item.id || isInside(item.path, q.path))) continue;
      items = items.filter(q => !isInside(q.path, item.path));
      items.push(item);
      added++;
      bytes += item.size;
    }
    set({ items: items.sort((a, b) => b.size - a.size) });
    return { added, bytes };
  },
  remove: ids => set(s => ({ items: s.items.filter(q => !ids.includes(q.id)) })),
  clear: () => set({ items: [] }),
}));

export const queueTotal = (items: readonly QueueItem[]) => items.reduce((a, q) => a + q.size, 0);

/** Bytes que continuam no disco após a limpeza por serem hard links (ver {@link QueueItem.shared}). */
export const queueShared = (items: readonly QueueItem[]) => items.reduce((a, q) => a + q.shared, 0);
