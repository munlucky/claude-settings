import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(scriptDir, "..", "..");
export const runtimeDir = path.join(rootDir, "browser-runtime");
export const artifactsDir = path.join(runtimeDir, "artifacts");
export const statePath = path.join(runtimeDir, "state.json");
export const logPath = path.join(runtimeDir, "server.log");

export function getChromeExecutablePath() {
  return process.env.BROWSERCTL_CHROME_PATH || null;
}

export function getHost() {
  return "127.0.0.1";
}

export function getDefaultPort() {
  return 0;
}

export function getIdleTimeoutMs() {
  return Number(process.env.BROWSERCTL_IDLE_TIMEOUT_MS ?? 15 * 60 * 1000);
}

export function getMetadataBase() {
  return {
    host: getHost(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    user: os.userInfo().username
  };
}
