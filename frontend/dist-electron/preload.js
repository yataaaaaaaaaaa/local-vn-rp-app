import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("launcher", {
    getArgs: () => ipcRenderer.invoke("launcher:getArgs")
});
contextBridge.exposeInMainWorld("appPersistence", {
    readText: (path, fallback = null) => ipcRenderer.invoke("persistence:readText", path, fallback),
    writeText: (path, value) => ipcRenderer.invoke("persistence:writeText", path, value),
    readJson: (path, fallback) => ipcRenderer.invoke("persistence:readJson", path, fallback),
    writeJson: (path, value) => ipcRenderer.invoke("persistence:writeJson", path, value),
    exists: (path) => ipcRenderer.invoke("persistence:exists", path),
    remove: (path) => ipcRenderer.invoke("persistence:remove", path),
    ensureDir: (path) => ipcRenderer.invoke("persistence:ensureDir", path),
    showItem: (path) => ipcRenderer.invoke("shell:showItem", path)
});
contextBridge.exposeInMainWorld("nativeDialogs", {
    pickFile: (options = {}) => ipcRenderer.invoke("dialog:pickFile", options),
    pickFiles: (options = {}) => ipcRenderer.invoke("dialog:pickFiles", options),
    pickFolder: (options = {}) => ipcRenderer.invoke("dialog:pickFolder", options)
});
