import { describe, expect, it } from 'vitest';
import { estimateFraction, estimateSeconds, REMOVAL_FILES_PER_SECOND } from './cleanupStore';

describe('estimativa de progresso da remoção', () => {
  it('escala com a quantidade de arquivos', () => {
    expect(estimateSeconds({ files: 0 })).toBeCloseTo(0.5 + 1 / REMOVAL_FILES_PER_SECOND);
    expect(estimateSeconds({ files: 250_000 })).toBeCloseTo(100.5);
  });

  it('nunca passa de 95% antes do sistema confirmar', () => {
    expect(estimateFraction({ files: 250_000 }, 50_250)).toBeCloseTo(0.5, 2);
    expect(estimateFraction({ files: 10 }, 60_000)).toBe(0.95);
  });
});
