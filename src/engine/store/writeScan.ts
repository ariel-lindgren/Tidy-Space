import { renameSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { extensionOf } from '@shared/categories';
import type { ScanIssue, ScannerEngineKind } from '@shared/types';
import type { ComputedSuggestion } from '../suggestions/computeSuggestions';
import type { TreeIndex } from '../tree/TreeIndex';
import { removeDbFile } from './Catalog';
import { SCAN_INDEXES, SCAN_SCHEMA_VERSION, SCAN_TABLES } from './schema';

export interface ScanMeta {
  engine: ScannerEngineKind;
  elapsedMs: number;
  finishedAt: number;
  errorCount: number;
  issues: ScanIssue[];
  volume: { total: number; available: number } | null;
}

const BATCH = 25_000;

/**
 * Distribuição por tipo pré-calculada (agregar milhões de linhas a cada consulta levaria
 * segundos). `cats[cat] = [lógico, disco, qtd]`; `exts[ext] = [cat, lógico, disco, qtd]`.
 * Atualizada incrementalmente quando itens são removidos.
 */
export interface TypeTotals {
  cats: Record<number, [number, number, number]>;
  exts: Record<string, [number, number, number, number]>;
}
const yieldToLoop = () => new Promise<void>(resolve => setImmediate(resolve));

/**
 * Grava a análise num banco novo. Escreve em `<file>.part` e renomeia no fim, então um arquivo
 * `.db` sempre está completo. Durante a carga o banco fica sem journal/sync (é descartável até o
 * rename) e os índices são criados só depois — ordens de grandeza mais rápido.
 */
export async function writeScan(
  file: string,
  index: TreeIndex,
  meta: ScanMeta,
  suggestions: readonly ComputedSuggestion[],
  onProgress: (saved: number, total: number) => void,
): Promise<void> {
  const part = `${file}.part`;
  removeDbFile(part);
  const db = new DatabaseSync(part);
  try {
    db.exec(
      'PRAGMA page_size = 8192; PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA locking_mode = EXCLUSIVE; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -65536;',
    );
    db.exec(SCAN_TABLES);
    const types: TypeTotals = { cats: {}, exts: {} };
    const insert = db.prepare(
      'INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
    );
    const n = index.size;
    for (let start = 0; start < n; start += BATCH) {
      db.exec('BEGIN');
      const stop = Math.min(n, start + BATCH);
      for (let i = start; i < stop; i++) {
        const dir = index.isDir(i);
        if (!dir)
          addType(types, index.categoryCode(i), extensionOf(index.name(i)), index.logicalOf(i), index.diskOf(i), 1);
        insert.run(
          i,
          index.parentOf(i),
          index.endOf(i),
          index.name(i),
          index.kindCode(i),
          dir ? 1 : 0,
          index.logicalOf(i),
          index.diskOf(i),
          index.cloudOf(i),
          index.sharedOf(i),
          index.filesOf(i),
          index.dirsOf(i),
          Math.round(index.mtimeOf(i)),
          index.categoryCode(i),
          Math.round(index.categoryShare(i) * 1000),
          index.flagsOf(i),
          index.childCountOf(i),
          dir ? index.largestFileOf(i) : null,
          dir ? null : extensionOf(index.name(i)),
        );
      }
      db.exec('COMMIT');
      onProgress(stop, n);
      await yieldToLoop();
    }

    db.exec('BEGIN');
    const addSuggestion = db.prepare('INSERT INTO suggestions VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const addItem = db.prepare('INSERT INTO suggestion_items VALUES (?, ?)');
    suggestions.forEach((s, ord) => {
      addSuggestion.run(s.id, ord, s.title, s.description, s.icon, s.risk, s.action, s.command ?? null);
      for (const id of s.itemIds) addItem.run(s.id, id);
    });
    const setMeta = db.prepare('INSERT INTO meta VALUES (?, ?)');
    const metaRows: Record<string, unknown> = {
      schema: SCAN_SCHEMA_VERSION,
      root_path: index.rootPath,
      separator: index.separator,
      engine: meta.engine,
      elapsed_ms: meta.elapsedMs,
      finished_at: meta.finishedAt,
      error_count: meta.errorCount,
      issues: meta.issues.slice(0, 50),
      volume: meta.volume,
      tree_version: 0,
      types,
    };
    for (const [k, v] of Object.entries(metaRows)) setMeta.run(k, JSON.stringify(v));
    db.exec('COMMIT');

    db.exec(SCAN_INDEXES);
    db.exec('ANALYZE; PRAGMA locking_mode = NORMAL; PRAGMA journal_mode = DELETE;');
    db.close();
    renameSync(part, file);
  } catch (err) {
    try {
      db.close();
    } catch {
      /* já fechado */
    }
    removeDbFile(part);
    throw err;
  }
}

/** Soma (ou subtrai, com valores negativos) um arquivo/intervalo nos totais por tipo. */
export function addType(t: TypeTotals, cat: number, ext: string, logical: number, disk: number, count: number): void {
  const c = (t.cats[cat] ??= [0, 0, 0]);
  c[0] += logical;
  c[1] += disk;
  c[2] += count;
  const e = (t.exts[ext] ??= [cat, 0, 0, 0]);
  e[1] += logical;
  e[2] += disk;
  e[3] += count;
}
