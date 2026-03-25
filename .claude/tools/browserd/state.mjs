import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { statePath, runtimeDir, artifactsDir, logPath } from "./runtime-paths.mjs";

export async function ensureRuntimeDirs() {
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });
}

export function nowIso() {
  return new Date().toISOString();
}

export async function readState() {
  try {
    const content = await fs.readFile(statePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function writeState(payload) {
  await ensureRuntimeDirs();
  const serialized = JSON.stringify(payload, null, 2) + "\n";
  await fs.writeFile(statePath, serialized, "utf8");
  try {
    await fs.chmod(statePath, 0o600);
  } catch {
    // Best-effort only.
  }
}

export async function removeState() {
  try {
    await fs.unlink(statePath);
  } catch {
    // ignore
  }
}

export function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

export function buildState({ pid, port, token, runtime, version, chromeExecutablePath }) {
  const timestamp = nowIso();
  return {
    pid,
    port,
    token,
    runtime,
    version,
    chromeExecutablePath,
    startedAt: timestamp,
    updatedAt: timestamp,
    logPath,
    serverEntry: path.join(runtimeDir, "..", "tools", "browserd", "server.mjs")
  };
}
