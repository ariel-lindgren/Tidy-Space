import { create } from 'zustand';
import type { NodeId } from '@shared/types';

// ---------------------------------------------------------------- toasts

export interface ToastAction {
  label: string;
  run(): void;
}

export interface Toast {
  id: number;
  message: string;
  icon: string;
  leaving: boolean;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push(message: string, icon?: string, action?: ToastAction): void;
  dismiss(id: number): void;
}

let toastSeq = 0;

export const useToasts = create<ToastState>(set => ({
  toasts: [],
  push: (message, icon = 'check', action) => {
    const id = ++toastSeq;
    set(s => ({
      toasts: [...s.toasts, { id, message, icon, leaving: false, ...(action ? { action } : {}) }].slice(-4),
    }));
    // Avisos com ação ficam mais tempo na tela.
    setTimeout(() => useToasts.getState().dismiss(id), action ? 8000 : 2800);
  },
  dismiss: id => {
    set(s => ({ toasts: s.toasts.map(t => (t.id === id ? { ...t, leaving: true } : t)) }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 300);
  },
}));

export const toast = (message: string, icon?: string, action?: ToastAction) =>
  useToasts.getState().push(message, icon, action);

// ---------------------------------------------------------------- foco (hover) compartilhado

/**
 * Item sob o mouse no gráfico ou na tabela. Fica num store separado para que só os elementos
 * afetados re-renderizem (cada linha/bloco assina apenas "sou eu o destacado?").
 */
interface HoverState {
  id: NodeId | null;
  set(id: NodeId | null): void;
}

export const useHover = create<HoverState>(set => ({
  id: null,
  set: id => set(s => (s.id === id ? s : { id })),
}));

// ---------------------------------------------------------------- menu de contexto e tooltip

/** O que menus e tooltips precisam saber de um item, venha ele de onde vier. */
export interface ItemRef {
  id: NodeId;
  name: string;
  kind: string;
  size: number;
  parentId: NodeId | null;
  path?: string;
  /** Arquivo só na nuvem (abrir faz o download). */
  cloudOnly?: boolean;
  logical?: number;
}

interface OverlayState {
  menu: { x: number; y: number; item: ItemRef } | null;
  openMenu(x: number, y: number, item: ItemRef): void;
  closeMenu(): void;
}

export const useOverlay = create<OverlayState>(set => ({
  menu: null,
  openMenu: (x, y, item) => set({ menu: { x, y, item } }),
  closeMenu: () => set({ menu: null }),
}));
