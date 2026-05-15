import http from "node:http";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  artifactsDir,
  getChromeLaunchConfig,
  getDefaultPort,
  getHost,
  getIdleTimeoutMs,
  startupErrorPath
} from "./runtime-paths.mjs";
import { buildState, createToken, ensureRuntimeDirs, nowIso, removeState, writeState } from "./state.mjs";

const VERSION = "phase-2";
const host = getHost();
const requestedPort = Number(process.env.BROWSERCTL_PORT || getDefaultPort());
const token = process.env.BROWSERCTL_TOKEN || createToken();
const idleTimeoutMs = getIdleTimeoutMs();
const startupTimeoutMs = Number(process.env.BROWSERCTL_STARTUP_TIMEOUT_MS || 30000);

let browser;
let context;
let page;
let server;
let state;
let refs = new Map();
let refCounter = 0;
let recentConsole = [];
let recentNetwork = [];
let idleTimer;
const PAGE_CONSOLE_BUFFER_KEY = "__browserctlConsoleEvents";

async function writeStartupError(error) {
  await ensureRuntimeDirs();
  const payload = {
    ok: false,
    phase: "startup",
    pid: process.pid,
    timestamp: nowIso(),
    error: String(error?.message || error),
    stack: String(error?.stack || ""),
    chromeExecutablePath: getChromeLaunchConfig().chromeExecutablePath
  };
  await fs.writeFile(startupErrorPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8").catch(() => {});
  await fs.appendFile(
    `${artifactsDir}/../server.log`,
    `[${payload.timestamp}] startup_failed:${payload.error}\n`
  ).catch(() => {});
}

async function logStartupStep(step) {
  await ensureRuntimeDirs();
  await fs.appendFile(`${artifactsDir}/../server.log`, `[${nowIso()}] startup:${step}\n`).catch(() => {});
}

function touch() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    void shutdown("idle_timeout");
  }, idleTimeoutMs);
}

function pushBounded(list, item, limit = 50) {
  list.push(item);
  if (list.length > limit) {
    list.splice(0, list.length - limit);
  }
}

function resetRefs() {
  refs = new Map();
  refCounter = 0;
}

function resetConsoleBuffers() {
  recentConsole = [];
}

function resetNetworkBuffers() {
  recentNetwork = [];
}

