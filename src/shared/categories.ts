import { msg } from './i18n';
import type { CategoryId } from './types';

export interface CategoryDef {
  id: CategoryId;
  /** Nome no idioma atual da interface. */
  readonly label: string;
  icon: string;
  /** Índice da cor na paleta do tema (--c0 … --c8). */
  color: number;
  extensions: readonly string[];
}

/** O nome de cada categoria vem do catálogo de textos, no idioma atual. */
const withLabel = (defs: Omit<CategoryDef, 'label'>[]): CategoryDef[] =>
  defs.map(d =>
    Object.defineProperty({ ...d }, 'label', { get: () => msg().categories[d.id], enumerable: true }),
  ) as CategoryDef[];

export const CATEGORIES: readonly CategoryDef[] = withLabel([
  {
    id: 'video',
    icon: 'video',
    color: 3,
    extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mts'],
  },
  {
    id: 'image',
    icon: 'image',
    color: 5,
    extensions: [
      'jpg',
      'jpeg',
      'png',
      'heic',
      'heif',
      'gif',
      'webp',
      'psd',
      'raw',
      'cr2',
      'cr3',
      'nef',
      'arw',
      'dng',
      'tif',
      'tiff',
      'bmp',
      'svg',
    ],
  },
  {
    id: 'audio',
    icon: 'music',
    color: 8,
    extensions: ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'aiff'],
  },
  {
    id: 'doc',
    icon: 'doc',
    color: 6,
    extensions: [
      'pdf',
      'doc',
      'docx',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'odt',
      'ods',
      'odp',
      'txt',
      'md',
      'csv',
      'rtf',
      'epub',
    ],
  },
  {
    id: 'code',
    icon: 'code',
    color: 1,
    extensions: [
      'js',
      'mjs',
      'cjs',
      'ts',
      'tsx',
      'jsx',
      'json',
      'css',
      'scss',
      'map',
      'html',
      'py',
      'pyc',
      'rs',
      'go',
      'java',
      'class',
      'jar',
      'kt',
      'cs',
      'c',
      'h',
      'cpp',
      'hpp',
      'node',
      'wasm',
      'pack',
      'idx',
      'rlib',
      'nupkg',
      'whl',
      'gem',
      'lock',
    ],
  },
  {
    id: 'archive',
    icon: 'archive',
    color: 4,
    extensions: ['zip', 'rar', '7z', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'tar'],
  },
  {
    id: 'install',
    icon: 'package',
    color: 7,
    extensions: [
      'exe',
      'msi',
      'msix',
      'iso',
      'dmg',
      'pkg',
      'deb',
      'rpm',
      'appimage',
      'apk',
      'dll',
      'so',
      'dylib',
      'pak',
      'vpk',
      'bundle',
      'assets',
      'archive',
    ],
  },
  {
    id: 'vdisk',
    icon: 'disk',
    color: 2,
    extensions: ['vhd', 'vhdx', 'vmdk', 'vdi', 'qcow2', 'img', 'mrimg', 'raw_disk'],
  },
  {
    id: 'system',
    icon: 'cpu',
    color: 0,
    extensions: ['sys', 'dat', 'log', 'etl', 'tmp', 'cache', 'db', 'sqlite', 'ttf', 'otf', 'bin', 'blob', 'ldb', 'dmp'],
  },
  { id: 'other', icon: 'file', color: 0, extensions: [] },
]);

export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map(c => c.id);

const BY_ID = new Map(CATEGORIES.map(c => [c.id, c]));
const BY_EXT = new Map<string, CategoryId>();
for (const c of CATEGORIES) for (const e of c.extensions) BY_EXT.set(e, c.id);

export function category(id: CategoryId): CategoryDef {
  return BY_ID.get(id) ?? (BY_ID.get('other') as CategoryDef);
}

/** Extensão em minúsculas, sem o ponto. Arquivos ocultos sem extensão (".bashrc") retornam "". */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

export function categoryOfName(name: string): CategoryId {
  return BY_EXT.get(extensionOf(name)) ?? 'other';
}

export function categoryIndex(id: CategoryId): number {
  return CATEGORY_IDS.indexOf(id);
}
