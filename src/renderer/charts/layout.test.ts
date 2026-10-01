import { describe, expect, it } from 'vitest';
import { arcPath, partition, squarify } from './layout';

describe('squarify', () => {
  const rect = { x: 0, y: 0, w: 600, h: 400 };

  it('preenche a área toda com áreas proporcionais', () => {
    const items = [{ size: 6 }, { size: 6 }, { size: 4 }, { size: 3 }, { size: 2 }, { size: 2 }, { size: 1 }];
    const tiles = squarify(items, rect);
    const total = items.reduce((a, i) => a + i.size, 0);
    expect(tiles).toHaveLength(items.length);
    const area = tiles.reduce((a, t) => a + t.w * t.h, 0);
    expect(area).toBeCloseTo(600 * 400, 3);
    tiles.forEach(t => expect(t.w * t.h).toBeCloseTo((t.item.size / total) * 600 * 400, 3));
  });

  it('mantém os blocos dentro do retângulo e sem sobreposição', () => {
    const tiles = squarify([{ size: 50 }, { size: 30 }, { size: 20 }, { size: 5 }], rect);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(400 + 1e-6);
    }
    for (let i = 0; i < tiles.length; i++)
      for (let j = i + 1; j < tiles.length; j++) {
        const [a, b] = [tiles[i], tiles[j]] as [(typeof tiles)[number], (typeof tiles)[number]];
        const overlap =
          Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
          Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        expect(overlap).toBeLessThan(1e-6);
      }
  });

  it('produz proporções razoáveis e ignora tamanhos nulos', () => {
    const tiles = squarify(
      Array.from({ length: 20 }, (_, i) => ({ size: 20 - i })),
      rect,
    );
    const worst = Math.max(...tiles.map(t => Math.max(t.w / t.h, t.h / t.w)));
    expect(worst).toBeLessThan(4);
    expect(squarify([{ size: 0 }], rect)).toEqual([]);
    expect(squarify([{ size: 1 }], { x: 0, y: 0, w: 0, h: 10 })).toEqual([]);
  });
});

describe('partition', () => {
  const tree = {
    size: 100,
    children: [
      { size: 50, children: [{ size: 25 }, { size: 25, children: [{ size: 25 }] }] },
      { size: 30 },
      { size: 20 },
    ],
  };

  it('divide 360° proporcionalmente e respeita a profundidade', () => {
    const arcs = partition(tree, 2);
    const ring1 = arcs.filter(a => a.depth === 1);
    expect(ring1.map(a => +(a.a1 - a.a0).toFixed(4))).toEqual(
      [Math.PI, Math.PI * 0.6, Math.PI * 0.4].map(v => +v.toFixed(4)),
    );
    expect(arcs.some(a => a.depth > 2)).toBe(false);
    expect(arcs.filter(a => a.depth === 2).every(a => a.branch === 0)).toBe(true);
  });

  it('omite fatias pequenas demais', () => {
    const arcs = partition({ size: 1000, children: [{ size: 999 }, { size: 0.1 }] }, 3, 0.01);
    expect(arcs).toHaveLength(1);
  });
});

describe('arcPath', () => {
  it('gera caminho fechado e trata o círculo completo', () => {
    expect(arcPath(10, 20, 0, Math.PI / 2)).toMatch(/^M.*Z$/);
    expect(arcPath(10, 20, 0, Math.PI * 2)).not.toContain('NaN');
  });
});
