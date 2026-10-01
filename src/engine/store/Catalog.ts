import { mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SavedScan, ScannerEngineKind } from '@shared/types';
import { CATALOG_SCHEMA_VERSION, CATALOG_TABLES } from './schema';

interface CatalogRow {
  id: string;
  root_path: string;
  finished_at: number;
  elapsed_ms: number;
  engine: string;
  files: number;
  dirs: number;
  disk: number;
  logical: number;
  cloud: number;
  entries: number;
  file: string;
}

export type CatalogEntry = Omit<SavedScan, 'storageBytes'> & { entries: number; file: string };

/** Lista de análises gravadas (`<dataDir>/catalog.db`) e os arquivos de cada uma. */
export class Catalog {
  private readonly db: DatabaseSync;
  readonly scansDir: string;

  constructor(readonly dataDir: string) {
    this.scansDir = path.join(dataDir, 'scans');
    mkdirSync(this.scansDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'catalog.db'));
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.db.exec(CATALOG_TABLES);
    this.db.exec(`PRAGMA user_version = ${CATALOG_SCHEMA_VERSION}`);
  }

  /** Novo id ordenável por tempo e o caminho do arquivo correspondente. */
  allocate(now = Date.now()): { id: string; file: string } {
    const id = `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, file: path.join(this.scansDir, `${id}.db`) };
  }

  add(entry: CatalogEntry): void {
    this.db
      .prepare(
        `INSERT INTO scans (id, root_path, finished_at, elapsed_ms, engine, files, dirs, disk, logical, cloud, entries, file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.rootPath,
        entry.finishedAt,
        entry.elapsedMs,
        entry.engine,
        entry.files,
        entry.dirs,
        entry.disk,
        entry.logical,
        entry.cloud,
        entry.entries,
        path.basename(entry.file),
      );
  }

  get(id: string): CatalogEntry | null {
    const row = this.db.prepare('SELECT * FROM scans WHERE id = ?').get(id) as CatalogRow | undefined;
    return row ? this.toEntry(row) : null;
  }

  list(): SavedScan[] {
    const rows = this.db.prepare('SELECT * FROM scans ORDER BY finished_at DESC').all() as unknown as CatalogRow[];
    return rows.map(r => {
      const e = this.toEntry(r);
      return {
        id: e.id,
        rootPath: e.rootPath,
        finishedAt: e.finishedAt,
        elapsedMs: e.elapsedMs,
        engine: e.engine,
        files: e.files,
        dirs: e.dirs,
        disk: e.disk,
        logical: e.logical,
        cloud: e.cloud,
        storageBytes: fileSize(e.file),
      };
    });
  }

  updateTotals(id: string, t: Pick<SavedScan, 'files' | 'dirs' | 'disk' | 'logical' | 'cloud'>): void {
    this.db
      .prepare('UPDATE scans SET files = ?, dirs = ?, disk = ?, logical = ?, cloud = ? WHERE id = ?')
      .run(t.files, t.dirs, t.disk, t.logical, t.cloud, id);
  }

  remove(id: string): void {
    const entry = this.get(id);
    this.db.prepare('DELETE FROM scans WHERE id = ?').run(id);
    if (entry) removeDbFile(entry.file);
  }

  /** Remove análises anteriores do mesmo local (mantém uma por disco/pasta). */
  replaceOlderOf(rootPath: string, keepId: string, caseInsensitive: boolean): string[] {
    const fold = (p: string) => {
      const n = p.replace(/[\\/]+$/, '');
      return caseInsensitive ? n.toLowerCase() : n;
    };
    const rows = this.db.prepare('SELECT id, root_path FROM scans').all() as { id: string; root_path: string }[];
    const doomed = rows.filter(r => r.id !== keepId && fold(r.root_path) === fold(rootPath)).map(r => r.id);
    doomed.forEach(id => this.remove(id));
    return doomed;
  }

  /** Mantém só as `keep` mais recentes (nunca apaga `protectId`). Retorna os ids removidos. */
  prune(keep: number, protectId?: string): string[] {
    const ids = (this.db.prepare('SELECT id FROM scans ORDER BY finished_at DESC').all() as { id: string }[]).map(
      r => r.id,
    );
    const doomed = ids.filter((id, i) => i >= keep && id !== protectId);
    doomed.forEach(id => this.remove(id));
    return doomed;
  }

  close(): void {
    this.db.close();
  }

  private toEntry(r: CatalogRow): CatalogEntry {
    return {
      id: r.id,
      rootPath: r.root_path,
      finishedAt: r.finished_at,
      elapsedMs: r.elapsed_ms,
      engine: r.engine as ScannerEngineKind,
      files: r.files,
      dirs: r.dirs,
      disk: r.disk,
      logical: r.logical,
      cloud: r.cloud,
      entries: r.entries,
      file: path.join(this.scansDir, r.file),
    };
  }
}

function fileSize(file: string): number {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

export function removeDbFile(file: string): void {
  for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(file + suffix, { force: true });
}
