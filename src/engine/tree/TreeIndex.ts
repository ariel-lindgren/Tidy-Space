import { CATEGORY_IDS, categoryIndex, categoryOfName } from '@shared/categories';
import type { CategoryId, Crumb, EntryKind, NodeId, TopItem } from '@shared/types';
import { FLAG, KIND, NO_PARENT, type Snapshot } from '../snapshot';

const KIND_NAMES: readonly EntryKind[] = ['file', 'dir', 'symlink', 'other'];
const CATS = CATEGORY_IDS.length;

export interface TreeIndexOptions {
  /** Separador de caminho da plataforma onde a varredura rodou. */
  separator: '/' | '\\';
  caseInsensitive: boolean;
  now?: () => number;
}

/**
 * Agregação de uma varredura recém-concluída, usada para gravar a análise no banco e para
 * calcular as sugestões de limpeza. Vive só durante a gravação: consultas interativas são
 * atendidas pelo SQLite ({@link ScanReader}).
 *
 * Tudo em typed arrays e calculado numa única passada de baixo para cima, aproveitando a
 * pré-ordem do snapshot: `parent(i) < i` e a subárvore de `i` é o intervalo `[i, end(i))`.
 */
export class TreeIndex {
  readonly rootPath: string;
  readonly size: number;
  readonly separator: '/' | '\\';
  private readonly names: string[];
  private readonly parents: Uint32Array;
  private readonly kinds: Uint8Array;
  private readonly flags: Uint8Array;
  private readonly logical: Float64Array;
  private readonly disk: Float64Array;
  private readonly cloud: Float64Array;
  private readonly shared: Float64Array;
  private readonly fileCount: Float64Array;
  private readonly dirCount: Float64Array;
  private readonly lastMod: Float64Array;
  private readonly end: Uint32Array;
  /** Arquivos: categoria pela extensão. Pastas: categoria dominante (em bytes no disco). */
  private readonly cats: Uint8Array;
  /** Pastas: fração (0–1) da categoria dominante. */
  private readonly catShare: Float32Array;
  /** Pastas: maior arquivo dentro dela (em disco), ou -1. */
  private readonly largest: Int32Array;
  private readonly childStart: Uint32Array;
  private readonly childCount: Uint32Array;
  private readonly childList: Uint32Array;
  private readonly caseInsensitive: boolean;
  readonly now: () => number;

