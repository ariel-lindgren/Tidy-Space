import { getLocale, msg, setLocale } from '@shared/i18n';
import type { EngineChoice } from '@shared/engineChoice';
import type {
  ChildrenPage,
  ChildrenQuery,
  Measure,
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
} from '@shared/types';
import { nodeChecker, type DeleteCheck, type DeleteChecker } from './deletePreflight';
import type { EngineConfig, EngineEvent, EngineMethodName, EngineMethods, ResolvedNode } from './protocol';
import type { ScanOptions, Scanner } from './scanner/Scanner';
import { Catalog } from './store/Catalog';
import { ScanReader } from './store/ScanReader';
import { writeScan } from './store/writeScan';
import { computeSuggestions } from './suggestions/computeSuggestions';
import type { SuggestionEnv } from './suggestions/rules';
import { TreeIndex, type TreeIndexOptions } from './tree/TreeIndex';

export interface EngineDeps {
  scanner: Scanner;
  nativeError: string | null;
  /** Motor pedido na inicialização (padrão: automático). */
  engineChoice?: EngineChoice;
  /** Pasta de dados do app (onde ficam `catalog.db` e `scans/`). */
  dataDir: string;
  listVolumes(): Promise<VolumeInfo[]>;
  volumeStats(path: string): Promise<{ total: number; available: number } | null>;
  suggestionEnv(): SuggestionEnv;
  indexOptions: TreeIndexOptions;
  emit(event: EngineEvent): void;
  /** Verificação de permissão antes de remover (padrão: fallback em Node). */
  deleteChecker?: DeleteChecker;
}

/**
 * Serviço do processo engine. Fluxo de uma análise: varredura → agregação em memória
 * ({@link TreeIndex}) → gravação no SQLite → a memória é liberada e as consultas passam a ser
 * atendidas pelo banco ({@link ScanReader}). Análises antigas podem ser reabertas sem varrer.
 * Sem dependência de Electron — testado em Node puro.
 */
export class EngineService implements EngineMethods {
  private readonly catalog: Catalog;
  private reader: ScanReader | null = null;
  private active: { id: number; controller: AbortController } | null = null;
  private seq = 0;
  private config: EngineConfig = { measure: 'disk', keepScans: 5, locale: getLocale() };

  constructor(private readonly deps: EngineDeps) {
    this.catalog = new Catalog(deps.dataDir);
    // Ao iniciar, reabre a análise mais recente (se houver) para o Explorar já estar disponível.
    const latest = this.catalog.list()[0];
    if (latest) {
      try {
        this.reader = this.openReader(latest.id);
      } catch (err) {
        console.warn(`[engine] análise ${latest.id} ilegível, removendo: ${String(err)}`);
        this.catalog.remove(latest.id);
      }
    }
  }

  /** Despacho genérico para mensagens vindas do main. */
  dispatch(method: EngineMethodName, params: unknown[]): unknown {
    const fn = (this as unknown as Record<string, unknown>)[method];
    if (typeof fn !== 'function' || ['dispatch', 'constructor'].includes(method))
      throw new Error(`método desconhecido: ${String(method)}`);
    return (fn as (...a: unknown[]) => unknown).apply(this, params);
  }

  close(): void {
    this.active?.controller.abort();
    this.reader?.close();
    this.catalog.close();
  }

  engineInfo(): { engine: ScannerEngineKind; engineChoice: EngineChoice; nativeError: string | null } {
    const engineChoice = this.deps.engineChoice ?? 'auto';
    return {
      engine: this.deps.scanner.kind,
      engineChoice,
      // Calculado antes de o idioma ser configurado: o motivo fixo é traduzido aqui, no idioma atual.
      nativeError: engineChoice === 'node' ? msg().engine.nodeEngineChosen : this.deps.nativeError,
    };
  }

  configure(config: EngineConfig): ScanSummary | null {
    this.config = config;
    setLocale(config.locale);
    if (this.reader) this.reader.measure = config.measure;
    this.catalog.prune(config.keepScans, this.reader?.id);
    return this.summary();
  }

  // ------------------------------------------------------------ varredura

  startScan({ options }: { options: ScanOptions }): { scanId: number } {
    this.active?.controller.abort();
    const scanId = ++this.seq;
    const controller = new AbortController();
    this.active = { id: scanId, controller };
    void this.run(scanId, options, controller.signal);
    return { scanId };
  }

  cancelScan(): void {
    this.active?.controller.abort();
  }

