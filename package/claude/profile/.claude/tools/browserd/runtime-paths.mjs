import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(scriptDir, "..", "..");
export const runtimeDir = path.join(rootDir, "browser-runtime");
export const artifactsDir = path.join(runtimeDir, "artifacts");
export const statePath = path.join(runtimeDir, "state.json");
export const logPath = path.join(runtimeDir, "server.log");
export const startupErrorPath = path.join(runtimeDir, "startup-error.json");

export function getChromeExecutablePath() {
  if (process.env.BROWSERCTL_CHROME_PATH) {
    return process.env.BROWSERCTL_CHROME_PATH;
  }

  return null;
}

export function getChromeLaunchConfig() {
  const explicitPath = getChromeExecutablePath();
  if (explicitPath) {
    return {
      launchOptions: { executablePath: explicitPath },
      chromeExecutablePath: explicitPath
    };
  }

  if (process.env.BROWSERCTL_USE_SYSTEM_CHROME !== "1") {
    return {
      launchOptions: {},
      chromeExecutablePath: null
    };
  }

  const candidates = [
    { channel: "chrome", path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
    { channel: "msedge", path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" },
    { channel: "chromium", path: "/Applications/Chromium.app/Contents/MacOS/Chromium" }
  ];
  const matched = candidates.find((candidate) => fs.existsSync(candidate.path));
  if (matched) {
    return {
      launchOptions: { channel: matched.channel },
      chromeExecutablePath: matched.path
    };
  }

  return {
    launchOptions: {},
    chromeExecutablePath: null
  };
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
