/** Geometria dos gráficos — funções puras, sem DOM (testadas em layout.test.ts). */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tile<T> extends Rect {
  item: T;
}

/**
 * Treemap "squarified" (Bruls, Huizing & van Wijk): preenche o retângulo com áreas proporcionais
 * a `size`, mantendo os blocos o mais próximo possível de quadrados. Espera itens em ordem
 * decrescente de tamanho; itens com tamanho ≤ 0 são ignorados.
 */
export function squarify<T extends { size: number }>(items: readonly T[], rect: Rect): Tile<T>[] {
  const valid = items.filter(i => i.size > 0);
  const total = valid.reduce((a, i) => a + i.size, 0);
  if (!total || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const queue = valid.map(item => ({ item, area: item.size * scale }));
  const out: Tile<T>[] = [];
  const r = { ...rect };
  let row: typeof queue = [];

  const worst = (candidate: typeof queue, side: number) => {
    if (!candidate.length) return Infinity;
    let sum = 0;
    let max = 0;
    let min = Infinity;
    for (const c of candidate) {
      sum += c.area;
      if (c.area > max) max = c.area;
      if (c.area < min) min = c.area;
    }
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const layoutRow = (cells: typeof queue) => {
    const sum = cells.reduce((a, c) => a + c.area, 0);
    if (r.w >= r.h) {
      const colW = sum / r.h;
      let y = r.y;
      for (const c of cells) {
        const h = c.area / colW;
        out.push({ item: c.item, x: r.x, y, w: colW, h });
        y += h;
      }
      r.x += colW;
      r.w -= colW;
    } else {
      const rowH = sum / r.w;
      let x = r.x;
      for (const c of cells) {
        const w = c.area / rowH;
        out.push({ item: c.item, x, y: r.y, w, h: rowH });
        x += w;
      }
      r.y += rowH;
      r.h -= rowH;
    }
  };

  while (queue.length) {
    const side = Math.min(r.w, r.h);
    const next = queue[0] as (typeof queue)[number];
    if (worst([...row, next], side) <= worst(row, side)) {
      row.push(next);
      queue.shift();
    } else {
      layoutRow(row);
      row = [];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}

export interface PartitionNode {
  size: number;
  children?: readonly PartitionNode[];
}

export interface Arc<T> {
  item: T;
  /** Ângulos em radianos, 0 no topo, sentido horário. */
  a0: number;
  a1: number;
  depth: number;
  /** Índice do ancestral de primeiro nível — define a cor no modo "por pasta". */
  branch: number;
  parent: T | null;
}

/** Partição radial (sunburst) até `maxDepth` anéis; fatias menores que `minSpan` são omitidas. */
export function partition<T extends PartitionNode>(root: T, maxDepth: number, minSpan = 0.004): Arc<T>[] {
  const out: Arc<T>[] = [];
  const TAU = Math.PI * 2;
  const walk = (node: T, a0: number, a1: number, depth: number, branch: number) => {
    if (depth >= maxDepth || !node.children || node.size <= 0) return;
    let a = a0;
    node.children.forEach((child, i) => {
      const span = ((a1 - a0) * child.size) / node.size;
      const b = depth === 0 ? i : branch;
      if (span >= minSpan && child.size > 0) {
        out.push({ item: child as T, a0: a, a1: a + span, depth: depth + 1, branch: b, parent: node });
        walk(child as T, a, a + span, depth + 1, b);
      }
      a += span;
    });
  };
  walk(root, 0, TAU, 0, 0);
  return out;
}

/** Caminho SVG de um setor de anel, centrado na origem. */
export function arcPath(r0: number, r1: number, a0: number, a1: number): string {
  const TAU = Math.PI * 2;
  if (a1 - a0 >= TAU - 1e-4) a1 = a0 + TAU - 1e-4;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const pt = (r: number, a: number) => `${(r * Math.sin(a)).toFixed(2)},${(-r * Math.cos(a)).toFixed(2)}`;
  return `M${pt(r1, a0)}A${r1},${r1} 0 ${large} 1 ${pt(r1, a1)}L${pt(r0, a1)}A${r0},${r0} 0 ${large} 0 ${pt(r0, a0)}Z`;
}
