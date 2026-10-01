import os from 'node:os';
import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { dialog, shell } from 'electron';
import { IPC, type AppInfo, type EngineQueryName } from '@shared/ipc';
import { nodeIdSchema, nodeIdsSchema, querySchemas, scanIdSchema, scanPathSchema } from '@shared/ipcSchemas';
import { msg, resolveLocale, setLocale } from '@shared/i18n';
import { effectiveExclusions, settingsPatchSchema, type Settings } from '@shared/settings';
import type { EngineClient } from './EngineClient';
import type { FileActions } from './FileActions';
import type { JsonFileStore } from './stores/JsonFileStore';

export interface IpcDeps {
  ipcMain: IpcMain;
  window: () => BrowserWindow | null;
  engine: EngineClient;
  files: FileActions;
  settings: JsonFileStore<Settings>;
  version: string;
  /** Idiomas preferidos do SO (`app.getPreferredSystemLanguages()`). */
  systemLanguages: readonly string[];
}

/**
 * Aplica as configurações que valem fora do renderer: idioma do processo principal e, no engine,
 * idioma, medida usada nas consultas e retenção de análises.
 */
export async function configureEngine(
  engine: EngineClient,
  settings: JsonFileStore<Settings>,
  systemLanguages: readonly string[],
): Promise<void> {
  const s = await settings.read();
  const locale = resolveLocale(s.language, systemLanguages);
  setLocale(locale);
  await engine.call('configure', { measure: s.measure, keepScans: s.keepScans, locale });
}

/**
 * Registra os handlers IPC. Regras: só aceita mensagens da janela principal, valida todo
 * parâmetro com zod e expõe ao renderer apenas consultas somente-leitura do engine.
 */
export function registerIpc(deps: IpcDeps): void {
  const { ipcMain, engine } = deps;
  const platform = process.platform;

  const trusted = (e: IpcMainInvokeEvent | IpcMainEvent) => {
    const win = deps.window();
    return !!win && e.sender === win.webContents;
  };
  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) =>
    ipcMain.handle(channel, (e, ...args) => {
      if (!trusted(e)) throw new Error('origem não autorizada');
      return fn(...(args as A));
    });
  const send = (channel: string, payload: unknown) => deps.window()?.webContents.send(channel, payload);
  const resolveOne = async (id: unknown) => {
    const [node] = await engine.call('resolve', { ids: [nodeIdSchema.parse(id)] });
    if (!node) throw new Error(msg().main.itemNotFound);
    return node;
  };

  handle(IPC.appInfo, async (): Promise<AppInfo> => {
    const info = await engine.call('engineInfo');
    return {
      platform,
      version: deps.version,
      engine: info.engine,
      engineChoice: info.engineChoice,
      nativeError: info.nativeError,
      homeDir: os.homedir(),
    };
  });

  handle(IPC.query, (method: unknown, params: unknown) => {
    if (typeof method !== 'string' || !(method in querySchemas))
      throw new Error(`consulta desconhecida: ${String(method)}`);
    const name = method as EngineQueryName;
    const parsed = querySchemas[name].parse(params ?? []) as never[];
    return (engine.call as (m: EngineQueryName, ...p: never[]) => Promise<unknown>)(name, ...parsed);
  });

  handle(IPC.scanStart, async (rawPath: unknown) => {
    const root = scanPathSchema.parse(rawPath);
    const s = await deps.settings.read();
    await engine.call('startScan', {
      options: {
        root,
        threads: s.threads,
        followSymlinks: s.followSymlinks,
        hardLinks: s.hardLinks,
        oneFilesystem: s.oneFilesystem,
        includeHidden: s.includeHidden,
        excludes: effectiveExclusions(s.exclusions, root, platform),
      },
    });
  });
  handle(IPC.scanCancel, () => engine.call('cancelScan'));

  handle(IPC.scansOpen, (id: unknown) => engine.call('openScan', { id: scanIdSchema.parse(id) }));
  handle(IPC.scansDelete, (id: unknown) => engine.call('deleteScan', { id: scanIdSchema.parse(id) }));
  handle(IPC.scansDeleteAll, () => engine.call('deleteAllScans'));

  handle(IPC.filesTrash, (ids: unknown) => deps.files.trash(nodeIdsSchema.parse(ids)));
  handle(IPC.filesDelete, (ids: unknown) => deps.files.deletePermanently(nodeIdsSchema.parse(ids)));
  handle(IPC.filesReveal, async (id: unknown) => {
    const node = await resolveOne(id);
    shell.showItemInFolder(node.path);
  });
  handle(IPC.filesOpen, async (id: unknown) => {
    const node = await resolveOne(id);
    const error = await shell.openPath(node.path);
    if (error) throw new Error(error);
  });

  handle(IPC.pickFolder, async () => {
    const win = deps.window();
    const opts = { title: msg().main.pickFolderTitle, properties: ['openDirectory' as const] };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });

  handle(IPC.settingsGet, () => deps.settings.read());
  handle(IPC.settingsUpdate, async (patch: unknown) => {
    const valid = settingsPatchSchema.parse(patch);
    const next = await deps.settings.update(current => ({ ...current, ...valid }));
    if (valid.measure !== undefined || valid.keepScans !== undefined || valid.language !== undefined) {
      await configureEngine(engine, deps.settings, deps.systemLanguages);
    }
    return next;
  });

  ipcMain.on(IPC.windowMinimize, e => trusted(e) && deps.window()?.minimize());
  ipcMain.on(IPC.windowToggleMaximize, e => {
    const win = deps.window();
    if (!trusted(e) || !win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on(IPC.windowClose, e => trusted(e) && deps.window()?.close());

  engine.onEvent(event => {
    if (event.type === 'progress') send(IPC.scanProgress, event.progress);
    else if (event.type === 'done') send(IPC.scanDone, event.summary);
    else if (event.type === 'error') send(IPC.scanError, event.message);
  });
}
