import path from 'node:path';
import { msg } from '@shared/i18n';

export interface SafetyEnv {
  platform: string;
  home: string;
  winDir?: string;
  systemDrive?: string;
}

export type SafetyVerdict = { ok: true } | { ok: false; reason: string };

interface Policy {
  /** Não pode apagar nada dentro destes caminhos… */
  protectedTrees: string[];
  /** …exceto dentro destes. */
  allowedInside: string[];
  /** Arquivos específicos que nunca devem ser apagados. */
  protectedFiles: string[];
}

function policyFor(env: SafetyEnv): Policy {
  if (env.platform === 'win32') {
    const drive = (env.systemDrive ?? 'C:').replace(/[\\/]+$/, '');
    const win = env.winDir ?? `${drive}\\Windows`;
    return {
      protectedTrees: [
        win,
        `${drive}\\Program Files`,
        `${drive}\\Program Files (x86)`,
        `${drive}\\$Recycle.Bin`,
        `${drive}\\System Volume Information`,
        `${drive}\\Recovery`,
        `${drive}\\Boot`,
      ],
      allowedInside: [`${win}\\Temp`, `${win}\\SoftwareDistribution\\Download`],
      protectedFiles: ['pagefile.sys', 'hiberfil.sys', 'swapfile.sys', 'bootmgr', 'DumpStack.log.tmp'].map(
        f => `${drive}\\${f}`,
      ),
    };
  }
  if (env.platform === 'darwin') {
    return {
      protectedTrees: ['/System', '/bin', '/sbin', '/usr', '/private', '/Library', '/dev', '/cores', '/Volumes'],
      allowedInside: ['/private/tmp', '/private/var/folders', '/Library/Caches', '/usr/local', '/Volumes/*'],
      protectedFiles: [],
    };
  }
  return {
    protectedTrees: [
      '/bin',
      '/sbin',
      '/lib',
      '/lib32',
      '/lib64',
      '/usr',
      '/etc',
      '/boot',
      '/proc',
      '/sys',
      '/dev',
      '/run',
      '/var',
      '/snap',
      '/srv',
      '/root',
    ],
    allowedInside: ['/var/tmp', '/var/cache', '/var/crash', '/usr/local'],
    protectedFiles: ['/swapfile', '/swap.img'],
  };
}

/**
 * Última barreira antes de apagar algo: recusa raízes de volume, a pasta do usuário e seus
 * ancestrais, e árvores do sistema operacional (com algumas exceções seguras, como Temp).
 * Vale para Lixeira e exclusão definitiva.
 */
export function checkDeletable(target: string, env: SafetyEnv): SafetyVerdict {
  const p = env.platform === 'win32' ? path.win32 : path.posix;
  const ci = env.platform === 'win32' || env.platform === 'darwin';
  const norm = (s: string) => {
    const n = p.normalize(s).replace(/[\\/]+$/, '');
    return ci ? n.toLowerCase() : n;
  };
  const why = msg().main.safety;
  if (!p.isAbsolute(target)) return { ok: false, reason: why.relativePath };
  const t = norm(target);
  const sep = env.platform === 'win32' ? '\\' : '/';
  const inside = (child: string, parent: string) => {
    if (parent.endsWith('/*')) {
      const base = parent.slice(0, -2);
      return child.startsWith(`${base}${sep}`) && child.slice(base.length + 1).includes(sep);
    }
    return child === parent || child.startsWith(`${parent}${sep}`);
  };

  const root = norm(p.parse(target).root);
  if (t === root || t === '') return { ok: false, reason: why.volumeRoot };
  if (env.platform === 'darwin' && /^\/volumes\/[^/]+$/.test(t)) return { ok: false, reason: why.volumeRoot };

  const home = norm(env.home);
  if (inside(home, t)) return { ok: false, reason: why.homeOrAncestor };

  const policy = policyFor(env);
  if (policy.protectedFiles.map(norm).includes(t)) return { ok: false, reason: why.systemFile };
  const allowed = policy.allowedInside.map(a => (a.endsWith('/*') ? `${norm(a.slice(0, -2))}/*` : norm(a)));
  for (const tree of policy.protectedTrees.map(norm)) {
    if (inside(t, tree) && !allowed.some(a => (a.endsWith('/*') ? inside(t, a) : t !== a && inside(t, a)))) {
      return { ok: false, reason: why.systemFolder };
    }
    if (inside(tree, t)) return { ok: false, reason: why.containsSystemFolder };
  }
  return { ok: true };
}