  private async run(scanId: number, options: ScanOptions, signal: AbortSignal): Promise<void> {
    const isCurrent = () => this.active?.id === scanId && !signal.aborted;
    const progress = (p: ScanProgress) => {
      if (isCurrent()) this.deps.emit({ kind: 'event', type: 'progress', scanId, progress: p });
    };
    try {
      const snapshot = await this.deps.scanner.scan(options, progress, signal);
      // Resultado parcial de uma análise cancelada não substitui a análise anterior.
      if (snapshot.cancelled || !isCurrent()) {
        if (this.active?.id === scanId) this.deps.emit({ kind: 'event', type: 'cancelled', scanId });
        return;
      }
      const index = new TreeIndex(snapshot, this.deps.indexOptions);
      const suggestions = computeSuggestions(index, this.deps.suggestionEnv());
      const { id, file } = this.catalog.allocate();
      const finishedAt = Date.now();
      const base = {
        files: index.filesOf(0),
        dirs: index.dirsOf(0),
        bytes: index.diskOf(0),
        errors: snapshot.errorCount,
        currentPath: snapshot.rootPath,
      };
      await writeScan(
        file,
        index,
        {
          engine: this.deps.scanner.kind,
          elapsedMs: snapshot.elapsedMs,
          finishedAt,
          errorCount: snapshot.errorCount,
          issues: snapshot.issues,
          volume: await this.deps.volumeStats(snapshot.rootPath),
        },
        suggestions,
        (saved, total) => progress({ ...base, phase: 'saving', saved, total, elapsedMs: snapshot.elapsedMs }),
      );
      if (!isCurrent()) {
        this.deps.emit({ kind: 'event', type: 'cancelled', scanId });
        return;
      }
      this.catalog.add({
        id,
        file,
        rootPath: snapshot.rootPath,
        finishedAt,
        elapsedMs: snapshot.elapsedMs,
        engine: this.deps.scanner.kind,
        files: index.filesOf(0),
        dirs: index.dirsOf(0),
        disk: index.diskOf(0),
        logical: index.logicalOf(0),
        cloud: index.cloudOf(0),
        entries: index.size,
      });
      this.switchTo(this.openReader(id));
      this.catalog.replaceOlderOf(snapshot.rootPath, id, this.deps.indexOptions.caseInsensitive);
      this.catalog.prune(this.config.keepScans, id);
      this.deps.emit({ kind: 'event', type: 'done', scanId, summary: this.summary() as ScanSummary });
    } catch (err) {
      if (this.active?.id === scanId) {
        this.deps.emit({
          kind: 'event',
          type: 'error',
          scanId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      if (this.active?.id === scanId) this.active = null;
    }
  }

  // ------------------------------------------------------------ análises gravadas

  listScans(): SavedScan[] {
    return this.catalog.list();
  }

  async openScan({ id }: { id: string }): Promise<ScanSummary> {
    if (this.reader?.id !== id) this.switchTo(this.openReader(id));
    const reader = this.reader as ScanReader;
    // O volume pode ter mudado desde a análise; atualiza a capacidade/livre atual.
    const volume = await this.deps.volumeStats(reader.meta.rootPath);
    if (volume) reader.meta.volume = volume;
    return this.summary() as ScanSummary;
  }

  deleteScan({ id }: { id: string }): ScanSummary | null {
    if (this.reader?.id === id) this.switchTo(null);
    this.catalog.remove(id);
    return this.summary();
  }

  deleteAllScans(): void {
    this.switchTo(null);
    for (const s of this.catalog.list()) this.catalog.remove(s.id);
  }

  private openReader(id: string): ScanReader {
    const entry = this.catalog.get(id);
    if (!entry) throw new Error(msg().engine.scanNotFound);
    const reader = new ScanReader(id, entry.file, this.deps.indexOptions.caseInsensitive);
    reader.measure = this.config.measure;
    return reader;
  }

  private switchTo(reader: ScanReader | null): void {
    this.reader?.close();
    this.reader = reader;
  }

  // ------------------------------------------------------------ consultas

  listVolumes(): Promise<VolumeInfo[]> {
    return this.deps.listVolumes();
  }

  summary(): ScanSummary | null {
    const r = this.reader;
    if (!r) return null;
    const root = r.root();
    return {
      id: r.id,
      rootId: 0,
      rootPath: r.meta.rootPath,
      measure: r.measure as Measure,
      size: root.size,
      disk: root.disk,
      logical: root.logical,
      cloud: root.cloud,
      shared: root.shared,
      files: root.files,
      dirs: root.dirs,
      errorCount: r.meta.errorCount,
      issues: r.meta.issues,
      cancelled: false,
      elapsedMs: r.meta.elapsedMs,
      engine: r.meta.engine,
      finishedAt: r.meta.finishedAt,
      treeVersion: r.treeVersion,
      volume: r.meta.volume,
    };
  }

  details({ id }: { id: NodeId }): NodeDetails {
    return this.open().details(id);
  }

  view(q: ViewQuery): TreeViewNode {
    return this.open().view(q);
  }

  children(q: ChildrenQuery): ChildrenPage {
    return this.open().children(q);
  }

  top(q: TopQuery): TopItem[] {
    return this.open().top(q);
  }

  types(): TypeStats {
    return this.open().types();
  }

  search({ text, limit }: { text: string; limit: number }): TopItem[] {
    return this.open().search(text, limit);
  }

  suggestions(): Suggestion[] {
    return this.open().suggestions();
  }

  suggestionItems({ id }: { id: string }): TopItem[] {
    return this.open().suggestionItems(id);
  }

  findPath({ path }: { path: string }): NodeId | null {
    return this.reader ? this.reader.find(path) : null;
  }

  rankOf({ id }: { id: NodeId }): number {
    return this.open().rankOf(id);
  }

  // ------------------------------------------------------------ uso exclusivo do main

  resolve({ ids }: { ids: NodeId[] }): ResolvedNode[] {
    return this.open().resolve(ids);
  }

  async checkDeletable({ paths }: { paths: string[] }): Promise<DeleteCheck[]> {
    const checker = this.deps.deleteChecker ?? nodeChecker();
    return Promise.all(paths.map(p => checker(p)));
  }

  markRemoved({ ids }: { ids: NodeId[] }): ScanSummary | null {
    const reader = this.open();
    reader.markRemoved(ids);
    const root = reader.root();
    this.catalog.updateTotals(reader.id, {
      files: root.files,
      dirs: root.dirs,
      disk: root.disk,
      logical: root.logical,
      cloud: root.cloud,
    });
    return this.summary();
  }

  private open(): ScanReader {
    if (!this.reader) throw new Error(msg().engine.noScanLoaded);
    return this.reader;
  }
}