  constructor(snapshot: Snapshot, options: TreeIndexOptions) {
    const n = snapshot.names.length;
    if (n === 0) throw new Error('snapshot vazio');
    this.rootPath = snapshot.rootPath;
    this.size = n;
    this.separator = options.separator;
    this.caseInsensitive = options.caseInsensitive;
    this.now = options.now ?? Date.now;
    this.names = snapshot.names;
    this.parents = snapshot.parents;
    this.kinds = snapshot.kinds;
    this.flags = snapshot.flags;

    this.logical = Float64Array.from(snapshot.sizes);
    this.disk = Float64Array.from(snapshot.allocated);
    this.cloud = new Float64Array(n);
    this.shared = new Float64Array(n);
    this.fileCount = new Float64Array(n);
    this.dirCount = new Float64Array(n);
    this.lastMod = Float64Array.from(snapshot.mtimes);
    this.cats = new Uint8Array(n);
    this.catShare = new Float32Array(n);
    this.largest = new Int32Array(n).fill(-1);
    this.childCount = new Uint32Array(n);
    const subtree = new Uint32Array(n).fill(1);

    // Somas por categoria só para pastas (índice denso), para achar a dominante sem O(n²).
    const dirSlot = new Int32Array(n).fill(-1);
    let dirs = 0;
    for (let i = 0; i < n; i++) if (this.kinds[i] === KIND.dir) dirSlot[i] = dirs++;
    const catSums = new Float64Array(dirs * CATS);
    // Peso: bytes em disco, com o lógico como desempate (pastas inteiras só na nuvem).
    const weight = (i: number) => (this.disk[i] as number) + (this.logical[i] as number) * 1e-6;

    for (let i = 0; i < n; i++) {
      if (this.kinds[i] === KIND.dir) continue;
      this.fileCount[i] = 1;
      this.cats[i] = categoryIndex(categoryOfName(this.names[i] as string));
      if ((this.flags[i] as number) & FLAG.cloud) this.cloud[i] = this.logical[i] as number;
      if ((this.flags[i] as number) & FLAG.hardlink) this.shared[i] = this.disk[i] as number;
    }

    for (let i = n - 1; i > 0; i--) {
      const p = this.parents[i] as number;
      this.logical[p] += this.logical[i] as number;
      this.disk[p] += this.disk[i] as number;
      this.cloud[p] += this.cloud[i] as number;
      this.shared[p] += this.shared[i] as number;
      this.fileCount[p] += this.fileCount[i] as number;
      const isDir = this.kinds[i] === KIND.dir;
      this.dirCount[p] += (this.dirCount[i] as number) + (isDir ? 1 : 0);
      if ((this.lastMod[i] as number) > (this.lastMod[p] as number)) this.lastMod[p] = this.lastMod[i] as number;
      subtree[p] += subtree[i] as number;
      this.childCount[p]++;

      const ps = (dirSlot[p] as number) * CATS;
      const candidate = isDir ? (this.largest[i] as number) : i;
      if (isDir) {
        const cs = (dirSlot[i] as number) * CATS;
        for (let c = 0; c < CATS; c++) catSums[ps + c] += catSums[cs + c] as number;
      } else {
        catSums[ps + (this.cats[i] as number)] += weight(i);
      }
      const cur = this.largest[p] as number;
      if (
        candidate >= 0 &&
        (cur < 0 ||
          this.disk[candidate]! > this.disk[cur]! ||
          (this.disk[candidate] === this.disk[cur] && this.logical[candidate]! > this.logical[cur]!))
      ) {
        this.largest[p] = candidate;
      }
    }

    for (let i = 0; i < n; i++) {
      const slot = dirSlot[i] as number;
      if (slot < 0) continue;
      let best = CATS - 1;
      let total = 0;
      for (let c = 0; c < CATS; c++) {
        const v = catSums[slot * CATS + c] as number;
        total += v;
        if (v > (catSums[slot * CATS + best] as number)) best = c;
      }
      this.cats[i] = best;
      this.catShare[i] = total > 0 ? (catSums[slot * CATS + best] as number) / total : 0;
    }

    this.end = new Uint32Array(n);
    for (let i = 0; i < n; i++) this.end[i] = i + (subtree[i] as number);

    // Lista de filhos compacta (CSR), ordenada por bytes em disco.
    this.childStart = new Uint32Array(n);
    let offset = 0;
    for (let i = 0; i < n; i++) {
      this.childStart[i] = offset;
      offset += this.childCount[i] as number;
    }
    this.childList = new Uint32Array(offset);
    const fill = new Uint32Array(n);
    for (let i = 1; i < n; i++) {
      const p = this.parents[i] as number;
      this.childList[(this.childStart[p] as number) + (fill[p] as number)] = i;
      fill[p]++;
    }
    for (let i = 0; i < n; i++) {
      if ((this.childCount[i] as number) > 1) {
        const s = this.childStart[i] as number;
        this.childList
          .subarray(s, s + (this.childCount[i] as number))
          .sort((a, b) => (this.disk[b] as number) - (this.disk[a] as number));
      }
    }
  }

  // ---------------------------------------------------------------- acesso

  get rootId(): NodeId {
    return 0;
  }

  has(id: NodeId): boolean {
    return Number.isInteger(id) && id >= 0 && id < this.size;
  }

  name(id: NodeId): string {
    return this.names[id] as string;
  }

  kind(id: NodeId): EntryKind {
    return KIND_NAMES[this.kinds[id] as number] ?? 'other';
  }

  kindCode(id: NodeId): number {
    return this.kinds[id] as number;
  }

  isDir(id: NodeId): boolean {
    return this.kinds[id] === KIND.dir;
  }

  /** Bytes ocupados no disco — é o que uma limpeza libera. */
  sizeOf(id: NodeId): number {
    return this.disk[id] as number;
  }

  diskOf(id: NodeId): number {
    return this.disk[id] as number;
  }

  logicalOf(id: NodeId): number {
    return this.logical[id] as number;
  }

  cloudOf(id: NodeId): number {
    return this.cloud[id] as number;
  }

  /** Bytes em disco de conteúdo com hard links (não liberados ao remover só este item). */
  sharedOf(id: NodeId): number {
    return this.shared[id] as number;
  }

