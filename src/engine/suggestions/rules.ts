import path from 'node:path';
import os from 'node:os';
import { extensionOf } from '@shared/categories';
import { msg, type Messages } from '@shared/i18n';
import type { NodeId, Risk } from '@shared/types';
import type { TreeIndex } from '../tree/TreeIndex';

/** Locais conhecidos do sistema, resolvidos uma vez (injetáveis nos testes). */
export interface SuggestionEnv {
  platform: string;
  home: string;
  tmpDir: string;
  localAppData?: string;
  winDir?: string;
  systemDrive?: string;
  now: number;
}

export function envFromProcess(): SuggestionEnv {
  const e = process.env;
  return {
    platform: process.platform,
    home: os.homedir(),
    tmpDir: os.tmpdir(),
    localAppData: e.LOCALAPPDATA,
    winDir: e.WINDIR ?? e.SystemRoot,
    systemDrive: e.SystemDrive,
    now: Date.now(),
  };
}

const DAY = 86_400_000;

/** Utilitários de busca que as regras usam; encapsula plataforma e o índice. */
export class RuleContext {
  private readonly join: (...p: string[]) => string;

  constructor(
    readonly index: TreeIndex,
    readonly env: SuggestionEnv,
  ) {
    this.join = env.platform === 'win32' ? path.win32.join : path.posix.join;
  }

  /** Nó em um caminho; segmentos `*` casam com qualquer filho. Retorna todos os que casarem. */
  at(base: string | undefined, ...segments: string[]): NodeId[] {
    if (!base) return [];
    const star = segments.indexOf('*');
    if (star < 0) {
      const id = this.index.find(this.join(base, ...segments));
      return id === null ? [] : [id];
    }
    const prefix = this.index.find(this.join(base, ...segments.slice(0, star)));
    if (prefix === null) return [];
    const rest = segments.slice(star + 1);
    return Array.from(this.index.children(prefix)).flatMap(c => this.at(this.index.path(c), ...rest));
  }

  childrenAt(base: string | undefined, ...segments: string[]): NodeId[] {
    return this.at(base, ...segments).flatMap(id => Array.from(this.index.children(id)));
  }

  descendants(root: NodeId, pred: (id: NodeId) => boolean): NodeId[] {
    const out: NodeId[] = [];
    this.index.forEachDescendant(root, i => {
      if (pred(i)) out.push(i);
    });
    return out;
  }

  olderThan(id: NodeId, days: number): boolean {
    const m = this.index.mtimeOf(id);
    return m > 0 && m < this.env.now - days * DAY;
  }
}

/** Ids das regras conhecidas; título e descrição vêm do catálogo `suggestions` no idioma atual. */
export type SuggestionRuleId = keyof Messages['suggestions'];

export interface SuggestionRule {
  id: SuggestionRuleId;
  icon: string;
  risk: Risk;
  action: 'queue' | 'command';
  platforms?: readonly string[];
  command?: (env: SuggestionEnv) => string;
  collect(ctx: RuleContext): NodeId[];
}

/** Pastas onde ficam instalações do Node/npm — nunca sugerir os node_modules de dentro delas. */
export const NODE_INSTALL_DIRS = new Set([
  'nvm',
  '.nvm',
  'fnm',
  '.fnm',
  'volta',
  '.volta',
  'nodejs',
  'nvs',
  '.nvs',
  'npm',
  '.npm-global',
  'n',
]);

const INSTALLER_EXT = new Set(['exe', 'msi', 'msix', 'iso', 'dmg', 'pkg', 'deb', 'rpm', 'appimage']);

