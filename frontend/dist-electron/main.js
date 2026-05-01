import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
const launcherArgs = parseLauncherArgs(process.argv.slice(1));
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;
const currentDir = dirname(fileURLToPath(import.meta.url));
function parseLauncherArgs(argv) {
    const map = new Map();
    for (const arg of argv) {
        if (!arg.startsWith("--"))
            continue;
        const body = arg.slice(2);
        const equalsIndex = body.indexOf("=");
        if (equalsIndex >= 0) {
            map.set(body.slice(0, equalsIndex), body.slice(equalsIndex + 1));
        }
        else {
            map.set(body, "true");
        }
    }
    const backendHost = map.get("backend-host") ?? "127.0.0.1";
    const backendPort = toNumber(map.get("backend-port"), 17860);
    const backend = map.get("backend") ?? `http://${backendHost}:${backendPort}`;
    const appRoot = requiredArg(map, "app-root", "D:/Anything/storage/local-vn-rp-app-storage");
    const storyRoot = requiredArg(map, "story-root", `${appRoot}/stories`);
    const outputRoot = requiredArg(map, "output-root", `${appRoot}/outputs`);
    return {
        backend,
        backendHost,
        backendPort,
        appRoot,
        storyRoot,
        outputRoot
    };
}
function requiredArg(map, name, fallback) {
    const value = map.get(name) ?? fallback;
    if (!value.trim())
        throw new Error(`Missing required launcher argument --${name}`);
    return value;
}
function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
async function showOpenDialogSafe(window, options) {
    return window
        ? dialog.showOpenDialog(window, options)
        : dialog.showOpenDialog(options);
}
function assertStoragePath(path) {
    if (!path || !isAbsolute(path))
        throw new Error(`Refusing non-absolute path: ${path}`);
    const candidate = normalize(path);
    const roots = [launcherArgs.appRoot, launcherArgs.storyRoot, launcherArgs.outputRoot].map((root) => normalize(root));
    const allowed = roots.some((root) => {
        const rel = relative(root, candidate);
        return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
    });
    if (!allowed)
        throw new Error(`Refusing to access path outside launcher storage roots: ${path}`);
    return candidate;
}
function registerPersistenceIpc() {
    ipcMain.handle("launcher:getArgs", () => launcherArgs);
    ipcMain.handle("persistence:readText", async (_event, path, fallback) => {
        try {
            return await readFile(assertStoragePath(path), "utf8");
        }
        catch (error) {
            if (isMissingFileError(error))
                return fallback;
            throw error;
        }
    });
    ipcMain.handle("persistence:writeText", async (_event, path, value) => {
        const safePath = assertStoragePath(path);
        await mkdir(dirname(safePath), { recursive: true });
        await writeFile(safePath, value, "utf8");
    });
    ipcMain.handle("persistence:readJson", async (_event, path, fallback) => {
        try {
            return JSON.parse(await readFile(assertStoragePath(path), "utf8"));
        }
        catch (error) {
            if (isMissingFileError(error))
                return fallback;
            throw error;
        }
    });
    ipcMain.handle("persistence:writeJson", async (_event, path, value) => {
        const safePath = assertStoragePath(path);
        await mkdir(dirname(safePath), { recursive: true });
        await writeFile(safePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    });
    ipcMain.handle("persistence:exists", async (_event, path) => existsSync(assertStoragePath(path)));
    ipcMain.handle("persistence:remove", async (_event, path) => {
        await rm(assertStoragePath(path), { recursive: true, force: true });
    });
    ipcMain.handle("persistence:ensureDir", async (_event, path) => {
        await mkdir(assertStoragePath(path), { recursive: true });
    });
    ipcMain.handle("shell:showItem", async (_event, path) => {
        shell.showItemInFolder(assertStoragePath(path));
    });
    ipcMain.handle("dialog:pickFile", async (event, options = {}) => {
        const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const result = await showOpenDialogSafe(window, {
            title: options.title,
            defaultPath: options.defaultPath,
            filters: options.filters,
            properties: ["openFile"]
        });
        return result.canceled ? null : result.filePaths[0] ?? null;
    });
    ipcMain.handle("dialog:pickFiles", async (event, options = {}) => {
        const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const result = await showOpenDialogSafe(window, {
            title: options.title,
            defaultPath: options.defaultPath,
            filters: options.filters,
            properties: ["openFile", "multiSelections"]
        });
        return result.canceled ? null : result.filePaths;
    });
    ipcMain.handle("dialog:pickFolder", async (event, options = {}) => {
        const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
        const result = await showOpenDialogSafe(window, {
            title: options.title,
            defaultPath: options.defaultPath,
            properties: ["openDirectory", "createDirectory"]
        });
        return result.canceled ? null : result.filePaths[0] ?? null;
    });
}
function isMissingFileError(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
async function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 1000,
        minWidth: 1100,
        minHeight: 720,
        title: "Local AI Visual Novel",
        backgroundColor: "#121214",
        webPreferences: {
            preload: `${currentDir}/preload.js`,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });
    win.webContents.openDevTools({ mode: "detach" });
    if (isDev && process.env.VITE_DEV_SERVER_URL) {
        await win.loadURL(process.env.VITE_DEV_SERVER_URL);
        win.webContents.openDevTools({ mode: "detach" });
    }
    else {
        await win.loadFile(join(currentDir, "../dist/index.html"));
    }
}
registerPersistenceIpc();
app.whenReady().then(createWindow).catch((error) => {
    console.error(error);
    app.quit();
});
app.on("window-all-closed", () => {
    if (process.platform !== "darwin")
        app.quit();
});
app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0)
        void createWindow();
});
