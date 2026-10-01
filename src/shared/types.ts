/** Tipos de domínio compartilhados por engine, main e renderer. */

/** Índice do nó dentro de uma análise. Válido apenas enquanto a mesma análise estiver aberta. */
export type NodeId = number;

export type EntryKind = 'file' | 'dir' | 'symlink' | 'other';

export type CategoryId =
  'video' | 'image' | 'audio' | 'doc' | 'code' | 'archive' | 'install' | 'vdisk' | 'system' | 'other';

export type ScannerEngineKind = 'native' | 'node';

/**
 * O que conta como "tamanho": `disk` = bytes realmente ocupados no disco (arquivos só na nuvem
 * contam 0); `logical` = tamanho nominal do arquivo.
 */
export type Measure = 'disk' | 'logical';

/** Medidas de um item. `size` é sempre a medida escolhida nas configurações. */
export interface Sizes {
  size: number;
  disk: number;
  logical: number;
  /** Tamanho lógico do conteúdo que está só na nuvem (não ocupa disco). */
  cloud: number;
  /**
   * Bytes em disco de conteúdo com mais de um nome (hard links — ex.: `node_modules` do pnpm,
   * ligado ao store). Remover o item não libera esse espaço enquanto existir outro nome.
   */
  shared: number;
}

export interface VolumeInfo {
  id: string;
  name: string;
  mountPoint: string;
  fileSystem: string;
  total: number;
  available: number;
  removable: boolean;
  kind: 'ssd' | 'hdd' | 'unknown';
}

export interface ScanProgress {
  /** `scanning`: lendo o disco. `saving`: gravando a análise no banco local. */
  phase: 'scanning' | 'saving';
  files: number;
  dirs: number;
  bytes: number;
  errors: number;
  currentPath: string;
  elapsedMs: number;
  /** Fase `saving`: entradas gravadas / total. */
  saved?: number;
  total?: number;
}

export interface ScanIssue {
  path: string;
  message: string;
}

export interface ScanSummary extends Sizes {
  /** Identificador da análise salva. */
  id: string;
  rootId: NodeId;
  rootPath: string;
  measure: Measure;
  files: number;
  dirs: number;
  errorCount: number;
  issues: ScanIssue[];
  cancelled: boolean;
  elapsedMs: number;
  engine: ScannerEngineKind;
  finishedAt: number;
  /** Incrementa a cada alteração da árvore (ex.: itens removidos) — invalida caches do renderer. */
  treeVersion: number;
  /** Capacidade do volume onde está a raiz, quando conhecida. */
  volume: { total: number; available: number } | null;
}

export interface NodeInfo extends Sizes {
  id: NodeId;
  name: string;
  kind: EntryKind;
  /** Arquivo só na nuvem (placeholder do OneDrive/iCloud/Dropbox). */
  cloudOnly: boolean;
  files: number;
  dirs: number;
  /** Arquivos: data de modificação. Pastas: modificação mais recente dentro dela. */
  mtime: number;
  /** Arquivos: categoria pela extensão. Pastas: categoria dominante em volume. */
  category: CategoryId;
  childCount: number;
  parentId: NodeId | null;
}

export interface TopItem extends NodeInfo {
  path: string;
  parentPath: string;
}

/** Nó da visão hierárquica usada pelos gráficos. `id === null` indica o agrupamento "itens menores". */
export interface TreeViewNode {
  id: NodeId | null;
  name: string;
  kind: EntryKind | 'group';
  /** Medida escolhida. */
  size: number;
  cloud: number;
  cloudOnly: boolean;
  files: number;
  mtime: number;
  category: CategoryId;
  childCount: number;
  groupedCount?: number;
  children?: TreeViewNode[];
}

export interface ViewQuery {
  id: NodeId;
  depth: number;
  maxChildren: number;
  /** Filhos menores que esta fração do pai são agrupados. */
  minFraction: number;
}

export type SortKey = 'size' | 'name' | 'files' | 'mtime';

export interface ChildrenQuery {
  id: NodeId;
  sort: SortKey;
  direction: 'asc' | 'desc';
  filter?: string;
  offset: number;
  limit: number;
}

export interface ChildrenPage {
  total: number;
  items: NodeInfo[];
}

export interface TopQuery {
  kind: 'file' | 'dir';
  category?: CategoryId;
  olderThanDays?: number;
  text?: string;
  limit: number;
}

export interface TypeStats {
  categories: { category: CategoryId; size: number; count: number }[];
  extensions: { ext: string; category: CategoryId; size: number; count: number }[];
}

export interface Crumb {
  id: NodeId;
  name: string;
}

export interface NodeDetails {
  node: NodeInfo;
  path: string;
  trail: Crumb[];
  largestFile: TopItem | null;
  dominant: { category: CategoryId; share: number };
  reclaimable: number;
}

export type Risk = 'safe' | 'review' | 'advanced';

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  icon: string;
  risk: Risk;
  /** `queue`: itens podem ir para a fila de limpeza. `command`: o usuário executa um comando. */
  action: 'queue' | 'command';
  command?: string;
  size: number;
  itemCount: number;
  items: TopItem[];
}

/** Por que um item não foi removido. */
export type FailureReason = 'protected' | 'permission' | 'in-use' | 'missing' | 'timeout' | 'other';

export interface FileActionResult {
  done: NodeId[];
  /**
   * Itens não removidos. `error` é a explicação no idioma da interface; `reason` permite à
   * interface reagir sem interpretar o texto (ex.: orientar sobre pastas protegidas).
   */
  failed: { id: NodeId; path: string; error: string; reason?: FailureReason }[];
  bytes: number;
  summary: ScanSummary | null;
}

/** Análise gravada no banco local, que pode ser reaberta sem varrer de novo. */
export interface SavedScan {
  id: string;
  rootPath: string;
  finishedAt: number;
  elapsedMs: number;
  engine: ScannerEngineKind;
  files: number;
  dirs: number;
  disk: number;
  logical: number;
  cloud: number;
  /** Tamanho do arquivo da análise no disco. */
  storageBytes: number;
}
