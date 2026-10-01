import type { ScanIssue } from '@shared/types';

/** Códigos de `kinds`, idênticos ao `EntryKind` do scanner em Rust. */
export const KIND = { file: 0, dir: 1, symlink: 2, other: 3 } as const;
export const NO_PARENT = 0xffffffff;

/** Bits de `flags`, idênticos a `usage::FLAG_*` do scanner em Rust. */
export const FLAG = { cloud: 1, sparse: 2, hardlink: 4 } as const;

/**
 * Resultado colunar de uma varredura, em pré-ordem: `parents[i] < i` e a subárvore de cada pasta
 * ocupa um intervalo contíguo. `sizes`/`allocated` são valores próprios (pastas = 0).
 */
export interface Snapshot {
  rootPath: string;
  names: string[];
  parents: Uint32Array;
  kinds: Uint8Array;
  /** Tamanho lógico. */
  sizes: Float64Array;
  /** Bytes realmente ocupados no disco (0 para arquivos só na nuvem). */
  allocated: Float64Array;
  flags: Uint8Array;
  mtimes: Float64Array;
  issues: ScanIssue[];
  errorCount: number;
  cancelled: boolean;
  elapsedMs: number;
}

/** Monta um snapshot a partir de uma árvore em memória (usado pelo scanner em Node e pelos testes). */
export interface TreeEntry {
  name: string;
  size?: number;
  /** Bytes em disco; padrão = `size`. */
  disk?: number;
  cloud?: boolean;
  /** Conteúdo com mais de um nome (hard link). */
  hardlink?: boolean;
  mtime?: number;
  kind?: keyof typeof KIND;
  children?: TreeEntry[];
}

const isDirEntry = (e: TreeEntry) => e.kind === 'dir' || (e.kind === undefined && e.children !== undefined);

export function snapshotFromTree(rootPath: string, root: TreeEntry, extra: Partial<Snapshot> = {}): Snapshot {
  const cols = {
    names: [] as string[],
    parents: [] as number[],
    kinds: [] as number[],
    sizes: [] as number[],
    allocated: [] as number[],
    flags: [] as number[],
    mtimes: [] as number[],
  };
  const push = (e: TreeEntry, parent: number, dir: boolean) => {
    const size = dir ? 0 : (e.size ?? 0);
    cols.names.push(e.name);
    cols.parents.push(parent);
    cols.kinds.push(dir ? KIND.dir : KIND[e.kind ?? 'file']);
    cols.sizes.push(size);
    cols.allocated.push(dir || e.cloud ? 0 : (e.disk ?? size));
    cols.flags.push((e.cloud ? FLAG.cloud : 0) | (e.hardlink ? FLAG.hardlink : 0));
    cols.mtimes.push(e.mtime ?? 0);
  };
  // Pilha explícita: árvores profundas não estouram a pilha de chamadas.
  const stack: [TreeEntry, number][] = [[{ ...root, name: rootPath, kind: 'dir' }, NO_PARENT]];
  while (stack.length) {
    const [entry, parent] = stack.pop() as [TreeEntry, number];
    const idx = cols.names.length;
    push(entry, parent, true);
    const children = entry.children ?? [];
    for (const f of children.filter(c => !isDirEntry(c))) push(f, idx, false);
    const dirs = children.filter(isDirEntry);
    for (let i = dirs.length - 1; i >= 0; i--) stack.push([dirs[i] as TreeEntry, idx]);
  }
  return {
    rootPath,
    names: cols.names,
    parents: Uint32Array.from(cols.parents),
    kinds: Uint8Array.from(cols.kinds),
    sizes: Float64Array.from(cols.sizes),
    allocated: Float64Array.from(cols.allocated),
    flags: Uint8Array.from(cols.flags),
    mtimes: Float64Array.from(cols.mtimes),
    issues: [],
    errorCount: 0,
    cancelled: false,
    elapsedMs: 0,
    ...extra,
  };
}
