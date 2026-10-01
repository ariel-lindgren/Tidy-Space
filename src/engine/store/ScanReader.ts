import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { CATEGORY_IDS, categoryIndex } from '@shared/categories';
import { LOCALES, messagesFor, msg } from '@shared/i18n';
import type {
  CategoryId,
  ChildrenPage,
  ChildrenQuery,
  Crumb,
  EntryKind,
  Measure,
  NodeDetails,
  NodeId,
  NodeInfo,
  ScanIssue,
  ScannerEngineKind,
  Suggestion,
  TopItem,
  TopQuery,
  TreeViewNode,
  TypeStats,
  ViewQuery,
} from '@shared/types';
import type { ResolvedNode } from '../protocol';
import { FLAG, KIND } from '../snapshot';
import { NODE_INSTALL_DIRS } from '../suggestions/rules';
import { addType, type TypeTotals } from './writeScan';

interface Row {
  id: number;
  parent: number | null;
  end_id: number;
  name: string;
  kind: number;
  size: number;
  disk: number;
  cloud: number;
  shared: number;
  files: number;
  dirs: number;
  mtime: number;
  cat: number;
  cat_share: number;
  flags: number;
  child_count: number;
  largest: number | null;
}

const COLS =
  'id, parent, end_id, name, kind, size, disk, cloud, shared, files, dirs, mtime, cat, cat_share, flags, child_count, largest';
const E_COLS = COLS.split(', ')
  .map(c => `e.${c}`)
  .join(', ');
const KIND_NAMES: readonly EntryKind[] = ['file', 'dir', 'symlink', 'other'];
const DAY = 86_400_000;
const PATH_CACHE_LIMIT = 20_000;
/** Itens de cada sugestão mostrados no card; a lista completa vem de `suggestionItems`. */
const PREVIEW_SUGGESTION_ITEMS = 50;
const MAX_SUGGESTION_ITEMS = 20_000;

export interface ScanMetaInfo {
  rootPath: string;
  separator: '/' | '\\';
  engine: ScannerEngineKind;
  elapsedMs: number;
  finishedAt: number;
  errorCount: number;
  issues: ScanIssue[];
  volume: { total: number; available: number } | null;
}

/**
 * Título, descrição (e o texto do Finder na Lixeira) no idioma atual: a análise pode ter sido
 * gravada em outro idioma. Ids desconhecidos mantêm o texto gravado.
 */
function localizeSuggestion(s: Suggestion): Suggestion {
  const catalog = msg().suggestions;
  if (!Object.hasOwn(catalog, s.id)) return s;
  const { title, description } = catalog[s.id as keyof typeof catalog];
  const finder = s.id === 'trash' && LOCALES.some(l => messagesFor(l).suggestions.trash.finderCommand === s.command);
  return { ...s, title, description, ...(finder ? { command: catalog.trash.finderCommand } : {}) };
}

