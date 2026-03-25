import fs from "node:fs/promises";
import { accessSync, constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { readState } from "./state.mjs";
import { logPath, runtimeDir, scriptDir, statePath } from "./runtime-paths.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverEntry = path.join(__dirname, "server.mjs");
const nodeBin = process.execPath || "/usr/local/bin/node";

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  return { command, rest };
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function usage() {
  process.stdout.write(
    [
      "browserctl",
      "",
      "Available commands:",
      "  start",
      "  stop",
      "  health [--json]",
      "  goto <url> [--json]",
      "  snapshot [--json]",
      "  click <ref>",
      "  type <ref> <text>",
      "  screenshot [path] [--json]",
      "  console [--json]",
      "  network [--json]"
    ].join("\n") + "\n"
  );
}

function hasPlaywrightRuntime() {
  try {
    accessSync(path.join(scriptDir, "node_modules", "playwright"), constants.F_OK);
    accessSync(serverEntry, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function request(state, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${state.port}${pathname}`, {
    method: options.method || "GET",
    headers: {
      authorization: `Bearer ${state.token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({ ok: false, error: "invalid_json" }));
  if (!response.ok) {
    const message = payload?.error || `request_failed:${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function healthcheck(state, { jsonMode = false, silent = false } = {}) {
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/health`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || "health_failed");
    }
    if (jsonMode) {
      printJson({
        healthy: true,
        statePath,
        ...payload
      });
    } else if (!silent) {
      process.stdout.write(
        `browserctl health: healthy runtime=${payload.runtime} page=${payload.pageUrl || "-"}\n`
      );
    }
    return true;
  } catch {
    if (jsonMode) {
      printJson({ healthy: false, reason: "server_unreachable", statePath });
    } else if (!silent) {
      process.stdout.write("browserctl health: not running\n");
    }
    return false;
  }
}

async function waitForServer(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await readState();
    if (state?.port && state?.token) {
      const ok = await healthcheck(state, { silent: true });
      if (ok) {
        return state;
      }
    }
    await sleep(250);
  }
  throw new Error("Timed out waiting for browserd");
}

async function ensureStarted() {
  const state = await readState();
  if (state?.port && state?.token) {
    const ok = await healthcheck(state, { silent: true });
    if (ok) {
      return state;
    }
  }

  await fs.mkdir(runtimeDir, { recursive: true });
  const out = await fs.open(logPath, "a");
  const child = spawn(nodeBin, [serverEntry], {
    cwd: scriptDir,
    detached: true,
    stdio: ["ignore", out.fd, out.fd],
    env: process.env
  });
  child.unref();
  await out.close();
  return waitForServer();
}

async function commandStart() {
  if (!hasPlaywrightRuntime()) {
    process.stderr.write(
      `browserctl: Playwright runtime not installed. Run npm install in ${scriptDir}\n`
    );
    return 64;
  }
  const state = await ensureStarted();
  process.stdout.write(`browserctl start: ready (${statePath})\n`);
  return 0;
}

async function commandHealth(rest) {
  const jsonMode = rest.includes("--json");
  const state = await readState();
  if (!state) {
    if (jsonMode) {
      printJson({ healthy: false, reason: "runtime_not_started", statePath });
    } else {
      process.stdout.write("browserctl health: not running\n");
    }
    return 1;
  }
  return (await healthcheck(state, { jsonMode })) ? 0 : 1;
}

async function commandGoto(rest) {
  const jsonMode = rest.includes("--json");
  const url = rest.find((arg) => !arg.startsWith("--"));
  if (!url) {
    process.stderr.write("browserctl goto: missing <url>\n");
    return 64;
  }
  const state = await ensureStarted();
  const payload = await request(state, "/goto", {
    method: "POST",
    body: { url }
  });
  if (jsonMode) {
    printJson(payload);
  } else {
    process.stdout.write(
      `browserctl goto: status=passed http=${payload.status ?? "-"} url=${payload.url}\n`
    );
  }
  return 0;
}

async function commandSnapshot(rest) {
  const jsonMode = rest.includes("--json");
  const state = await ensureStarted();
  const payload = await request(state, "/snapshot");
  if (jsonMode) {
    printJson(payload);
  } else {
    process.stdout.write(`${payload.title || payload.url}\n`);
    for (const item of payload.refs || []) {
      process.stdout.write(
        `${item.ref} ${item.tag}${item.type ? `:${item.type}` : ""} ${item.label || item.text || ""}\n`
      );
    }
  }
  return 0;
}

async function commandClick(rest) {
  const ref = rest[0];
  if (!ref) {
    process.stderr.write("browserctl click: missing <ref>\n");
    return 64;
  }
  const state = await ensureStarted();
  const payload = await request(state, "/click", { method: "POST", body: { ref } });
  printJson(payload);
  return 0;
}

async function commandType(rest) {
  const [ref, ...textParts] = rest;
  if (!ref || textParts.length === 0) {
    process.stderr.write("browserctl type: usage browserctl type <ref> <text>\n");
    return 64;
  }
  const state = await ensureStarted();
  const payload = await request(state, "/type", {
    method: "POST",
    body: { ref, text: textParts.join(" ") }
  });
  printJson(payload);
  return 0;
}

async function commandScreenshot(rest) {
  const jsonMode = rest.includes("--json");
  const pathArg = rest.find((arg) => !arg.startsWith("--"));
  const state = await ensureStarted();
  const payload = await request(state, "/screenshot", {
    method: "POST",
    body: { path: pathArg ? path.resolve(process.cwd(), pathArg) : null }
  });
  if (jsonMode) {
    printJson(payload);
  } else {
    process.stdout.write(`${payload.path}\n`);
  }
  return 0;
}

async function commandEventFeed(kind, rest) {
  const jsonMode = rest.includes("--json");
  const state = await ensureStarted();
  const payload = await request(state, `/${kind}`);
  if (jsonMode) {
    printJson(payload);
  } else {
    for (const event of payload.events || []) {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    }
  }
  return 0;
}

async function commandStop() {
  const state = await readState();
  if (!state?.port || !state?.token) {
    process.stdout.write("browserctl stop: not running\n");
    return 0;
  }
  try {
    await request(state, "/stop", { method: "POST" });
  } catch {
    // ignore server-side shutdown race
  }
  process.stdout.write("browserctl stop: requested\n");
  return 0;
}

const handlers = {
  start: commandStart,
  stop: commandStop,
  health: commandHealth,
  goto: commandGoto,
  snapshot: commandSnapshot,
  click: commandClick,
  type: commandType,
  screenshot: commandScreenshot,
  console: (rest) => commandEventFeed("console", rest),
  network: (rest) => commandEventFeed("network", rest)
};

const { command, rest } = parseArgs(process.argv.slice(2));
if (!handlers[command]) {
  usage();
  process.exit(command === "help" || command === "--help" || command === "-h" ? 0 : 64);
}

process.exit(await handlers[command](rest));
