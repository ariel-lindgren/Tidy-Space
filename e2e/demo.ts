import { execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, truncateSync, utimesSync } from 'node:fs';
import path from 'node:path';

/**
 * Pasta pessoal fictícia para os prints do README: nomes e tamanhos realistas, nenhum dado real.
 * No Windows os arquivos são esparsos (tamanho lógico de GBs ocupando ~0 no disco), então os
 * prints usam a medida "tamanho lógico".
 */
const GB = 1024 ** 3;
const MB = 1024 ** 2;
const DAY = 86_400_000;

interface DemoFile {
  path: string;
  size: number;
  /** Idade em dias (data de modificação). */
  age?: number;
}

function* demoFiles(): Generator<DemoFile> {
  yield { path: 'Videos/Japan trip 2024.mp4', size: 6.4 * GB, age: 210 };
  yield { path: 'Videos/Wedding highlights.mov', size: 3.2 * GB, age: 640 };
  yield { path: 'Videos/Drone/DJI_0042.mp4', size: 2.6 * GB, age: 95 };
  yield { path: 'Videos/Drone/DJI_0043.mp4', size: 1.9 * GB, age: 95 };
  yield { path: 'Videos/Screen recordings/demo-sprint-14.mkv', size: 820 * MB, age: 12 };
  for (let i = 1; i <= 140; i++) {
    const year = 2021 + (i % 4);
    yield { path: `Pictures/${year}/IMG_${String(4000 + i)}.jpg`, size: (3 + (i % 7)) * MB, age: 30 + i * 9 };
  }
  for (let i = 1; i <= 12; i++) yield { path: `Pictures/RAW/DSC0${100 + i}.ARW`, size: 48 * MB, age: 300 };
  for (let i = 1; i <= 24; i++)
    yield { path: `Music/Lossless/Track ${String(i).padStart(2, '0')}.flac`, size: 34 * MB };
  yield { path: 'Documents/Thesis final v7.docx', size: 18 * MB, age: 400 };
  yield { path: 'Documents/Taxes/2025 return.pdf', size: 4 * MB, age: 150 };
  yield { path: 'Documents/Scans/contract-signed.pdf', size: 9 * MB, age: 60 };
  yield { path: 'Documents/Budget.xlsx', size: 2 * MB, age: 3 };
  yield { path: 'VirtualBox VMs/dev-ubuntu/dev-ubuntu.vdi', size: 21 * GB, age: 45 };
  yield { path: 'Downloads/ubuntu-24.04-desktop-amd64.iso', size: 5.9 * GB, age: 320 };
  yield { path: 'Downloads/node-v20-x64.msi', size: 28 * MB, age: 410 };
  yield { path: 'Downloads/GameSetup.exe', size: 1.4 * GB, age: 260 };
  yield { path: 'Downloads/photos-backup.zip', size: 2.2 * GB, age: 90 };
  yield { path: 'Downloads/invoice-0915.pdf', size: 1 * MB, age: 15 };
  yield* project('Projects/web-app', 4, 120, 0.9 * GB);
  yield* project('Projects/api-server', 220, 80, 0.6 * GB);
  yield* project('Projects/old-prototype', 500, 60, 0.45 * GB);
  yield { path: 'Projects/ml-experiments/data/train.parquet', size: 3.8 * GB, age: 70 };
  yield { path: 'Projects/ml-experiments/data/validation.parquet', size: 0.9 * GB, age: 70 };
  yield { path: 'Projects/ml-experiments/models/checkpoint-12000.pt', size: 2.1 * GB, age: 40 };
  for (let i = 1; i <= 30; i++) yield { path: `AppData/Local/Temp/tmp${1000 + i}.tmp`, size: 40 * MB };
  for (let i = 1; i <= 40; i++) yield { path: `AppData/Local/npm-cache/_cacache/content/${i}.tgz`, size: 22 * MB };
  for (let i = 1; i <= 25; i++) {
    yield { path: `AppData/Local/Google/Chrome/User Data/Default/Cache/data_${i}`, size: 36 * MB };
  }
}

/** Projeto Node: código, package.json e um node_modules com muitos arquivos pequenos. */
function* project(root: string, age: number, packages: number, total: number): Generator<DemoFile> {
  yield { path: `${root}/package.json`, size: 2_000, age };
  yield { path: `${root}/src/index.ts`, size: 40_000, age };
  yield { path: `${root}/src/app.tsx`, size: 120_000, age };
  const perFile = total / (packages * 6);
  for (let p = 0; p < packages; p++) {
    for (let f = 0; f < 6; f++) yield { path: `${root}/node_modules/pkg-${p}/dist/file${f}.js`, size: perFile, age };
  }
}

/**
 * Cria a pasta fictícia em `base` (ex.: `<tmp>/Users/ana`). Pastas recebem a data do conteúdo
 * mais recente, como aconteceria num disco de verdade.
 */
export function createDemoHome(base: string): void {
  const sparse = process.platform === 'win32';
  const now = Date.now();
  const dirTimes = new Map<string, number>();
  for (const f of demoFiles()) {
    const full = path.join(base, ...f.path.split('/'));
    mkdirSync(path.dirname(full), { recursive: true });
    closeSync(openSync(full, 'w'));
    if (sparse) execFileSync('fsutil', ['sparse', 'setflag', full], { stdio: 'ignore' });
    truncateSync(full, Math.round(f.size));
    const when = new Date(now - (f.age ?? 1) * DAY);
    utimesSync(full, when, when);
    for (let d = path.dirname(full); d.startsWith(base) && d !== base; d = path.dirname(d)) {
      dirTimes.set(d, Math.max(dirTimes.get(d) ?? 0, when.getTime()));
    }
  }
  // Das mais profundas para as mais rasas: criar/alterar filhos não muda mais a data da pasta.
  for (const [dir, time] of [...dirTimes].sort((a, b) => b[0].length - a[0].length)) {
    utimesSync(dir, new Date(time), new Date(time));
  }
}

/** Windows: monta `dir` numa letra de unidade livre (`subst`), para os prints não mostrarem o caminho real. */
export function mountDrive(dir: string): { root: string; unmount(): void } {
  for (const letter of ['T', 'S', 'R', 'Q', 'P']) {
    try {
      execFileSync('subst', [`${letter}:`, dir], { stdio: 'ignore' });
      return {
        root: `${letter}:\\`,
        unmount: () => execFileSync('subst', [`${letter}:`, '/D'], { stdio: 'ignore' }),
      };
    } catch {
      /* letra em uso: tenta a próxima */
    }
  }
  throw new Error('nenhuma letra de unidade livre para o subst');
}
