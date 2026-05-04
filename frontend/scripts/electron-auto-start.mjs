import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const forceBuild = process.env.LOCAL_VN_RP_FRONTEND_BUILD_ON_START === "1";
const hasBuiltElectron = existsSync(join(process.cwd(), "dist-electron", "main.js"));
const hasBuiltRenderer = existsSync(join(process.cwd(), "dist", "index.html"));
const script = forceBuild || !hasBuiltElectron || !hasBuiltRenderer
  ? "electron:start"
  : "electron:run";

const npmArgs = ["run", script, "--", ...process.argv.slice(2)];

// Windows Node.js rejects direct spawn/spawnSync of .cmd shims such as
// npm.cmd without shell mode. When this script is run by npm, npm exposes the
// JavaScript CLI entrypoint in npm_execpath, so run that through the current
// node executable instead of spawning npm.cmd.
const npmExecPath = process.env.npm_execpath;
const command = process.platform === "win32" && npmExecPath
  ? process.execPath
  : process.platform === "win32"
    ? process.env.ComSpec ?? "cmd.exe"
    : "npm";
const args = process.platform === "win32" && npmExecPath
  ? [npmExecPath, ...npmArgs]
  : process.platform === "win32"
    ? ["/d", "/s", "/c", "npm", ...npmArgs]
    : npmArgs;

const result = spawnSync(command, args, { stdio: "inherit" });

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
