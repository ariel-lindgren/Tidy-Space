import { describe, expect, it } from 'vitest';
import { checkDeletable, type SafetyEnv } from './safety';

const win: SafetyEnv = { platform: 'win32', home: 'C:\\Users\\ana', winDir: 'C:\\Windows', systemDrive: 'C:' };
const mac: SafetyEnv = { platform: 'darwin', home: '/Users/ana' };
const linux: SafetyEnv = { platform: 'linux', home: '/home/ana' };

const ok = (p: string, env: SafetyEnv) => checkDeletable(p, env).ok;

describe('checkDeletable', () => {
  it('Windows: bloqueia raiz, sistema, perfil e arquivos essenciais', () => {
    expect(ok('C:\\', win)).toBe(false);
    expect(ok('D:\\', win)).toBe(false);
    expect(ok('C:\\Windows', win)).toBe(false);
    expect(ok('c:\\windows\\system32\\drivers', win)).toBe(false);
    expect(ok('C:\\Program Files\\App', win)).toBe(false);
    expect(ok('C:\\Users', win)).toBe(false);
    expect(ok('C:\\Users\\ana', win)).toBe(false);
    expect(ok('C:\\hiberfil.sys', win)).toBe(false);
    expect(ok('relativo\\x', win)).toBe(false);
  });

  it('Windows: permite conteúdo de usuário, Temp e cache do Windows Update', () => {
    expect(ok('C:\\Users\\ana\\Downloads\\x.iso', win)).toBe(true);
    expect(ok('C:\\Windows\\Temp\\a.log', win)).toBe(true);
    expect(ok('C:\\Windows\\Temp', win)).toBe(false);
    expect(ok('C:\\Windows\\SoftwareDistribution\\Download\\abc', win)).toBe(true);
    expect(ok('D:\\Jogos\\Velho', win)).toBe(true);
  });

  it('macOS: protege sistema e raízes de volume, permite caches e apps', () => {
    expect(ok('/', mac)).toBe(false);
    expect(ok('/System/Library', mac)).toBe(false);
    expect(ok('/Volumes/Backup', mac)).toBe(false);
    expect(ok('/Volumes/Backup/antigo.zip', mac)).toBe(true);
    expect(ok('/Library/Caches/com.apple.x', mac)).toBe(true);
    expect(ok('/Users/ana/Library/Caches/pip', mac)).toBe(true);
    expect(ok('/Applications/App Velho.app', mac)).toBe(true);
    expect(ok('/Users', mac)).toBe(false);
  });

  it('Linux: protege árvores do sistema, permite /var/cache e /tmp', () => {
    expect(ok('/etc/hosts', linux)).toBe(false);
    expect(ok('/var/lib/docker', linux)).toBe(false);
    expect(ok('/var/cache/apt/archives/x.deb', linux)).toBe(true);
    expect(ok('/tmp/x', linux)).toBe(true);
    expect(ok('/home', linux)).toBe(false);
    expect(ok('/home/ana/.cache/pip', linux)).toBe(true);
    expect(ok('/swapfile', linux)).toBe(false);
    expect(ok('/mnt/dados/filmes', linux)).toBe(true);
  });

  it('explica o motivo da recusa', () => {
    expect(checkDeletable('/usr', linux)).toEqual({ ok: false, reason: 'pasta protegida do sistema' });
  });
});