  /** O que remover o item libera de fato: em disco, menos o conteúdo compartilhado por hard links. */
  freeableOf(id: NodeId): number {
    return (this.disk[id] as number) - (this.shared[id] as number);
  }

  flagsOf(id: NodeId): number {
    return this.flags[id] as number;
  }

  mtimeOf(id: NodeId): number {
    return this.lastMod[id] as number;
  }

  filesOf(id: NodeId): number {
    return this.fileCount[id] as number;
  }

  dirsOf(id: NodeId): number {
    return this.dirCount[id] as number;
  }

  categoryCode(id: NodeId): number {
    return this.cats[id] as number;
  }

  categoryOf(id: NodeId): CategoryId {
    return CATEGORY_IDS[this.cats[id] as number] ?? 'other';
  }

  categoryShare(id: NodeId): number {
    return this.isDir(id) ? (this.catShare[id] as number) : 1;
  }

  largestFileOf(id: NodeId): NodeId | null {
    const l = this.largest[id] as number;
    return l < 0 ? null : l;
  }

  childCountOf(id: NodeId): number {
    return this.childCount[id] as number;
  }

  endOf(id: NodeId): number {
    return this.end[id] as number;
  }

  parentOf(id: NodeId): NodeId | null {
    const p = this.parents[id] as number;
    return p === NO_PARENT ? null : p;
  }

  /** `id` está dentro da subárvore de `ancestor` (ou é ele). O(1). */
  isWithin(id: NodeId, ancestor: NodeId): boolean {
    return id >= ancestor && id < (this.end[ancestor] as number);
  }

  children(id: NodeId): Uint32Array {
    const s = this.childStart[id] as number;
    return this.childList.subarray(s, s + (this.childCount[id] as number));
  }

  /** Percorre a subárvore (sem a raiz dela). */
  forEachDescendant(id: NodeId, fn: (i: NodeId) => void): void {
    const stop = this.end[id] as number;
    for (let i = id + 1; i < stop; i++) fn(i);
  }

  path(id: NodeId): string {
    const parts: string[] = [];
    for (let i = id; i !== 0; i = this.parents[i] as number) parts.push(this.names[i] as string);
    if (!parts.length) return this.rootPath;
    parts.reverse();
    const base = this.rootPath.endsWith(this.separator) ? this.rootPath : this.rootPath + this.separator;
    return base + parts.join(this.separator);
  }

  trail(id: NodeId): Crumb[] {
    const out: Crumb[] = [];
    for (let i: number = id; ; i = this.parents[i] as number) {
      out.push({ id: i, name: this.names[i] as string });
      if (i === 0) break;
    }
    return out.reverse();
  }

  /** Nó correspondente a um caminho absoluto, se estiver dentro da análise. */
  find(fullPath: string): NodeId | null {
    const fold = (s: string) => (this.caseInsensitive ? s.toLowerCase() : s);
    const norm = (s: string) => fold(s.replace(/[\\/]+/g, '/').replace(/\/+$/, ''));
    const root = norm(this.rootPath);
    const target = norm(fullPath);
    if (target === root) return 0;
    const prefix = root.endsWith('/') ? root : `${root}/`;
    if (!target.startsWith(prefix)) return null;
    let current = 0;
    for (const part of target.slice(prefix.length).split('/')) {
      let next = -1;
      for (const c of this.children(current)) {
        if (fold(this.names[c] as string) === part) {
          next = c;
          break;
        }
      }
      if (next < 0) return null;
      current = next;
    }
    return current;
  }

  /** Item com caminho, medido em disco (usado pelas sugestões). */
  topItem(id: NodeId): TopItem {
    const p = this.parentOf(id);
    const disk = this.disk[id] as number;
    return {
      id,
      name: this.names[id] as string,
      kind: this.kind(id),
      size: disk,
      disk,
      logical: this.logical[id] as number,
      cloud: this.cloud[id] as number,
      shared: this.shared[id] as number,
      cloudOnly: ((this.flags[id] as number) & FLAG.cloud) !== 0,
      files: this.fileCount[id] as number,
      dirs: this.dirCount[id] as number,
      mtime: this.lastMod[id] as number,
      category: this.categoryOf(id),
      childCount: this.childCount[id] as number,
      parentId: p,
      path: this.path(id),
      parentPath: p === null ? '' : this.path(p),
    };
  }
}
