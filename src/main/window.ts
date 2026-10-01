import path from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { IPC } from '@shared/ipc';

export interface WindowOptions {
  preload: string;
  rendererUrl?: string;
  rendererFile: string;
}

/**
 * Janela principal sem moldura (titlebar própria). No macOS mantém os "semáforos" nativos.
 * Segurança: sandbox, contextIsolation, sem nodeIntegration, navegação externa bloqueada.
 */
export function createMainWindow(opts: WindowOptions): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#05070c',
    title: 'TidySpace',
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } } : { frame: false }),
    webPreferences: {
      preload: opts.preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => win.webContents.send(IPC.windowMaximized, true));
  win.on('unmaximize', () => win.webContents.send(IPC.windowMaximized, false));

  // Links externos abrem no navegador; a janela nunca navega para fora do app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (opts.rendererUrl && url.startsWith(opts.rendererUrl)) return;
    event.preventDefault();
  });

  if (opts.rendererUrl) void win.loadURL(opts.rendererUrl);
  else void win.loadFile(path.resolve(opts.rendererFile));
  return win;
}
