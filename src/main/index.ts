import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, session, shell, utilityProcess } from 'electron';
import type { EngineMessage } from '../engine/protocol';
import { ENGINE_CHOICES, parseEngineChoice } from '@shared/engineChoice';
import { getLocale, resolveLocale, setLocale } from '@shared/i18n';
import { EngineClient, type EngineProcess } from './EngineClient';
import { FileActions } from './FileActions';
import { configureEngine, registerIpc } from './ipc';
import { createFileLogger } from './logger';
import { createSettingsStore } from './stores';
import { createMainWindow } from './window';

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererUrl = process.env.ELECTRON_RENDERER_URL;

// Testes E2E usam um diretório de dados isolado.
if (process.env.TIDYSPACE_USER_DATA) app.setPath('userData', process.env.TIDYSPACE_USER_DATA);

/**
 * Motor de varredura: `--engine=auto|native|node` na linha de comando (ou `TIDYSPACE_ENGINE`).
 * Ex.: `TidySpace.exe --engine=node`, ou em desenvolvimento `npm run dev -- -- --engine=node`.
 */
const engineArg = app.commandLine.getSwitchValue('engine') || process.env.TIDYSPACE_ENGINE;
const engineChoice = parseEngineChoice(engineArg);
if (!engineChoice)
  console.error(`[tidyspace] --engine=${engineArg} inválido (use ${ENGINE_CHOICES.join(', ')}); usando auto`);

if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow: BrowserWindow | null = null;

function nativeSearchDirs(): string[] {
  return app.isPackaged
    ? [path.join(process.resourcesPath, 'native')]
    : [path.join(app.getAppPath(), 'src', 'native', 'node', 'dist')];
}

function spawnEngine(dataDir: string): EngineProcess {
  const child = utilityProcess.fork(path.join(here, 'engine.js'), [], {
    serviceName: 'TidySpace Engine',
    env: {
      ...process.env,
      TIDYSPACE_NATIVE_DIRS: nativeSearchDirs().join(path.delimiter),
      TIDYSPACE_DATA_DIR: dataDir,
      TIDYSPACE_ENGINE: engineChoice ?? 'auto',
      TIDYSPACE_LOCALE: getLocale(),
    },
    stdio: 'inherit',
  });
  return {
    postMessage: m => child.postMessage(m),
    onMessage: cb => child.on('message', (m: EngineMessage) => cb(m)),
    onExit: cb => child.on('exit', cb),
    kill: () => void child.kill(),
  };
}

/** CSP estrita em produção (em dev o Vite precisa de scripts inline para o HMR). */
function applyContentSecurityPolicy(): void {
  if (rendererUrl) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'",
        ],
      },
    });
  });
}

async function bootstrap(): Promise<void> {
  const userData = app.getPath('userData');
  const settings = createSettingsStore(path.join(userData, 'settings.json'), process.platform);
  const systemLanguages = app.getPreferredSystemLanguages();
  setLocale(resolveLocale((await settings.read()).language, systemLanguages));

  const engine: EngineClient = new EngineClient({
    spawn: () => spawnEngine(userData),
    // Também reenviado após um reinício do processo engine.
    onStart: () =>
      void configureEngine(engine, settings, systemLanguages).catch(err => console.error('[engine] configure', err)),
    onCrash: code => console.error(`[engine] processo encerrou com código ${code}; reiniciando`),
  });
  engine.start();
  app.on('before-quit', () => engine.stop());

  const log = createFileLogger(path.join(userData, 'logs'));
  log(`TidySpace ${app.getVersion()} iniciado (${process.platform} ${process.arch})`);
  // Só em testes E2E: simula uma Lixeira lenta (pastas com muitos arquivos).
  const trashDelay = Number(process.env.TIDYSPACE_TEST_TRASH_DELAY_MS ?? 0);
  const files = new FileActions({
    engine,
    log,
    trashItem: async p => {
      if (trashDelay > 0) await new Promise(r => setTimeout(r, trashDelay));
      await shell.trashItem(p);
    },
    removePermanently: p => rm(p, { recursive: true, force: false }),
    getSettings: () => settings.read(),
    safety: {
      platform: process.platform,
      home: os.homedir(),
      winDir: process.env.WINDIR,
      systemDrive: process.env.SystemDrive,
    },
  });

  applyContentSecurityPolicy();
  registerIpc({
    ipcMain,
    window: () => mainWindow,
    engine,
    files,
    settings,
    version: app.getVersion(),
    systemLanguages,
  });

  const open = () => {
    mainWindow = createMainWindow({
      preload: path.join(here, '../preload/index.cjs'),
      rendererUrl,
      rendererFile: path.join(here, '../renderer/index.html'),
    });
    mainWindow.on('closed', () => (mainWindow = null));
  };
  open();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && open());
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app
  .whenReady()
  .then(bootstrap)
  .catch(err => {
    console.error('[main] falha ao iniciar', err);
    app.exit(1);
  });
