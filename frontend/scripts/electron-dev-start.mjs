import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import http from "node:http";
import { join } from "node:path";

const frontendRoot = process.cwd();
const rendererHost = process.env.LOCAL_VN_RP_VITE_HOST || "127.0.0.1";
const rendererPort = process.env.LOCAL_VN_RP_VITE_PORT || "5173";
const rendererUrl = process.env.LOCAL_VN_RP_VITE_DEV_SERVER_URL || `http://${rendererHost}:${rendererPort}/`;
const launcherArgs = process.argv.slice(2);
const mainOutput = join(frontendRoot, "dist-electron", "main.js");
const preloadOutput = join(frontendRoot, "dist-electron", "preload.js");
const children = new Set();
let electronProcess = null;
let restartTimer = null;
let shuttingDown = false;

function npmCommand(npmArgs) {
  const npmExecPath = process.env.npm_execpath;
  if (process.platform === "win32" && npmExecPath) {
    return { command: process.execPath, args: [npmExecPath, ...npmArgs] };
  }
  if (process.platform === "win32") {
    return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm", ...npmArgs] };
  }
  return { command: "npm", args: npmArgs };
}

function spawnLogged(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: frontendRoot,
    stdio: "inherit",
    windowsHide: false,
    ...options,
  });
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown && code !== 0 && signal === null) {
      console.error(`[frontend-dev] ${label} exited with code ${code}`);
    }
  });
  child.on("error", (error) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`[frontend-dev] failed to start ${label}:`, error);
    }
  });
  return child;
}

function spawnNpm(label, npmArgs, options = {}) {
  const { command, args } = npmCommand(npmArgs);
  return spawnLogged(label, command, args, options);
}

function waitForRenderer() {
  return new Promise((resolve) => {
    const check = () => {
      const request = http.get(rendererUrl, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => setTimeout(check, 250));
      request.setTimeout(1000, () => {
        request.destroy();
        setTimeout(check, 250);
      });
    };
    check();
  });
}

function waitForElectronBuild() {
  return new Promise((resolve) => {
    const check = () => {
      if (existsSync(mainOutput) && existsSync(preloadOutput)) {
        resolve();
      } else {
        setTimeout(check, 250);
      }
    };
    check();
  });
}

function startElectron() {
  if (shuttingDown) return;
  if (electronProcess && electronProcess.exitCode === null) {
    electronProcess.kill();
  }
  console.log("[frontend-dev] starting Electron against Vite dev server");
  electronProcess = spawnNpm("electron", ["exec", "--", "electron", "dist-electron/main.js", ...launcherArgs], {
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: rendererUrl,
      LOCAL_VN_RP_FRONTEND_DEV: "1",
    },
  });
}

function scheduleElectronRestart() {
  if (shuttingDown) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    console.log("[frontend-dev] Electron main/preload changed; restarting Electron");
    startElectron();
  }, 300);
}

function terminateChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (restartTimer) clearTimeout(restartTimer);
  for (const child of Array.from(children)) {
    terminateChild(child);
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(143);
});
process.on("exit", shutdown);

console.log(`[frontend-dev] Vite renderer URL: ${rendererUrl}`);
const vite = spawnNpm("vite", ["run", "dev", "--", "--host", rendererHost, "--port", rendererPort, "--strictPort"]);
const tsc = spawnNpm("tsc-watch", ["exec", "--", "tsc", "-p", "tsconfig.electron.json", "--watch", "--preserveWatchOutput"]);

await Promise.all([waitForRenderer(), waitForElectronBuild()]);
startElectron();

watch(join(frontendRoot, "dist-electron"), { persistent: true }, (_eventType, filename) => {
  if (filename === "main.js" || filename === "preload.js") {
    scheduleElectronRestart();
  }
});

await new Promise((resolve) => {
  vite.on("exit", resolve);
  tsc.on("exit", resolve);
});
shutdown();
