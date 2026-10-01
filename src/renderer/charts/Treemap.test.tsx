import { fireEvent, render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TreeViewNode } from '@shared/types';
import { act } from 'react';
import { useHover } from '../store/uiStore';
import { Treemap } from './Treemap';
import type { ChartProps } from './types';

// jsdom não faz layout: fixa o tamanho medido pelo ResizeObserver/clientWidth.
const sizes = { clientWidth: 600, clientHeight: 400 };
const original = Object.fromEntries(
  Object.keys(sizes).map(k => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)]),
);
beforeAll(() => {
  for (const [k, v] of Object.entries(sizes))
    Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => v });
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});
afterAll(() => {
  for (const [k, d] of Object.entries(original)) if (d) Object.defineProperty(HTMLElement.prototype, k, d);
});

const node = (
  id: number | null,
  name: string,
  kind: TreeViewNode['kind'],
  size: number,
  children?: TreeViewNode[],
): TreeViewNode => ({
  id,
  name,
  kind,
  size,
  cloud: 0,
  cloudOnly: false,
  files: 1,
  mtime: 0,
  category: 'other',
  childCount: children?.length ?? 0,
  ...(children ? { children } : {}),
});

const view = node(0, 'raiz', 'dir', 1000, [
  node(1, 'videos', 'dir', 600, [node(4, 'a.mp4', 'file', 600)]),
  node(2, 'b.zip', 'file', 300),
  node(null, '3 itens menores', 'group', 100),
]);

function setup(extra: Partial<ChartProps> = {}) {
  const props: ChartProps = {
    view,
    colorMode: 'folder',
    animate: false,
    direction: 'down',
    units: 'binary',
    canGoUp: false,
    onDrill: vi.fn(),
    onUp: vi.fn(),
    onSelect: vi.fn(),
    onHover: vi.fn(),
    onContext: vi.fn(),
    ...extra,
  };
  return { props, ...render(<Treemap {...props} />) };
}

describe('Treemap', () => {
  it('desenha um bloco por filho, sem nenhum em estado de zoom (regressão: grupo com id nulo)', () => {
    const { container } = setup();
    const tiles = container.querySelectorAll('.tm-tile');
    expect(tiles).toHaveLength(3);
    expect(container.querySelector('.tm-tile.zooming')).toBeNull();
    expect(container.querySelector('.tm-tile.fade')).toBeNull();
    expect(container.querySelector('.tm-tile.is-group')).not.toBeNull();
  });

  it('entra em pastas e seleciona arquivos ao clicar; grupo é inerte', () => {
    const { container, props } = setup();
    const [dir, file, group] = [...container.querySelectorAll<HTMLElement>('.tm-tile')];
    fireEvent.click(dir as HTMLElement);
    expect(props.onDrill).toHaveBeenCalledWith(1);
    fireEvent.click(file as HTMLElement);
    expect(props.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    fireEvent.click(group as HTMLElement);
    expect(props.onDrill).toHaveBeenCalledTimes(1);
  });

  it('com animação, faz zoom no bloco clicado antes de navegar', () => {
    vi.useFakeTimers();
    const { container, props } = setup({ animate: true });
    fireEvent.click(container.querySelector('.tm-tile.is-dir') as HTMLElement);
    expect(container.querySelector('.tm-tile.zooming')?.textContent).toContain('videos');
    expect(container.querySelectorAll('.tm-tile.fade')).toHaveLength(2);
    expect(props.onDrill).not.toHaveBeenCalled();
    vi.advanceTimersByTime(450);
    expect(props.onDrill).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });

  it('abre o menu de contexto só para itens reais', () => {
    const { container, props } = setup();
    fireEvent.contextMenu(container.querySelector('.tm-tile.is-file') as HTMLElement);
    fireEvent.contextMenu(container.querySelector('.tm-tile.is-group') as HTMLElement);
    expect(props.onContext).toHaveBeenCalledTimes(1);
  });

  it('destaca o bloco do item sob o mouse na tabela (via store de hover)', () => {
    const { container } = setup();
    act(() => useHover.getState().set(2));
    expect(container.querySelector('.tm-tile.hl')?.textContent).toContain('b.zip');
    act(() => useHover.getState().set(4));
    expect(container.querySelector('.tm-sub.hl')?.textContent).toContain('a.mp4');
    act(() => useHover.getState().set(null));
    expect(container.querySelector('.hl')).toBeNull();
  });
});
