import type { Dirent, Stats } from 'node:fs';
import { lstat, opendir, realpath, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { msg } from '@shared/i18n';
import type { ScanIssue, ScanProgress } from '@shared/types';
import { FLAG, KIND, NO_PARENT, type Snapshot } from '../snapshot';
import { Excludes } from './excludes';
import { PROGRESS_INTERVAL_MS, type ScanOptions, type Scanner } from './Scanner';

interface DirNode {
  name: string;
  mtime: number;
  files: { name: string; size: number; disk: number; flags: number; mtime: number; kind: number }[];
  dirs: DirNode[];
}

const MAX_ISSUES = 200;
const CLUSTER = 4096;

/** Semáforo simples: limita quantos diretórios são lidos ao mesmo tempo. */
class Semaphore {
  private waiting: (() => void)[] = [];
  constructor(private free: number) {}
  async acquire(): Promise<void> {
    if (this.free > 0) {
      this.free--;
      return;
    }
    await new Promise<void>(resolve => this.waiting.push(resolve));
  }
  release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.free++;
  }
}

/**
 * Scanner de fallback em TypeScript. Mesma semântica do scanner nativo (links não seguidos por
 * padrão, hard links contados uma vez, não atravessa sistemas de arquivos), porém mais lento.
 */
export class NodeScanner implements Scanner {
  readonly kind = 'node' as const;

  constructor(private readonly platform: NodeJS.Platform = process.platform) {}

  async scan(options: ScanOptions, onProgress: (p: ScanProgress) => void, signal: AbortSignal): Promise<Snapshot> {
    const started = performance.now();
    const root = path.resolve(options.root);
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) throw new Error(msg().engine.notAFolder(root));

    const excludes = Excludes.forPlatform(options.excludes, this.platform);
    const counters = { files: 0, dirs: 0, bytes: 0, errors: 0, currentPath: root };
    const issues: ScanIssue[] = [];
    const seenInodes = new Set<string>();
    const visitedLinks = new Set<string>();
    const sem = new Semaphore(Math.max(4, (options.threads || os.availableParallelism()) * 4));
    const isWindows = this.platform === 'win32';

    const report = () => onProgress({ ...counters, phase: 'scanning', elapsedMs: performance.now() - started });
    const timer = setInterval(report, PROGRESS_INTERVAL_MS);

    const issue = (p: string, err: unknown) => {
      counters.errors++;
      if (issues.length < MAX_ISSUES)
        issues.push({ path: p, message: err instanceof Error ? err.message : String(err) });
    };
    /**
     * Tamanho lógico e em disco. Unix: blocos alocados (cobre arquivos esparsos). Windows: o Node
     * não expõe atributos de arquivo, então não dá para reconhecer placeholders do OneDrive —
     * arredonda para o cluster (só o scanner nativo detecta arquivos que estão só na nuvem).
     * Hard links: o conteúdo conta uma vez; a identidade é relida como bigint porque ids de
     * arquivo do NTFS passam de 2^53.
     */
    const usage = async (
      file: string,
      st: Stats,
      follow: boolean,
    ): Promise<{ size: number; disk: number; flags: number }> => {
      const disk = isWindows || !st.blocks ? Math.ceil(st.size / CLUSTER) * CLUSTER : st.blocks * 512;
      if (!options.hardLinks || st.nlink <= 1 || st.size === 0) return { size: st.size, disk, flags: 0 };
      const big = await (follow ? stat : lstat)(file, { bigint: true }).catch(() => null);
      const key = big ? `${big.dev}:${big.ino}` : `${st.dev}:${st.ino}`;
      if (seenInodes.has(key)) return { size: 0, disk: 0, flags: FLAG.hardlink };
      seenInodes.add(key);
      return { size: st.size, disk, flags: FLAG.hardlink };
    };

