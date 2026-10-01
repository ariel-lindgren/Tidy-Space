/**
 * Esquema do banco de uma análise (um arquivo SQLite por análise, em `<userData>/scans/`).
 * Um arquivo por análise torna "apagar análise" instantâneo (unlink) e mantém cada banco compacto.
 *
 * `entries` guarda a árvore em pré-ordem: a subárvore de `id` é o intervalo `[id, end_id)`.
 * Tamanhos (`size` = lógico, `disk` = em disco, `cloud` = só na nuvem, `shared` = em disco com hard
 * links) já vêm agregados por pasta.
 */
export const SCAN_SCHEMA_VERSION = 1;

export const SCAN_TABLES = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE entries (
  id          INTEGER PRIMARY KEY,
  parent      INTEGER,
  end_id      INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  kind        INTEGER NOT NULL,
  is_dir      INTEGER NOT NULL,
  size        INTEGER NOT NULL,
  disk        INTEGER NOT NULL,
  cloud       INTEGER NOT NULL,
  shared      INTEGER NOT NULL DEFAULT 0,
  files       INTEGER NOT NULL,
  dirs        INTEGER NOT NULL,
  mtime       INTEGER NOT NULL,
  cat         INTEGER NOT NULL,
  cat_share   INTEGER NOT NULL,
  flags       INTEGER NOT NULL,
  child_count INTEGER NOT NULL,
  largest     INTEGER,
  ext         TEXT,
  removed     INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE suggestions (
  id TEXT PRIMARY KEY, ord INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
  icon TEXT NOT NULL, risk TEXT NOT NULL, action TEXT NOT NULL, command TEXT
) WITHOUT ROWID;
CREATE TABLE suggestion_items (sid TEXT NOT NULL, id INTEGER NOT NULL, PRIMARY KEY (sid, id)) WITHOUT ROWID;
`;

/** Criados depois da carga em massa (bem mais rápido do que manter durante os INSERTs). */
export const SCAN_INDEXES = `
CREATE INDEX ix_children ON entries (parent, disk DESC);
CREATE INDEX ix_top ON entries (is_dir, disk DESC);
CREATE INDEX ix_suggestion_item ON suggestion_items (id);
`;

export const CATALOG_SCHEMA_VERSION = 1;

export const CATALOG_TABLES = `
CREATE TABLE IF NOT EXISTS scans (
  id          TEXT PRIMARY KEY,
  root_path   TEXT    NOT NULL,
  finished_at INTEGER NOT NULL,
  elapsed_ms  REAL    NOT NULL,
  engine      TEXT    NOT NULL,
  files       INTEGER NOT NULL,
  dirs        INTEGER NOT NULL,
  disk        INTEGER NOT NULL,
  logical     INTEGER NOT NULL,
  cloud       INTEGER NOT NULL,
  entries     INTEGER NOT NULL,
  file        TEXT    NOT NULL
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ix_scans_finished ON scans (finished_at DESC);
`;