async function initBrowser() {
  await ensureRuntimeDirs();
  const { launchOptions, chromeExecutablePath } = getChromeLaunchConfig();
  await logStartupStep(
    `launch_begin chrome=${chromeExecutablePath || "playwright-default"} channel=${launchOptions.channel || ""}`
  );

  browser = await chromium.launch({
    headless: true,
    ...launchOptions,
    timeout: startupTimeoutMs
  });
  await logStartupStep("launch_complete");
  context = await browser.newContext({
    viewport: { width: 1440, height: 960 }
  });
  await logStartupStep("context_complete");
  await context.addInitScript((bufferKey) => {
    const target = globalThis;
    if (!Array.isArray(target[bufferKey])) {
      target[bufferKey] = [];
    }

    const methods = ["log", "info", "warn", "error", "debug"];
    for (const method of methods) {
      const original = console[method].bind(console);
      console[method] = (...args) => {
        try {
          target[bufferKey].push({
            type: method,
            text: args
              .map((arg) => {
                if (typeof arg === "string") {
                  return arg;
                }
                try {
                  return JSON.stringify(arg);
                } catch {
                  return String(arg);
                }
              })
              .join(" "),
            timestamp: new Date().toISOString(),
            source: "page-buffer"
          });
          if (target[bufferKey].length > 100) {
            target[bufferKey].splice(0, target[bufferKey].length - 100);
          }
        } catch {
          // Ignore page-side buffer errors.
        }
        original(...args);
      };
    }
  }, PAGE_CONSOLE_BUFFER_KEY);
  await logStartupStep("init_script_complete");
  page = await context.newPage();
  await logStartupStep("page_complete");

  page.on("console", async (msg) => {
    const entry = {
      type: msg.type(),
      text: msg.text(),
      timestamp: nowIso(),
      source: "playwright"
    };
    pushBounded(recentConsole, entry);
  });

  page.on("pageerror", (error) => {
    pushBounded(recentConsole, {
      type: "pageerror",
      text: String(error?.message || error),
      timestamp: nowIso(),
      source: "playwright"
    });
  });

  page.on("request", (request) => {
    pushBounded(recentNetwork, {
      kind: "request",
      method: request.method(),
      url: request.url(),
      timestamp: nowIso()
    });
  });

  page.on("response", (response) => {
    pushBounded(recentNetwork, {
      kind: "response",
      status: response.status(),
      url: response.url(),
      timestamp: nowIso()
    });
  });

  server = http.createServer(async (req, res) => {
    touch();
    try {
      await route(req, res);
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, resolve);
  });
  await logStartupStep("listen_complete");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : requestedPort;
  state = buildState({
    pid: process.pid,
    port,
    token,
    runtime: "node-playwright",
    version: VERSION,
    chromeExecutablePath
  });
  await writeState(state);
  await logStartupStep("state_written");
  touch();
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function authorized(req) {
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${token}`;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function getInteractiveElements() {
  const selector = [
    "a[href]",
    "button",
    "input",
    "textarea",
    "select",
    "[role='button']",
    "[role='link']",
    "[role='textbox']"
  ].join(", ");

  const handles = await page.$$(selector);
  const snapshot = [];
  resetRefs();

  for (const handle of handles) {
    const visible = await handle.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }

    refCounter += 1;
    const ref = `@e${refCounter}`;
    refs.set(ref, handle);

    const descriptor = await handle.evaluate((element) => {
      const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
      const label =
        element.getAttribute("aria-label") ||
        element.getAttribute("placeholder") ||
        text ||
        element.getAttribute("name") ||
        "";

      return {
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type") || "",
        role: element.getAttribute("role") || "",
        label: label.slice(0, 160),
        text: text.slice(0, 160)
      };
    });

    snapshot.push({ ref, ...descriptor });
  }

  return snapshot;
}

async function requireRef(ref) {
  const handle = refs.get(ref);
  if (!handle) {
    throw new Error(`Unknown or stale ref: ${ref}`);
  }
  return handle;
}

async function getPageBufferedConsoleEvents() {
  try {
    return await page.evaluate((bufferKey) => {
      const target = globalThis;
      if (!Array.isArray(target[bufferKey])) {
        return [];
      }
      return target[bufferKey];
    }, PAGE_CONSOLE_BUFFER_KEY);
  } catch {
    return [];
  }
}

async function clearPageBufferedConsoleEvents() {
  try {
    await page.evaluate((bufferKey) => {
      const target = globalThis;
      if (Array.isArray(target[bufferKey])) {
        target[bufferKey].length = 0;
      }
    }, PAGE_CONSOLE_BUFFER_KEY);
  } catch {
    // Ignore if the page is transitioning or buffer is unavailable.
  }
}

async function getConsoleEvents() {
  const pageBufferedEvents = await getPageBufferedConsoleEvents();
  const merged = [...recentConsole, ...pageBufferedEvents];
  const unique = [];
  const seen = new Set();

  for (const event of merged) {
    const key = `${event.source || "unknown"}|${event.type}|${event.text}|${event.timestamp}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(event);
  }

  return unique.slice(-100);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      pid: process.pid,
      runtime: "node-playwright",
      version: VERSION,
      pageUrl: page.url(),
      consoleEvents: recentConsole.length,
      networkEvents: recentNetwork.length
    });
    return;
  }

  if (!authorized(req)) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/goto") {
    const body = await parseJsonBody(req);
    resetRefs();
    resetConsoleBuffers();
    resetNetworkBuffers();
    const response = await page.goto(body.url, {
      waitUntil: body.waitUntil || "domcontentloaded",
      timeout: body.timeoutMs || 15000
    });
    await clearPageBufferedConsoleEvents();
    sendJson(res, 200, {
      ok: true,
      url: page.url(),
      status: response?.status?.() ?? null,
      title: await page.title()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/snapshot") {
    const items = await getInteractiveElements();
    sendJson(res, 200, {
      ok: true,
      url: page.url(),
      title: await page.title(),
      refs: items
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/click") {
    const body = await parseJsonBody(req);
    const handle = await requireRef(body.ref);
    await handle.click({ timeout: body.timeoutMs || 10000 });
    await page.waitForTimeout(150);
    sendJson(res, 200, { ok: true, ref: body.ref, url: page.url() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/type") {
    const body = await parseJsonBody(req);
    const handle = await requireRef(body.ref);
    await handle.fill(body.text ?? "", { timeout: body.timeoutMs || 10000 });
    sendJson(res, 200, { ok: true, ref: body.ref, typed: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/screenshot") {
    const body = await parseJsonBody(req);
    await ensureRuntimeDirs();
    const outputPath =
      body.path ||
      `${artifactsDir}/screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    await page.screenshot({ path: outputPath, fullPage: body.fullPage !== false });
    sendJson(res, 200, { ok: true, path: outputPath });
    return;
  }

  if (req.method === "GET" && url.pathname === "/console") {
    await page.waitForTimeout(50);
    sendJson(res, 200, { ok: true, events: await getConsoleEvents() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/network") {
    sendJson(res, 200, { ok: true, events: recentNetwork });
    return;
  }

  if (req.method === "POST" && url.pathname === "/stop") {
    sendJson(res, 200, { ok: true });
    setTimeout(() => {
      void shutdown("client_stop");
    }, 50);
    return;
  }

  sendJson(res, 404, { ok: false, error: "not_found" });
}

async function shutdown(reason) {
  try {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
  } finally {
    await removeState();
    await fs.appendFile(
      state?.logPath || `${artifactsDir}/../server.log`,
      `[${nowIso()}] shutdown:${reason}\n`
    ).catch(() => {});
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("sigint"));
process.on("SIGTERM", () => void shutdown("sigterm"));

const startupTimer = setTimeout(() => {
  void writeStartupError(new Error(`browserd_startup_timeout:${startupTimeoutMs}`)).finally(() => {
    process.exit(70);
  });
}, startupTimeoutMs + 5000);

try {
  await initBrowser();
  clearTimeout(startupTimer);
} catch (error) {
  clearTimeout(startupTimer);
  await writeStartupError(error);
  await shutdown("startup_failed");
}