    const walk = async (dirPath: string, name: string, mtime: number): Promise<DirNode> => {
      const node: DirNode = { name, mtime, files: [], dirs: [] };
      if (signal.aborted) return node;
      counters.dirs++;
      if (counters.dirs % 16 === 0) counters.currentPath = dirPath;

      const pending: Promise<DirNode>[] = [];
      await sem.acquire();
      try {
        const dir = await opendir(dirPath, { bufferSize: 256 });
        for await (const entry of dir as AsyncIterable<Dirent>) {
          if (signal.aborted) break;
          const child = path.join(dirPath, entry.name);
          if (excludes.matches(child, entry.name)) continue;
          if (!options.includeHidden && !isWindows && entry.name.startsWith('.')) continue;
          let st: Stats;
          try {
            st = await lstat(child);
          } catch (err) {
            issue(child, err);
            continue;
          }
          if (st.isSymbolicLink()) {
            if (options.followSymlinks) {
              try {
                const target = await stat(child);
                if (target.isDirectory()) {
                  const real = await realpath(child);
                  if (!visitedLinks.has(real)) {
                    visitedLinks.add(real);
                    pending.push(walk(child, entry.name, target.mtimeMs));
                  }
                  continue;
                }
                const u = await usage(child, target, true);
                counters.files++;
                counters.bytes += u.disk;
                node.files.push({ name: entry.name, ...u, mtime: target.mtimeMs, kind: KIND.file });
                continue;
              } catch {
                /* link quebrado: conta como link */
              }
            }
            counters.files++;
            counters.bytes += st.size;
            node.files.push({
              name: entry.name,
              size: st.size,
              disk: st.size,
              flags: 0,
              mtime: st.mtimeMs,
              kind: KIND.symlink,
            });
          } else if (st.isDirectory()) {
            if (!(options.oneFilesystem && !isWindows && st.dev !== rootStat.dev)) {
              pending.push(walk(child, entry.name, st.mtimeMs));
            }
          } else {
            const u = await usage(child, st, false);
            counters.files++;
            counters.bytes += u.disk;
            node.files.push({
              name: entry.name,
              ...u,
              mtime: st.mtimeMs,
              kind: st.isFile() ? KIND.file : KIND.other,
            });
          }
        }
      } catch (err) {
        issue(dirPath, err);
      } finally {
        sem.release();
      }
      node.dirs = await Promise.all(pending);
      return node;
    };

    try {
      const tree = await walk(root, root, rootStat.mtimeMs);
      report();
      return flatten(root, tree, {
        issues,
        errorCount: counters.errors,
        cancelled: signal.aborted,
        elapsedMs: performance.now() - started,
      });
    } finally {
      clearInterval(timer);
    }
  }
}

function flatten(
  rootPath: string,
  root: DirNode,
  extra: Pick<Snapshot, 'issues' | 'errorCount' | 'cancelled' | 'elapsedMs'>,
): Snapshot {
  const names: string[] = [];
  const parents: number[] = [];
  const kinds: number[] = [];
  const sizes: number[] = [];
  const allocated: number[] = [];
  const flags: number[] = [];
  const mtimes: number[] = [];
  const stack: [DirNode, number][] = [[root, NO_PARENT]];
  while (stack.length) {
    const [dir, parent] = stack.pop() as [DirNode, number];
    const idx = names.length;
    names.push(dir.name);
    parents.push(parent);
    kinds.push(KIND.dir);
    sizes.push(0);
    allocated.push(0);
    flags.push(0);
    mtimes.push(dir.mtime);
    for (const f of dir.files) {
      names.push(f.name);
      parents.push(idx);
      kinds.push(f.kind);
      sizes.push(f.size);
      allocated.push(f.disk);
      flags.push(f.flags);
      mtimes.push(f.mtime);
    }
    for (let i = dir.dirs.length - 1; i >= 0; i--) stack.push([dir.dirs[i] as DirNode, idx]);
  }
  return {
    rootPath,
    names,
    parents: Uint32Array.from(parents),
    kinds: Uint8Array.from(kinds),
    sizes: Float64Array.from(sizes),
    allocated: Float64Array.from(allocated),
    flags: Uint8Array.from(flags),
    mtimes: Float64Array.from(mtimes),
    ...extra,
  };
}
