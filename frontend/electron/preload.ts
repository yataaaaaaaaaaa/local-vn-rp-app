import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("launcher", {
  getArgs: () => ipcRenderer.invoke("launcher:getArgs")
});

contextBridge.exposeInMainWorld("appPersistence", {
  readText: (path: string, fallback: string | null = null) => ipcRenderer.invoke("persistence:readText", path, fallback),
  writeText: (path: string, value: string) => ipcRenderer.invoke("persistence:writeText", path, value),
  readJson: <T>(path: string, fallback: T) => ipcRenderer.invoke("persistence:readJson", path, fallback),
  writeJson: (path: string, value: unknown) => ipcRenderer.invoke("persistence:writeJson", path, value),
  exists: (path: string) => ipcRenderer.invoke("persistence:exists", path),
  remove: (path: string) => ipcRenderer.invoke("persistence:remove", path),
  ensureDir: (path: string) => ipcRenderer.invoke("persistence:ensureDir", path),
  showItem: (path: string) => ipcRenderer.invoke("shell:showItem", path)
});


contextBridge.exposeInMainWorld("nativeDialogs", {
  pickFile: (options: { title?: string; defaultPath?: string; filters?: Electron.FileFilter[] } = {}) => ipcRenderer.invoke("dialog:pickFile", options),
  pickFiles: (options: { title?: string; defaultPath?: string; filters?: Electron.FileFilter[] } = {}) => ipcRenderer.invoke("dialog:pickFiles", options),
  pickFolder: (options: { title?: string; defaultPath?: string } = {}) => ipcRenderer.invoke("dialog:pickFolder", options)
});
