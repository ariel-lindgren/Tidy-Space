import type { EngineChoice } from './engineChoice';
import type { Settings, SettingsPatch } from './settings';
import type {
  ChildrenPage,
  ChildrenQuery,
  FileActionResult,
  NodeDetails,
  NodeId,
  SavedScan,
  ScannerEngineKind,
  ScanProgress,
  ScanSummary,
  Suggestion,
  TopItem,
  TopQuery,
  TreeViewNode,
  TypeStats,
  ViewQuery,
  VolumeInfo,
} from './types';

/**
 * Contrato IPC entre renderer e main (sem dependências: é importado pelo preload, que roda em
 * sandbox). A validação com zod do que chega do renderer fica em `ipcSchemas.ts`, usada só no main.
 */
export const IPC = {
  appInfo: 'app:info',
  query: 'engine:query',
  scanStart: 'scan:start',
  scanCancel: 'scan:cancel',
  scanProgress: 'scan:progress',
  scanDone: 'scan:done',
  scanError: 'scan:error',
  filesTrash: 'files:trash',
  filesDelete: 'files:delete',
  filesReveal: 'files:reveal',
  filesOpen: 'files:open',
  pickFolder: 'dialog:pick-folder',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  scansOpen: 'scans:open',
  scansDelete: 'scans:delete',
  scansDeleteAll: 'scans:delete-all',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowMaximized: 'window:maximized',
} as const;

/** Consultas somente-leitura (atendidas pelo processo engine, a partir do banco da análise aberta). */
export interface EngineQueries {
  listVolumes(): Promise<VolumeInfo[]>;
  summary(): ScanSummary | null;
  details(p: { id: NodeId }): NodeDetails;
  view(p: ViewQuery): TreeViewNode;
  children(q: ChildrenQuery): ChildrenPage;
  top(q: TopQuery): TopItem[];
  /** Distribuição por tipo da análise inteira. */
  types(): TypeStats;
  search(p: { text: string; limit: number }): TopItem[];
  suggestions(): Suggestion[];
  /** Lista completa de itens de uma sugestão (o card traz só uma prévia). */
  suggestionItems(p: { id: string }): TopItem[];
  findPath(p: { path: string }): NodeId | null;
  /** Posição do item entre os irmãos (maior primeiro) — para rolar a tabela até ele. */
  rankOf(p: { id: NodeId }): number;
  /** Análises gravadas no banco local, mais recente primeiro. */
  listScans(): SavedScan[];
}
export type EngineQueryName = keyof EngineQueries;
export type QueryParams<K extends EngineQueryName> = Parameters<EngineQueries[K]>;
export type QueryResult<K extends EngineQueryName> = Awaited<ReturnType<EngineQueries[K]>>;

export interface AppInfo {
  platform: string;
  version: string;
  engine: ScannerEngineKind;
  /** Motor pedido na inicialização (`--engine=`). */
  engineChoice: EngineChoice;
  /** Motivo de o scanner nativo não estar em uso (null quando está). */
  nativeError: string | null;
  homeDir: string;
}

export type Unsubscribe = () => void;

/** API exposta ao renderer pelo preload (`window.tidyspace`). */
export interface TidySpaceApi {
  app: { info(): Promise<AppInfo> };
  query<K extends EngineQueryName>(method: K, ...params: QueryParams<K>): Promise<QueryResult<K>>;
  scan: {
    start(path: string): Promise<void>;
    cancel(): Promise<void>;
    onProgress(cb: (p: ScanProgress) => void): Unsubscribe;
    onDone(cb: (s: ScanSummary) => void): Unsubscribe;
    onError(cb: (message: string) => void): Unsubscribe;
  };
  files: {
    trash(ids: NodeId[]): Promise<FileActionResult>;
    deletePermanently(ids: NodeId[]): Promise<FileActionResult>;
    reveal(id: NodeId): Promise<void>;
    open(id: NodeId): Promise<void>;
  };
  dialog: { pickFolder(): Promise<string | null> };
  settings: { get(): Promise<Settings>; update(patch: SettingsPatch): Promise<Settings> };
  scans: {
    /** Reabre uma análise gravada (sem varrer de novo). */
    open(id: string): Promise<ScanSummary>;
    /** Apaga uma análise gravada; retorna a análise aberta depois disso (ou null). */
    delete(id: string): Promise<ScanSummary | null>;
    deleteAll(): Promise<void>;
  };
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    onMaximizedChange(cb: (maximized: boolean) => void): Unsubscribe;
  };
  /** Caminho real de um arquivo/pasta arrastado para a janela. */
  pathForFile(file: File): string;
}
