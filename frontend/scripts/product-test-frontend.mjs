#!/usr/bin/env node

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setInterval, clearInterval } from "node:timers";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map((arg) => {
      const withoutPrefix = arg.slice(2);
      const separator = withoutPrefix.indexOf("=");
      return [withoutPrefix.slice(0, separator), withoutPrefix.slice(separator + 1)];
    })
);

const requiredArgs = [
  "backend",
  "backend-host",
  "backend-port",
  "app-root",
  "story-root",
  "output-root"
];
const missingArgs = requiredArgs.filter((key) => !args[key]);
if (missingArgs.length > 0) {
  console.error(`Missing launcher argument(s): ${missingArgs.join(", ")}`);
  process.exit(2);
}

const readyFile = process.env.LOCAL_VN_RP_FRONTEND_READY_FILE;
if (readyFile) {
  const readyFilePath = resolve(readyFile);
  mkdirSync(dirname(readyFilePath), { recursive: true });
  writeFileSync(
    readyFilePath,
    JSON.stringify(
      {
        ready: true,
        mode: "product-test",
        pid: process.pid,
        args,
        startedAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );
}

console.log("Local VN/RP frontend product-test mode is ready.");

const keepAlive = setInterval(() => undefined, 60_000);

function shutdown(signal) {
  clearInterval(keepAlive);
  if (readyFile) {
    try { rmSync(resolve(readyFile), { force: true }); } catch { /* Best effort cleanup. */ }
  }
  console.log(`Local VN/RP frontend product-test mode received ${signal}; exiting.`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