/** A ordem importa: itens já reivindicados por uma regra anterior não entram nas seguintes. */
export const DEFAULT_RULES: readonly SuggestionRule[] = [
  {
    id: 'temp',
    icon: 'clock',
    risk: 'safe',
    action: 'queue',
    collect: c => [
      ...c.childrenAt(c.env.tmpDir),
      ...c.childrenAt(c.env.winDir, 'Temp'),
      ...(c.env.platform === 'linux' ? [...c.childrenAt('/tmp'), ...c.childrenAt('/var/tmp')] : []),
    ],
  },
  {
    id: 'pnpm-store',
    icon: 'package',
    risk: 'safe',
    action: 'command',
    command: () => 'pnpm store prune',
    collect: c => {
      const { home, localAppData: lad } = c.env;
      const drive = c.env.platform === 'win32' ? path.win32.parse(c.index.rootPath).root : undefined;
      return [
        ...c.at(lad, 'pnpm', 'store'),
        ...c.at(drive || undefined, '.pnpm-store'),
        ...c.at(home, '.pnpm-store'),
        ...c.at(home, 'Library', 'pnpm', 'store'),
        ...c.at(home, '.local', 'share', 'pnpm', 'store'),
      ];
    },
  },
  {
    id: 'package-caches',
    icon: 'package',
    risk: 'safe',
    action: 'queue',
    collect: c => {
      const { home, localAppData: lad } = c.env;
      return [
        ...c.at(lad, 'npm-cache'),
        ...c.at(home, '.npm', '_cacache'),
        ...c.at(lad, 'Yarn', 'Cache'),
        ...c.at(home, 'Library', 'Caches', 'Yarn'),
        ...c.at(home, '.cache', 'yarn'),
        ...c.at(lad, 'pip', 'cache'),
        ...c.at(home, 'Library', 'Caches', 'pip'),
        ...c.at(home, '.cache', 'pip'),
        ...c.at(home, '.cargo', 'registry'),
        ...c.at(home, 'go', 'pkg', 'mod'),
        ...c.at(home, '.m2', 'repository'),
        ...c.at(home, '.gradle', 'caches'),
        ...c.at(home, '.nuget', 'packages'),
        ...c.at(lad, 'NuGet', 'v3-cache'),
      ];
    },
  },
  {
    id: 'dev-builds',
    icon: 'code',
    risk: 'safe',
    action: 'queue',
    platforms: ['darwin'],
    collect: c => [
      ...c.at(c.env.home, 'Library', 'Developer', 'Xcode', 'DerivedData'),
      ...c.at(c.env.home, 'Library', 'Developer', 'CoreSimulator', 'Caches'),
    ],
  },
  {
    id: 'node-modules',
    icon: 'code',
    risk: 'review',
    action: 'queue',
    collect: c =>
      c.descendants(0, i => {
        if (!c.index.isDir(i) || c.index.name(i) !== 'node_modules') return false;
        const parent = c.index.parentOf(i);
        if (parent === null) return false;
        // Ignora node_modules aninhados e os de instalações do Node (nvm, fnm, volta, npm global…):
        // apagá-los quebra o Node, e não há "npm install" que os recrie.
        for (let p: number | null = parent; p !== null; p = c.index.parentOf(p)) {
          const name = c.index.name(p).toLowerCase();
          if (name === 'node_modules' || NODE_INSTALL_DIRS.has(name)) return false;
        }
        const siblings = Array.from(c.index.children(parent)).filter(s => s !== i);
        // Só é projeto se a pasta tiver package.json.
        const isProject = siblings.some(s => !c.index.isDir(s) && c.index.name(s).toLowerCase() === 'package.json');
        return isProject && siblings.every(s => c.olderThan(s, 90));
      }),
  },
  {
    id: 'installers',
    icon: 'download',
    risk: 'review',
    action: 'queue',
    collect: c =>
      c
        .at(c.env.home, 'Downloads')
        .flatMap(dl =>
          c.descendants(
            dl,
            i => !c.index.isDir(i) && INSTALLER_EXT.has(extensionOf(c.index.name(i))) && c.olderThan(i, 180),
          ),
        ),
  },
  {
    id: 'crash-dumps',
    icon: 'alert',
    risk: 'safe',
    action: 'queue',
    collect: c => [
      ...c.at(c.env.localAppData, 'CrashDumps'),
      ...c.at(c.env.home, 'Library', 'Logs', 'DiagnosticReports'),
      ...(c.env.platform === 'linux' ? c.childrenAt('/var/crash') : []),
      ...c.descendants(0, i => !c.index.isDir(i) && extensionOf(c.index.name(i)) === 'dmp'),
    ],
  },
  {
    id: 'browser-caches',
    icon: 'zap',
    risk: 'safe',
    action: 'queue',
    collect: c => {
      const { home, localAppData: lad } = c.env;
      const chromium = [
        ['Google', 'Chrome'],
        ['Microsoft', 'Edge'],
        ['BraveSoftware', 'Brave-Browser'],
      ];
      return [
        ...chromium.flatMap(([v, b]) =>
          ['Cache', 'Code Cache', 'GPUCache'].flatMap(k => c.at(lad, v as string, b as string, 'User Data', '*', k)),
        ),
        ...c.at(lad, 'Mozilla', 'Firefox', 'Profiles', '*', 'cache2'),
        ...['Google', 'Microsoft Edge', 'BraveSoftware', 'Firefox'].flatMap(v => c.at(home, 'Library', 'Caches', v)),
        ...['google-chrome', 'chromium', 'microsoft-edge', 'BraveSoftware', 'mozilla'].flatMap(v =>
          c.at(home, '.cache', v),
        ),
      ];
    },
  },
  {
    id: 'user-caches',
    icon: 'layers',
    risk: 'review',
    action: 'queue',
    platforms: ['darwin', 'linux'],
    collect: c => [...c.childrenAt(c.env.home, 'Library', 'Caches'), ...c.childrenAt(c.env.home, '.cache')],
  },
  {
    id: 'windows-update',
    icon: 'refresh',
    risk: 'review',
    action: 'queue',
    platforms: ['win32'],
    collect: c => c.childrenAt(c.env.winDir, 'SoftwareDistribution', 'Download'),
  },
  {
    id: 'trash',
    icon: 'trash',
    risk: 'safe',
    action: 'command',
    command: env =>
      env.platform === 'win32'
        ? 'PowerShell: Clear-RecycleBin -Force'
        : env.platform === 'darwin'
          ? msg().suggestions.trash.finderCommand
          : 'gio trash --empty',
    collect: c => [
      ...c.at(c.env.systemDrive ? `${c.env.systemDrive}\\` : undefined, '$Recycle.Bin'),
      ...c.at(c.env.home, '.Trash'),
      ...c.at(c.env.home, '.local', 'share', 'Trash'),
    ],
  },
  {
    id: 'hibernation',
    icon: 'moon',
    risk: 'advanced',
    action: 'command',
    platforms: ['win32'],
    command: () => 'powercfg /hibernate off',
    collect: c => c.at(c.env.systemDrive ? `${c.env.systemDrive}\\` : undefined, 'hiberfil.sys'),
  },
];
