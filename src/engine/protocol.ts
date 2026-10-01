import type { Locale } from '@shared/i18n';
import type { EngineChoice } from '@shared/engineChoice';
import type { EngineQueries } from '@shared/ipc';
import type { EntryKind, Measure, NodeId, ScannerEngineKind, ScanProgress, ScanSummary } from '@shared/types';
import type { DeleteCheck } from './deletePreflight';
import type { ScanOptions } from './scanner/Scanner';

/** Protocolo main ⇄ engine (utilityProcess). O renderer só alcança as consultas de {@link EngineQueries}. */

export interface ResolvedNode {
  id: NodeId;
  path: string;
  /** Bytes que remover o item libera: em disco, menos o conteúdo compartilhado por hard links. */
  size: number;
  kind: EntryKind;
}

export interface EngineConfig {
  measure: Measure;
  keepScans: number;
  /** Idioma das mensagens geradas no engine (erros, sugestões, agrupamentos). */
  locale: Locale;
}

export interface EngineMethods extends EngineQueries {
  engineInfo(): { engine: ScannerEngineKind; engineChoice: EngineChoice; nativeError: string | null };
  configure(p: EngineConfig): ScanSummary | null;
  startScan(p: { options: ScanOptions }): { scanId: number };
  cancelScan(): void;
  openScan(p: { id: string }): Promise<ScanSummary>;
  deleteScan(p: { id: string }): ScanSummary | null;
  deleteAllScans(): void;
  resolve(p: { ids: NodeId[] }): ResolvedNode[];
  /** Verifica, sem pedir elevação, se cada item pode ser removido. */
  checkDeletable(p: { paths: string[] }): Promise<DeleteCheck[]>;
  markRemoved(p: { ids: NodeId[] }): ScanSummary | null;
}
export type EngineMethodName = keyof EngineMethods;

export interface EngineRequest {
  id: number;
  method: EngineMethodName;
  params: unknown[];
}

export type EngineReply =
  { kind: 'reply'; id: number; ok: true; result: unknown } | { kind: 'reply'; id: number; ok: false; error: string };

export type EngineEvent =
  | { kind: 'event'; type: 'progress'; scanId: number; progress: ScanProgress }
  | { kind: 'event'; type: 'done'; scanId: number; summary: ScanSummary }
  | { kind: 'event'; type: 'cancelled'; scanId: number }
  | { kind: 'event'; type: 'error'; scanId: number; message: string };

export type EngineMessage = EngineReply | EngineEvent;
