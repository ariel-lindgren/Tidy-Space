import { beforeEach, describe, expect, it } from 'vitest';
import { queueTotal, useQueue, type QueueItem } from './queueStore';

const item = (id: number, path: string, size = 10): QueueItem => ({
  id,
  name: path.split(/[\\/]/).pop() ?? path,
  path,
  parentPath: '',
  size,
  shared: 0,
  files: 1,
  kind: 'dir',
  category: 'other',
});

beforeEach(() => useQueue.getState().clear());

describe('fila de limpeza', () => {
  it('ignora duplicatas e itens dentro de outro já na fila', () => {
    const q = useQueue.getState();
    expect(q.add([item(1, 'C:\\a', 100), item(1, 'C:\\a', 100)])).toEqual({ added: 1, bytes: 100 });
    expect(q.add([item(2, 'C:\\a\\b', 40)]).added).toBe(0);
    expect(useQueue.getState().items.map(i => i.id)).toEqual([1]);
  });

  it('substitui filhos quando o pai é adicionado e não confunde prefixos', () => {
    const q = useQueue.getState();
    q.add([item(2, '/home/x/cache/a', 5), item(3, '/home/x/cache-old', 7)]);
    q.add([item(1, '/home/x/cache', 50)]);
    expect(useQueue.getState().items.map(i => i.id)).toEqual([1, 3]);
    expect(queueTotal(useQueue.getState().items)).toBe(57);
  });

  it('remove por id', () => {
    const q = useQueue.getState();
    q.add([item(1, '/a'), item(2, '/b')]);
    q.remove([1]);
    expect(useQueue.getState().items.map(i => i.id)).toEqual([2]);
  });
});
