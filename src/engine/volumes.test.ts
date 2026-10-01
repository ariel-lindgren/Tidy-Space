import { describe, expect, it } from 'vitest';
import { filterVolumes } from './volumes';

const vol = (mountPoint: string, fileSystem = 'ext4', total = 100) => ({
  name: '',
  mountPoint,
  fileSystem,
  total,
  available: 10,
  removable: false,
  kind: 'ssd',
});

describe('filterVolumes', () => {
  it('Linux: descarta pseudo sistemas de arquivos, snaps e duplicatas', () => {
    const out = filterVolumes(
      [
        vol('/'),
        vol('/'),
        vol('/home'),
        vol('/snap/core/1', 'squashfs'),
        vol('/run/user/1000', 'tmpfs'),
        vol('/boot/efi', 'vfat'),
        vol('/mnt/x', 'ext4', 0),
      ],
      'linux',
    );
    expect(out.map(v => v.mountPoint)).toEqual(['/', '/home']);
  });

  it('macOS: mantém "/" e /Volumes/*, nomeia o disco do sistema', () => {
    const out = filterVolumes(
      [vol('/', 'apfs'), vol('/System/Volumes/Data', 'apfs'), vol('/Volumes/Backup', 'exfat')],
      'darwin',
    );
    expect(out.map(v => [v.mountPoint, v.name])).toEqual([
      ['/', 'Macintosh HD'],
      ['/Volumes/Backup', '/Volumes/Backup'],
    ]);
  });

  it('normaliza tipo de disco desconhecido', () => {
    expect(filterVolumes([{ ...vol('C:\\', 'NTFS'), kind: 'weird' }], 'win32')[0]?.kind).toBe('unknown');
  });
});