const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, c => `\\${c}`)}%`;

/**
 * Consultas sobre uma análise gravada. Nada da árvore fica em memória além de pequenos caches:
 * cada tela lê só o que mostra, usando os índices `(parent, disk)` e `(is_dir, disk)`.
 */
export class ScanReader {
  readonly meta: ScanMetaInfo;
  measure: Measure = 'disk';
  private readonly db: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();
  private readonly paths = new Map<NodeId, string>();
  private readonly memo = new Map<string, unknown>();
  private version: number;
  private typeTotals: TypeTotals;

  constructor(
    readonly id: string,
    file: string,
    private readonly caseInsensitive: boolean,
  ) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA cache_size = -32768; PRAGMA mmap_size = 268435456; PRAGMA temp_store = MEMORY;');
    // Análises gravadas antes da coluna `shared` (hard links): sem informação, nada compartilhado.
    const columns = this.db.prepare('PRAGMA table_info(entries)').all() as { name: string }[];
    if (!columns.some(c => c.name === 'shared'))
      this.db.exec('ALTER TABLE entries ADD COLUMN shared INTEGER NOT NULL DEFAULT 0');
    const meta = Object.fromEntries(
      (this.db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map(r => [
        r.key,
        JSON.parse(r.value),
      ]),
    );
    this.meta = {
      rootPath: meta.root_path,
      separator: meta.separator,
      engine: meta.engine,
      elapsedMs: meta.elapsed_ms,
      finishedAt: meta.finished_at,
      errorCount: meta.error_count,
      issues: meta.issues ?? [],
      volume: meta.volume ?? null,
    };
    this.version = meta.tree_version ?? 0;
    this.typeTotals = meta.types ?? { cats: {}, exts: {} };
  }

  get treeVersion(): number {
    return this.version;
  }

  close(): void {
    this.db.close();
  }

  // ---------------------------------------------------------------- utilidades

  private get col(): 'size' | 'disk' {
    return this.measure === 'logical' ? 'size' : 'disk';
  }

  private stmt(sql: string): StatementSync {
    let s = this.statements.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.statements.set(sql, s);
    }
    return s;
  }

  private cached<T>(key: string, compute: () => T): T {
    const k = `${this.version}|${this.measure}|${key}`;
    if (this.memo.has(k)) return this.memo.get(k) as T;
    const value = compute();
    if (this.memo.size > 500) this.memo.clear();
    this.memo.set(k, value);
    return value;
  }

  private row(id: NodeId): Row | undefined {
    return this.stmt(`SELECT ${COLS} FROM entries WHERE id = ? AND removed = 0`).get(id) as Row | undefined;
  }

  private require(id: NodeId): Row {
    const r = this.row(id);
    if (!r) throw new Error(msg().engine.itemNotInScan(id));
    return r;
  }

  private value(r: Row): number {
    return this.measure === 'logical' ? r.size : r.disk;
  }

  private info(r: Row): NodeInfo {
    return {
      id: r.id,
      name: r.name,
      kind: KIND_NAMES[r.kind] ?? 'other',
      size: this.value(r),
      disk: r.disk,
      logical: r.size,
      cloud: r.cloud,
      shared: r.shared,
      cloudOnly: (r.flags & FLAG.cloud) !== 0,
      files: r.files,
      dirs: r.dirs,
      mtime: r.mtime,
      category: (CATEGORY_IDS[r.cat] ?? 'other') as CategoryId,
      childCount: r.child_count,
      parentId: r.parent,
    };
  }

  private topItem(r: Row): TopItem {
    return { ...this.info(r), path: this.path(r.id), parentPath: r.parent === null ? '' : this.path(r.parent) };
  }

  // ---------------------------------------------------------------- caminhos

  trail(id: NodeId): Crumb[] {
    const rows = this.stmt(
      `WITH RECURSIVE up(id, parent, name, depth) AS (
         SELECT id, parent, name, 0 FROM entries WHERE id = ?
         UNION ALL SELECT e.id, e.parent, e.name, up.depth + 1 FROM entries e JOIN up ON e.id = up.parent)
       SELECT id, name FROM up ORDER BY depth DESC`,
    ).all(id) as unknown as Crumb[];
    if (!rows.length) throw new Error(msg().engine.itemNotInScan(id));
    return rows;
  }

  path(id: NodeId): string {
    const hit = this.paths.get(id);
    if (hit !== undefined) return hit;
    const trail = this.trail(id);
    const sep = this.meta.separator;
    const root = this.meta.rootPath;
    const rest = trail.slice(1).map(c => c.name);
    const full = rest.length ? (root.endsWith(sep) ? root : root + sep) + rest.join(sep) : root;
    if (this.paths.size > PATH_CACHE_LIMIT) this.paths.clear();
    this.paths.set(id, full);
    return full;
  }

  find(fullPath: string): NodeId | null {
    const fold = (s: string) => (this.caseInsensitive ? s.toLowerCase() : s);
    const norm = (s: string) => fold(s.replace(/[\\/]+/g, '/').replace(/\/+$/, ''));
    const root = norm(this.meta.rootPath);
    const target = norm(fullPath);
    if (target === root) return 0;
    const prefix = root.endsWith('/') ? root : `${root}/`;
    if (!target.startsWith(prefix)) return null;
    const lookup = this.stmt(
      `SELECT id FROM entries WHERE parent = ? AND removed = 0 AND name = ?${this.caseInsensitive ? ' COLLATE NOCASE' : ''} LIMIT 1`,
    );
    let current = 0;
    for (const part of target.slice(prefix.length).split('/')) {
      const r = lookup.get(current, part) as { id: number } | undefined;
      if (!r) return null;
      current = r.id;
    }
    return current;
  }

  // ---------------------------------------------------------------- consultas

  root(): NodeInfo {
    return this.info(this.require(0));
  }

  details(id: NodeId): NodeDetails {
    const r = this.require(id);
    const node = this.info(r);
    const isDir = r.kind === KIND.dir;
    return {
      node,
      path: this.path(id),
      trail: this.trail(id),
      largestFile: isDir ? this.largestFile(r) : null,
      dominant: { category: node.category, share: isDir ? r.cat_share / 1000 : 1 },
      reclaimable: this.reclaimable(r),
    };
  }

  private largestFile(dir: Row): TopItem | null {
    if (this.measure === 'disk' && dir.largest !== null) {
      const stored = this.row(dir.largest);
      if (stored) return this.topItem(stored);
    }
    return this.cached(`largest:${dir.id}`, () => {
      const r = this.stmt(
        `SELECT ${COLS} FROM entries WHERE id > ? AND id < ? AND kind <> ${KIND.dir} AND removed = 0 ORDER BY ${this.col} DESC LIMIT 1`,
      ).get(dir.id, dir.end_id) as Row | undefined;
      return r ? this.topItem(r) : null;
    });
  }

  /**
   * Bytes que as sugestões "de fila" dentro da pasta liberariam (ou a pasta toda, se ela estiver
   * dentro de uma). Conteúdo compartilhado por hard links não conta.
   */
  private reclaimable(r: Row): number {
    const inside = this.stmt(
      `SELECT 1 FROM suggestion_items si JOIN suggestions s ON s.id = si.sid JOIN entries e ON e.id = si.id
       WHERE s.action = 'queue' AND e.removed = 0 AND si.id <= ? AND e.end_id > ? LIMIT 1`,
    ).get(r.id, r.id);
    if (inside) return r.disk - r.shared;
    const sum = this.stmt(
      `SELECT COALESCE(SUM(e.disk - e.shared), 0) AS total FROM suggestion_items si JOIN suggestions s ON s.id = si.sid JOIN entries e ON e.id = si.id
       WHERE s.action = 'queue' AND e.removed = 0 AND si.id > ? AND si.id < ?`,
    ).get(r.id, r.end_id) as { total: number };
    return sum.total;
  }

  view({ id, depth, maxChildren, minFraction }: ViewQuery): TreeViewNode {
    const col = this.col;
    const kids = this.stmt(
      `SELECT ${COLS} FROM entries WHERE parent = ? AND removed = 0 AND ${col} > 0 ORDER BY ${col} DESC LIMIT ?`,
    );
    const agg = this.stmt(
      `SELECT COUNT(*) AS n, COALESCE(SUM(${col}), 0) AS total, COALESCE(SUM(files), 0) AS files FROM entries WHERE parent = ? AND removed = 0 AND ${col} > 0`,
    );
    const toView = (r: Row): TreeViewNode => ({
      id: r.id,
      name: r.name,
      kind: KIND_NAMES[r.kind] ?? 'other',
      size: this.value(r),
      cloud: r.cloud,
      cloudOnly: (r.flags & FLAG.cloud) !== 0,
      files: r.files,
      mtime: r.mtime,
      category: (CATEGORY_IDS[r.cat] ?? 'other') as CategoryId,
      childCount: r.child_count,
    });
    const build = (r: Row, level: number): TreeViewNode => {
      const base = toView(r);
      if (level >= depth || r.kind !== KIND.dir) return base;
      const threshold = base.size * minFraction;
      const kept = (kids.all(r.id, maxChildren) as unknown as Row[]).filter(k => this.value(k) >= threshold);
      const all = agg.get(r.id) as { n: number; total: number; files: number };
      const children = kept.map(k => build(k, level + 1));
      const groupedCount = all.n - kept.length;
      if (groupedCount > 0) {
        children.push({
          id: null,
          name: msg().engine.smallerItems(groupedCount),
          kind: 'group',
          size: all.total - kept.reduce((a, k) => a + this.value(k), 0),
          cloud: 0,
          cloudOnly: false,
          files: all.files - kept.reduce((a, k) => a + k.files, 0),
          mtime: 0,
          category: 'other',
          childCount: 0,
          groupedCount,
        });
      }
      return { ...base, children };
    };
    return build(this.require(id), 0);
  }

  children(q: ChildrenQuery): ChildrenPage {
    const filter = q.filter?.trim();
    const where = `parent = ? AND removed = 0${filter ? " AND name LIKE ? ESCAPE '\\'" : ''}`;
    const dir = q.direction === 'asc' ? 'ASC' : 'DESC';
    const order =
      q.sort === 'name'
        ? `name COLLATE NOCASE ${dir}`
        : q.sort === 'files'
          ? `files ${dir}`
          : q.sort === 'mtime'
            ? `mtime ${dir}`
            : `${this.col} ${dir}`;
    const args: (number | string)[] = filter ? [q.id, likePattern(filter)] : [q.id];
    const total = (this.stmt(`SELECT COUNT(*) AS n FROM entries WHERE ${where}`).get(...args) as { n: number }).n;
    const rows = this.stmt(`SELECT ${COLS} FROM entries WHERE ${where} ORDER BY ${order}, id LIMIT ? OFFSET ?`).all(
      ...args,
      q.limit,
      q.offset,
    ) as unknown as Row[];
    return { total, items: rows.map(r => this.info(r)) };
  }

  /** Posição do item entre os irmãos, na ordem padrão (maior primeiro). */
  rankOf(id: NodeId): number {
    const r = this.require(id);
    if (r.parent === null) return 0;
    return (
      this.stmt(`SELECT COUNT(*) AS n FROM entries WHERE parent = ? AND removed = 0 AND ${this.col} > ?`).get(
        r.parent,
        this.value(r),
      ) as { n: number }
    ).n;
  }

  top(q: TopQuery): TopItem[] {
    const where = ['is_dir = ?', 'removed = 0', 'id <> 0'];
    const args: (number | string)[] = [q.kind === 'dir' ? 1 : 0];
    if (q.category) {
      where.push('cat = ?');
      args.push(categoryIndex(q.category));
    }
    if (q.olderThanDays) {
      where.push('mtime > 0 AND mtime < ?');
      args.push(Date.now() - q.olderThanDays * DAY);
    }
    if (q.text?.trim()) {
      where.push("name LIKE ? ESCAPE '\\'");
      args.push(likePattern(q.text.trim()));
    }
    const rows = this.stmt(
      `SELECT ${COLS} FROM entries WHERE ${where.join(' AND ')} ORDER BY ${this.col} DESC LIMIT ?`,
    ).all(...args, q.limit) as unknown as Row[];
    return rows.map(r => this.topItem(r));
  }

  search(text: string, limit: number): TopItem[] {
    const t = text.trim();
    if (!t) return [];
    const rows = this.stmt(
      `SELECT ${COLS} FROM entries WHERE removed = 0 AND id <> 0 AND name LIKE ? ESCAPE '\\' ORDER BY ${this.col} DESC LIMIT ?`,
    ).all(likePattern(t), limit) as unknown as Row[];
    return rows.map(r => this.topItem(r));
  }

  types(): TypeStats {
    const pick = this.measure === 'logical' ? 0 : 1;
    const cats = Object.entries(this.typeTotals.cats)
      .filter(([, v]) => v[2] > 0)
      .map(([cat, v]) => ({
        category: (CATEGORY_IDS[Number(cat)] ?? 'other') as CategoryId,
        size: v[pick],
        count: v[2],
      }))
      .sort((a, b) => b.size - a.size);
    const exts = Object.entries(this.typeTotals.exts)
      .filter(([, v]) => v[3] > 0)
      .map(([ext, v]) => ({
        ext,
        category: (CATEGORY_IDS[v[0]] ?? 'other') as CategoryId,
        size: v[pick + 1],
        count: v[3],
      }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 24);
    return { categories: cats, extensions: exts };
  }

  /**
   * Sugestões com tamanhos atuais (itens removidos saem automaticamente). Sempre o que seria
   * liberado: bytes no disco menos o conteúdo compartilhado por hard links.
   */
  suggestions(): Suggestion[] {
    return this.cached('suggestions', () => {
      const list = this.stmt(
        'SELECT id, title, description, icon, risk, action, command FROM suggestions ORDER BY ord',
      ).all() as unknown as (Omit<Suggestion, 'size' | 'itemCount' | 'items' | 'command'> & {
        command: string | null;
      })[];
      return list
        .map(s => {
          const all = this.suggestionItems(s.id);
          const { command, ...rest } = s;
          return {
            ...rest,
            ...(command ? { command } : {}),
            size: all.reduce((sum, i) => sum + i.size, 0),
            itemCount: all.length,
            items: all.slice(0, PREVIEW_SUGGESTION_ITEMS),
          };
        })
        .filter(s => s.size > 0)
        .sort((x, y) => y.size - x.size);
    }).map(localizeSuggestion);
  }

  /** Todos os itens de uma sugestão (maiores primeiro), medidos pelo que liberariam. */
  suggestionItems(sid: string): TopItem[] {
    return this.cached(`suggestion-items:${sid}`, () => {
      const rows = this.stmt(
        `SELECT ${E_COLS} FROM suggestion_items si JOIN entries e ON e.id = si.id
         WHERE si.sid = ? AND e.removed = 0 AND e.disk - e.shared > 0
         ORDER BY e.disk - e.shared DESC LIMIT ${MAX_SUGGESTION_ITEMS}`,
      ).all(sid) as unknown as Row[];
      const safe = sid === 'node-modules' ? rows.filter(r => this.isProjectNodeModules(r)) : rows;
      return safe.map(r => ({ ...this.topItem(r), size: r.disk - r.shared }));
    });
  }

  /**
   * Defesa para análises gravadas antes da regra atual: só node_modules de projetos (pasta com
   * package.json) e fora de instalações do Node (nvm, fnm, volta, npm global…).
   */
  private isProjectNodeModules(r: Row): boolean {
    if (r.parent === null) return false;
    const segments = this.path(r.parent).toLowerCase().split(/[\\/]/);
    if (segments.some(s => NODE_INSTALL_DIRS.has(s))) return false;
    return !!this.stmt(
      "SELECT 1 FROM entries WHERE parent = ? AND removed = 0 AND kind <> 1 AND name = 'package.json' COLLATE NOCASE LIMIT 1",
    ).get(r.parent);
  }

  resolve(ids: readonly NodeId[]): ResolvedNode[] {
    return ids
      .map(id => (id > 0 ? this.row(id) : undefined))
      .filter((r): r is Row => !!r)
      .map(r => ({
        id: r.id,
        path: this.path(r.id),
        size: r.disk - r.shared,
        kind: KIND_NAMES[r.kind] ?? 'other',
      }));
  }

  // ---------------------------------------------------------------- mutação

  /**
   * Marca itens como removidos (após Lixeira/exclusão no disco) e desconta os totais dos
   * ancestrais, numa única transação. Ignora a raiz, ids inválidos e o que já foi removido.
   */
  markRemoved(ids: readonly NodeId[]): void {
    const sorted = [...new Set(ids)].filter(id => id > 0).sort((a, b) => a - b);
    const parentOf = this.stmt('SELECT parent FROM entries WHERE id = ?');
    const hide = this.stmt('UPDATE entries SET removed = 1 WHERE id >= ? AND id < ?');
    const subtract = this.stmt(
      'UPDATE entries SET size = size - ?, disk = disk - ?, cloud = cloud - ?, shared = shared - ?, files = files - ?, dirs = dirs - ? WHERE id = ?',
    );
    const detach = this.stmt('UPDATE entries SET child_count = child_count - 1 WHERE id = ?');
    const typesIn = this.stmt(
      `SELECT cat, COALESCE(ext, '') AS ext, SUM(size) AS logical, SUM(disk) AS disk, COUNT(*) AS n
       FROM entries WHERE id >= ? AND id < ? AND is_dir = 0 AND removed = 0 GROUP BY cat, ext`,
    );
    let changed = false;
    this.db.exec('BEGIN');
    try {
      for (const id of sorted) {
        const r = this.row(id);
        if (!r) continue;
        for (const t of typesIn.all(r.id, r.end_id) as {
          cat: number;
          ext: string;
          logical: number;
          disk: number;
          n: number;
        }[]) {
          addType(this.typeTotals, t.cat, t.ext, -t.logical, -t.disk, -t.n);
        }
        hide.run(r.id, r.end_id);
        const dirs = r.dirs + (r.kind === KIND.dir ? 1 : 0);
        for (let p: number | null = r.parent; p !== null; p = (parentOf.get(p) as { parent: number | null }).parent) {
          subtract.run(r.size, r.disk, r.cloud, r.shared, r.files, dirs, p);
        }
        if (r.parent !== null) detach.run(r.parent);
        changed = true;
      }
      if (changed) {
        this.version++;
        this.stmt("INSERT OR REPLACE INTO meta VALUES ('tree_version', ?)").run(JSON.stringify(this.version));
        this.stmt("INSERT OR REPLACE INTO meta VALUES ('types', ?)").run(JSON.stringify(this.typeTotals));
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    if (changed) this.memo.clear();
  }
}
