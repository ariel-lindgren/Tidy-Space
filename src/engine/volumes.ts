import { readdir, readFile, statfs } from 'node:fs/promises';
import type { VolumeInfo } from '@shared/types';
import type { NativeAddon } from './scanner/loadNative';

type RawVolume = Omit<VolumeInfo, 'id' | 'kind'> & { kind: string };

const PSEUDO_FS = new Set([
  'tmpfs',
  'devtmpfs',
  'squashfs',
  'overlay',
  'proc',
  'sysfs',
  'cgroup',
  'cgroup2',
  'autofs',
  'devpts',
  'mqueue',
  'debugfs',
  'tracefs',
  'fusectl',
  'securityfs',
  'pstore',
  'bpf',
  'efivarfs',
  'ramfs',
  'nsfs',
  'configfs',
  'hugetlbfs',
  'binfmt_misc',
  'fuse.portal',
  'fuse.gvfsd-fuse',
]);
const LINUX_SKIP = /^\/(proc|sys|dev|run|snap|boot\/efi|var\/lib\/docker)(\/|$)/;

/** Mantém só os volumes que fazem sentido analisar, por plataforma. */
export function filterVolumes(list: readonly RawVolume[], platform: string): VolumeInfo[] {
  const seen = new Set<string>();
  return list
    .filter(v => v.total > 0)
    .filter(v => {
      if (platform === 'darwin') return v.mountPoint === '/' || /^\/Volumes\/[^/]+$/.test(v.mountPoint);
      if (platform === 'linux') return !PSEUDO_FS.has(v.fileSystem.toLowerCase()) && !LINUX_SKIP.test(v.mountPoint);
      return true;
    })
    .filter(v => (seen.has(v.mountPoint) ? false : (seen.add(v.mountPoint), true)))
    .map(v => ({
      ...v,
      id: v.mountPoint,
      name: v.name || (platform === 'darwin' && v.mountPoint === '/' ? 'Macintosh HD' : v.mountPoint),
      kind: (v.kind === 'ssd' || v.kind === 'hdd' ? v.kind : 'unknown') as VolumeInfo['kind'],
    }))
    .sort((a, b) => a.mountPoint.localeCompare(b.mountPoint));
}

export async function listVolumes(
  addon: NativeAddon | null,
  platform: string = process.platform,
): Promise<VolumeInfo[]> {
  const raw = addon ? addon.listVolumes() : await fallbackVolumes(platform);
  return filterVolumes(raw, platform);
}

export async function volumeStats(path: string): Promise<{ total: number; available: number } | null> {
  try {
    const s = await statfs(path);
    return { total: s.blocks * s.bsize, available: s.bavail * s.bsize };
  } catch {
    return null;
  }
}

/** Sem módulo nativo: descobre pontos de montagem com o que o Node oferece. */
async function fallbackVolumes(platform: string): Promise<RawVolume[]> {
  let mounts: { path: string; fs: string }[];
  if (platform === 'win32') {
    mounts = [...'CDEFGHIJKLMNOPQRSTUVWXYZ'].map(l => ({ path: `${l}:\\`, fs: 'NTFS' }));
  } else if (platform === 'darwin') {
    const vols = await readdir('/Volumes').catch(() => [] as string[]);
    mounts = [{ path: '/', fs: 'apfs' }, ...vols.map(v => ({ path: `/Volumes/${v}`, fs: '' }))];
  } else {
    const text = await readFile('/proc/mounts', 'utf8').catch(() => '');
    mounts = text
      .split('\n')
      .map(l => l.split(' '))
      .filter(p => p.length > 2)
      .map(p => ({ path: (p[1] as string).replace(/\\040/g, ' '), fs: p[2] as string }));
    if (!mounts.length) mounts = [{ path: '/', fs: '' }];
  }
  const out: RawVolume[] = [];
  for (const m of mounts) {
    const st = await volumeStats(m.path);
    if (st) out.push({ name: '', mountPoint: m.path, fileSystem: m.fs, ...st, removable: false, kind: 'unknown' });
  }
  return out;
}
