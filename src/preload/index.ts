import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC, type TidySpaceApi } from '@shared/ipc';

/** Assinatura de evento main → renderer que devolve a função de cancelamento. */
function subscribe<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const handler = (_e: unknown, payload: T) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => void ipcRenderer.removeListener(channel, handler);
  };
}

const api: TidySpaceApi = {
  app: { info: () => ipcRenderer.invoke(IPC.appInfo) },
  query: (method, ...params) => ipcRenderer.invoke(IPC.query, method, params),
  scan: {
    start: path => ipcRenderer.invoke(IPC.scanStart, path),
    cancel: () => ipcRenderer.invoke(IPC.scanCancel),
    onProgress: subscribe(IPC.scanProgress),
    onDone: subscribe(IPC.scanDone),
    onError: subscribe(IPC.scanError),
  },
  files: {
    trash: ids => ipcRenderer.invoke(IPC.filesTrash, ids),
    deletePermanently: ids => ipcRenderer.invoke(IPC.filesDelete, ids),
    reveal: id => ipcRenderer.invoke(IPC.filesReveal, id),
    open: id => ipcRenderer.invoke(IPC.filesOpen, id),
  },
  dialog: { pickFolder: () => ipcRenderer.invoke(IPC.pickFolder) },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: patch => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  },
  scans: {
    open: id => ipcRenderer.invoke(IPC.scansOpen, id),
    delete: id => ipcRenderer.invoke(IPC.scansDelete, id),
    deleteAll: () => ipcRenderer.invoke(IPC.scansDeleteAll),
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
    onMaximizedChange: subscribe(IPC.windowMaximized),
  },
  pathForFile: file => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('tidyspace', api);
