import type { ScanProgress } from '@shared/types';
import type { Snapshot } from '../snapshot';
import type { NativeAddon } from './loadNative';
import { PROGRESS_INTERVAL_MS, type ScanOptions, type Scanner } from './Scanner';

/** Scanner em Rust (N-API). O progresso é lido por polling — sem callbacks entre threads. */
export class NativeScanner implements Scanner {
  readonly kind = 'native' as const;

  constructor(private readonly addon: NativeAddon) {}

  async scan(options: ScanOptions, onProgress: (p: ScanProgress) => void, signal: AbortSignal): Promise<Snapshot> {
    const job = new this.addon.ScanJob({
      root: options.root,
      threads: options.threads,
      followSymlinks: options.followSymlinks,
      hardLinks: options.hardLinks,
      oneFilesystem: options.oneFilesystem,
      includeHidden: options.includeHidden,
      excludes: options.excludes,
    });
    const cancel = () => job.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    const report = () => onProgress({ ...job.progress(), phase: 'scanning' });
    const timer = setInterval(report, PROGRESS_INTERVAL_MS);
    try {
      const s = await job.run();
      report();
      return {
        rootPath: s.rootPath,
        names: s.names.length ? s.names.split('\0') : [],
        parents: s.parents,
        kinds: s.kinds,
        sizes: s.sizes,
        allocated: s.allocated,
        flags: s.flags,
        mtimes: s.mtimes,
        issues: s.issues,
        errorCount: s.errorCount,
        cancelled: s.cancelled,
        elapsedMs: s.elapsedMs,
      };
    } finally {
      clearInterval(timer);
      signal.removeEventListener('abort', cancel);
    }
  }
}
