import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const forceBuild = process.env.LOCAL_VN_RP_FRONTEND_BUILD_ON_START === "1";
const hasBuiltElectron = existsSync(join(process.cwd(), "dist-electron", "main.js"));
const hasBuiltRenderer = existsSync(join(process.cwd(), "dist", "index.html"));
const script = forceBuild || !hasBuiltElectron || !hasBuiltRenderer
  ? "electron:start"
  : "electron:run";

const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", script, "--", ...process.argv.slice(2)],
  { stdio: "inherit" }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
