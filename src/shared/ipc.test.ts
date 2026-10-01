import { describe, expect, it } from 'vitest';
import { nodeIdsSchema, querySchemas } from './ipcSchemas';

describe('schemas de IPC', () => {
  it('aceita consultas válidas e rejeita parâmetros fora do contrato', () => {
    expect(querySchemas.view.safeParse([{ id: 0, depth: 2, maxChildren: 50, minFraction: 0.001 }]).success).toBe(true);
    expect(querySchemas.view.safeParse([{ id: -1, depth: 2, maxChildren: 50, minFraction: 0 }]).success).toBe(false);
    expect(querySchemas.top.safeParse([{ kind: 'file', category: 'video', limit: 10 }]).success).toBe(true);
    expect(querySchemas.top.safeParse([{ kind: 'file', category: 'x', limit: 10 }]).success).toBe(false);
    expect(querySchemas.summary.safeParse([]).success).toBe(true);
    expect(querySchemas.summary.safeParse([1]).success).toBe(false);
  });

  it('limita listas de ids', () => {
    expect(nodeIdsSchema.safeParse([]).success).toBe(false);
    expect(nodeIdsSchema.safeParse([1, 2.5]).success).toBe(false);
    expect(nodeIdsSchema.safeParse([1, 2]).success).toBe(true);
  });
});
