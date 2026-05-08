#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const artifactsDir = path.join(repoRoot, ".claude", "browser-artifacts");
const browserRuntimeDir = path.join(repoRoot, ".claude", "browser-runtime");
const browserStartupLockPath = path.join(browserRuntimeDir, "startup.lock");
const browserStartupErrorPath = path.join(browserRuntimeDir, "startup-error.json");

function getBrowserCommandTimeoutMs() {
  if (process.env.BROWSER_FLOW_COMMAND_TIMEOUT_MS) {
    return Number(process.env.BROWSER_FLOW_COMMAND_TIMEOUT_MS);
  }
  if (process.env.BROWSERCTL_STARTUP_WAIT_TIMEOUT_MS) {
    return Number(process.env.BROWSERCTL_STARTUP_WAIT_TIMEOUT_MS) + 10000;
  }
  const startupTimeoutMs = Number(process.env.BROWSERCTL_STARTUP_TIMEOUT_MS || 30000);
  return startupTimeoutMs + 20000;
}

function usage() {
  process.stdout.write(
    [
      "Usage:",
      "  node .claude/scripts/browser-flow-runner.mjs self-test",
      "  node .claude/scripts/browser-flow-runner.mjs --flow <name> [--url <url>] [--contract <path>] [--browserctl <path>]",
      "",
      "Writes .claude/browser-flow-verdict-<runId>.json"
    ].join("\n") + "\n"
  );
}

function parseArgs(argv) {
  const args = {
    command: "",
    flow: "",
    url: "",
    contract: ".claude/verification.contract.yaml",
    browserctl: process.env.BROWSERCTL_PATH || ".claude/bin/browserctl",
    runId: `browser-flow-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    output: "",
    forceDirect: false,
    directInProcess: false,
    useSystemChrome: false,
    chromePath: "",
    cdpEndpoint: ""
  };

  if (argv[0] && !argv[0].startsWith("-")) {
    args.command = argv.shift();
  }

  while (argv.length > 0) {
    const item = argv.shift();
    if (item === "--flow") args.flow = argv.shift() || "";
    else if (item?.startsWith("--flow=")) args.flow = item.slice("--flow=".length);
    else if (item === "--url") args.url = argv.shift() || "";
    else if (item?.startsWith("--url=")) args.url = item.slice("--url=".length);
    else if (item === "--contract") args.contract = argv.shift() || "";
    else if (item?.startsWith("--contract=")) args.contract = item.slice("--contract=".length);
    else if (item === "--browserctl") args.browserctl = argv.shift() || "";
    else if (item?.startsWith("--browserctl=")) args.browserctl = item.slice("--browserctl=".length);
    else if (item === "--run-id") args.runId = argv.shift() || args.runId;
    else if (item?.startsWith("--run-id=")) args.runId = item.slice("--run-id=".length);
    else if (item === "--output") args.output = argv.shift() || "";
    else if (item?.startsWith("--output=")) args.output = item.slice("--output=".length);
    else if (item === "--direct") args.forceDirect = true;
    else if (item === "--in-process") args.directInProcess = true;
    else if (item === "--system-chrome") args.useSystemChrome = true;
    else if (item === "--cdp-endpoint") args.cdpEndpoint = argv.shift() || "";
    else if (item?.startsWith("--cdp-endpoint=")) args.cdpEndpoint = item.slice("--cdp-endpoint=".length);
    else if (item === "--chrome-path") {
      args.useSystemChrome = true;
      args.chromePath = argv.shift() || "";
    }
    else if (item?.startsWith("--chrome-path=")) {
      args.useSystemChrome = true;
      args.chromePath = item.slice("--chrome-path=".length);
    }
    else if (item === "-h" || item === "--help") args.command = "help";
    else throw new Error(`Unknown argument: ${item}`);
  }

  if (args.command && !args.flow) args.flow = args.command;
  if (!args.output) args.output = `.claude/browser-flow-verdict-${args.runId}.json`;
  return args;
}

function shell(command, args, options = {}) {
  const chromePath = resolveChromePath();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    timeout: getBrowserCommandTimeoutMs(),
    env: chromePath
      ? { ...process.env, BROWSERCTL_CHROME_PATH: chromePath }
      : process.env,
    ...options
  });
  const errorMessage = result.error ? String(result.error.message || result.error) : "";
  return {
    command: [command, ...args].join(" "),
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: [result.stderr || "", errorMessage].filter(Boolean).join("\n"),
    ok: (result.status ?? 1) === 0
  };
}

function resolveChromePath() {
  if (process.env.BROWSERCTL_CHROME_PATH) return process.env.BROWSERCTL_CHROME_PATH;
  if (process.env.BROWSERCTL_USE_SYSTEM_CHROME !== "1") return "";
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function resolveCachedPlaywrightChromiumExecutablePath() {
  const cacheRoots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(process.env.HOME || "", "Library", "Caches", "ms-playwright"),
    "/Users/seokgimoon/Library/Caches/ms-playwright"
  ].filter(Boolean);
  const relativeCandidates = [
    path.join("chromium_headless_shell-1217", "chrome-headless-shell-mac-arm64", "chrome-headless-shell"),
    path.join("chromium_headless_shell-1208", "chrome-headless-shell-mac-arm64", "chrome-headless-shell"),
    path.join("chromium-1060", "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium")
  ];
  for (const root of cacheRoots) {
    for (const relative of relativeCandidates) {
      const candidate = path.join(root, relative);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "";
}

function readCdpEndpointFile() {
  const endpointPath = path.join(browserRuntimeDir, "cdp-endpoint");
  if (!fs.existsSync(endpointPath)) return "";
  return fs.readFileSync(endpointPath, "utf8").trim();
}

function resolveChromeLaunchOptions(args = {}) {
  if (args.chromePath) return { executablePath: args.chromePath };
  const explicitPath = process.env.BROWSERCTL_CHROME_PATH;
  if (explicitPath) return { executablePath: explicitPath };
  if (!args.useSystemChrome && process.env.BROWSERCTL_USE_SYSTEM_CHROME !== "1") {
    const cachedPath = resolveCachedPlaywrightChromiumExecutablePath();
    return cachedPath ? { executablePath: cachedPath } : {};
  }
  if (fs.existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")) return { channel: "chrome" };
  if (fs.existsSync("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge")) return { channel: "msedge" };
  if (fs.existsSync("/Applications/Chromium.app/Contents/MacOS/Chromium")) return { channel: "chromium" };
  return {};
}

async function loadPlaywright() {
  const entry = path.join(repoRoot, ".claude", "tools", "browserd", "node_modules", "playwright", "index.js");
  if (!fs.existsSync(entry)) {
    throw new Error(`playwright_not_installed:${entry}`);
  }
  const loaded = await import(pathToFileURL(entry).href);
  return loaded.default || loaded;
}

function readJsonMaybe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function scalar(value) {
  const trimmed = String(value || "").trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseBrowserFlowsFromYaml(text) {
  const lines = text.split(/\r?\n/);
  const flows = [];
  let inRuntime = false;
  let inFlows = false;
  let flow = null;
  let currentStep = null;
  let currentTarget = null;
  let currentArtifacts = null;
  let currentVisual = null;

  for (const raw of lines) {
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (indent === 0) {
      inRuntime = line === "runtime:";
      inFlows = false;
      continue;
    }
    if (!inRuntime) continue;
    if (indent === 2 && line === "browserFlows:") {
      inFlows = true;
      continue;
    }
    if (!inFlows) continue;
    if (indent <= 2 && line.endsWith(":") && line !== "browserFlows:") {
      inFlows = false;
      continue;
    }

    if (indent === 4 && line.startsWith("- ")) {
      flow = {};
      flows.push(flow);
      currentStep = null;
      currentTarget = null;
      currentArtifacts = null;
      currentVisual = null;
      const rest = line.slice(2);
      if (rest.includes(":")) {
        const [key, ...parts] = rest.split(":");
        flow[key.trim()] = scalar(parts.join(":"));
      }
      continue;
    }
    if (!flow) continue;

    if (indent === 6 && line === "steps:") {
      flow.steps = [];
      currentArtifacts = null;
      currentVisual = null;
      continue;
    }
    if (indent === 6 && line === "artifacts:") {
      flow.artifacts = {};
      currentArtifacts = flow.artifacts;
      currentVisual = null;
      continue;
    }
    if (indent === 6 && line === "visual:") {
      flow.visual = {};
      currentVisual = flow.visual;
      currentArtifacts = null;
      continue;
    }
    if (indent === 6 && line.includes(":")) {
      const [key, ...parts] = line.split(":");
      flow[key.trim()] = scalar(parts.join(":"));
      currentArtifacts = null;
      currentVisual = null;
      continue;
    }
    if (indent === 8 && currentArtifacts && line.includes(":")) {
      const [key, ...parts] = line.split(":");
      currentArtifacts[key.trim()] = scalar(parts.join(":"));
      continue;
    }
    if (indent === 8 && currentVisual && line.includes(":")) {
      const [key, ...parts] = line.split(":");
      currentVisual[key.trim()] = scalar(parts.join(":"));
      continue;
    }
    if (indent === 8 && line.startsWith("- ")) {
      currentStep = {};
      flow.steps ||= [];
      flow.steps.push(currentStep);
      currentTarget = null;
      const rest = line.slice(2);
      if (rest.includes(":")) {
        const [key, ...parts] = rest.split(":");
        currentStep[key.trim()] = scalar(parts.join(":"));
      }
      continue;
    }
    if (indent === 10 && currentStep && line === "target:") {
      currentStep.target = {};
      currentTarget = currentStep.target;
      continue;
    }
    if (indent === 10 && currentStep && line.includes(":")) {
      const [key, ...parts] = line.split(":");
      currentStep[key.trim()] = scalar(parts.join(":"));
      currentTarget = null;
      continue;
    }
    if (indent === 12 && currentTarget && line.includes(":")) {
      const [key, ...parts] = line.split(":");
      currentTarget[key.trim()] = scalar(parts.join(":"));
    }
  }

  return flows;
}

function loadDeclaredFlow(args) {
  if (args.flow === "self-test") return buildSelfTestFlow(args);
  if (!fs.existsSync(args.contract)) {
    throw new Error(`Contract not found: ${args.contract}`);
  }
  const text = fs.readFileSync(args.contract, "utf8");
  const parsedJson = args.contract.endsWith(".json") ? readJsonMaybe(text) : null;
  const flows = parsedJson?.runtime?.browserFlows || parseBrowserFlowsFromYaml(text);
  const flow = flows.find((item) => item.name === args.flow);
  if (!flow) throw new Error(`Browser flow not found: ${args.flow}`);
  return normalizeFlow(flow, args);
}

function buildSelfTestFlow(args) {
  fs.mkdirSync(artifactsDir, { recursive: true });
  const htmlPath = path.join(artifactsDir, "self-test.html");
  fs.writeFileSync(
    htmlPath,
    [
      "<!doctype html>",
      "<title>Browser Flow Self Test</title>",
      "<button aria-label=\"OK\" onclick=\"localStorage.setItem('clicked','yes');document.querySelector('[role=status]').textContent='clicked=yes'\">OK</button>",
      "<input aria-label=\"Name\" value=\"\" />",
      "<div role=\"status\">ready</div>",
      "<script>document.querySelector('[role=status]').textContent = localStorage.getItem('clicked') ? 'clicked=yes' : 'ready';</script>"
    ].join("\n")
  );
  const targetUrl = args.url || pathToFileURL(htmlPath).href;
  const usesExternalTarget = Boolean(args.url);
  return normalizeFlow(
    {
      name: "self-test",
      critical: true,
      targetUrl,
      steps: [
        { action: "goto" },
        { action: "snapshot" },
        { action: "click", target: { role: "button", name: "OK" } },
        { action: "snapshot" },
        ...(usesExternalTarget ? [] : [{ action: "type", target: { role: "textbox", name: "Name" }, text: "Codex" }]),
        { action: "screenshot" },
        { action: "console" },
        { action: "network" },
        ...(usesExternalTarget ? [] : [{ action: "goto", recover: true }, { action: "snapshot" }])
      ],
      artifacts: { screenshot: true, console: true, network: true }
    },
    { ...args, url: targetUrl }
  );
}

function normalizeFlow(flow, args) {
  const targetUrl = args.url || flow.targetUrl || flow.url || flow.entry || "";
  return {
    name: flow.name || args.flow || "browser-flow",
    critical: flow.critical === true || flow.critical === "true",
    targetUrl,
    steps: Array.isArray(flow.steps) && flow.steps.length > 0 ? flow.steps : [{ action: "goto" }, { action: "snapshot" }, { action: "screenshot" }],
    artifacts: flow.artifacts || {},
    visual: normalizeVisualConfig(flow.visual)
  };
}

function normalizeVisualConfig(visual) {
  if (!visual || typeof visual !== "object") return null;
  return {
    required: visual.required === true || visual.required === "true",
    baseline: visual.baseline || visual.baselineScreenshot || "",
    maxDiffRatio: Number(visual.maxDiffRatio ?? visual.threshold ?? 0.01),
    breakpoint: visual.breakpoint || visual.breakpointName || "",
    diffOutput: visual.diffOutput || ""
  };
}

function resolveRef(snapshot, target) {
  if (!target) return "";
  if (typeof target === "string") return target;
  if (target.ref || target.targetRef) return target.ref || target.targetRef;
  const expectedName = String(target.name || target.label || "").toLowerCase();
  const expectedRole = String(target.role || "").toLowerCase();
  const expectedTagByRole = {
    button: "button",
    link: "a",
    textbox: "input"
  };
  for (const item of snapshot?.refs || []) {
    const actualName = String(item.label || item.text || "").toLowerCase();
    const actualRole = String(item.role || item.tag || "").toLowerCase();
    const roleMatches =
      !expectedRole ||
      actualRole === expectedRole ||
      item.tag === expectedTagByRole[expectedRole] ||
      (expectedRole === "textbox" && ["input", "textarea"].includes(item.tag));
    const nameMatches = !expectedName || actualName.includes(expectedName);
    if (roleMatches && nameMatches) return item.ref;
  }
  return "";
}

function classifyEvidenceDepth(stepResults) {
  const passed = stepResults.filter((step) => step.status === "passed").map((step) => step.action);
  const hasOpen = passed.includes("goto") || passed.includes("snapshot");
  const hasAct = passed.some((action) => ["click", "type"].includes(action));
  const hasMutation = hasAct && stepResults.some((step) => step.action === "snapshot" && step.status === "passed");
  const hasRecover = stepResults.some((step) => step.status === "passed" && step.recover === true);
  if (hasOpen && hasAct && hasMutation && hasRecover) return "open-act-mutate-persist-recover";
  if (hasOpen && hasAct) return "open-act";
  return "smoke";
}

function writeVerdict(outputPath, payload) {
  fs.mkdirSync(path.dirname(path.resolve(repoRoot, outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function attachVisualDiff(args, flow, verdict) {
  const visual = flow.visual;
  if (!visual) return verdict;

  const screenshot = verdict.artifacts?.screenshot || "";
  const visualVerdictPath = path.join(".claude", `visual-diff-verdict-${args.runId}-${flow.name}.json`);
  const visualResult = {
    runId: `${args.runId}-${flow.name}`,
    status: "setup_gap",
    flowName: flow.name,
    currentScreenshot: screenshot,
    baselineScreenshot: visual.baseline || "",
    diffImage: "",
    maxDiffRatio: visual.maxDiffRatio,
    actualDiffRatio: null,
    changedPixels: 0,
    totalPixels: 0,
    breakpoint: visual.breakpoint,
    setupGaps: [],
    failures: []
  };

  if (!screenshot) {
    visualResult.setupGaps.push("missing_flow_screenshot");
  } else if (!fs.existsSync(path.join(repoRoot, ".claude", "scripts", "visual-diff-runner.mjs"))) {
    visualResult.setupGaps.push("missing_visual_diff_runner:.claude/scripts/visual-diff-runner.mjs");
  } else {
    const runnerArgs = [
      ".claude/scripts/visual-diff-runner.mjs",
      "compare",
      "--current",
      screenshot,
      "--baseline",
      visual.baseline,
      "--output",
      visualVerdictPath,
      "--max-diff-ratio",
      String(visual.maxDiffRatio),
      "--flow",
      flow.name,
      "--run-id",
      `${args.runId}-${flow.name}`
    ];
    if (visual.breakpoint) runnerArgs.push("--breakpoint", visual.breakpoint);
    if (visual.diffOutput) runnerArgs.push("--diff-output", visual.diffOutput);
    if (visual.required) runnerArgs.push("--required");
    const run = spawnSync(process.execPath, runnerArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8
    });
    if (fs.existsSync(visualVerdictPath)) {
      Object.assign(visualResult, JSON.parse(fs.readFileSync(visualVerdictPath, "utf8")));
    } else {
      visualResult.status = run.status === 64 ? "setup_gap" : "failed";
      (visualResult.status === "setup_gap" ? visualResult.setupGaps : visualResult.failures).push(
        (run.stderr || run.stdout || `visual_diff_runner_exit:${run.status ?? "unknown"}`).trim()
      );
    }
  }

  writeVerdict(visualVerdictPath, visualResult);
  verdict.artifacts ||= {};
  verdict.artifacts.visualDiff = visualVerdictPath;
  verdict.visualDiff = visualResult;
  if (visual.required && visualResult.status !== "passed") {
    if (visualResult.status === "failed") {
      verdict.status = "failed";
      verdict.failures ||= [];
      verdict.failures.push(`required_visual_diff_failed:${visualVerdictPath}`);
    } else if (verdict.status === "passed") {
      verdict.status = "setup_gap";
      verdict.setupGaps ||= [];
      verdict.setupGaps.push(`required_visual_diff_setup_gap:${visualVerdictPath}`);
    }
  }
  return verdict;
}

function releaseFailedBrowserStartupLock() {
  fs.rmSync(browserStartupLockPath, { force: true });
}

async function getDirectSnapshot(page) {
  return {
    refs: await page.$$eval(
      [
        "a[href]",
        "button",
        "input",
        "textarea",
        "select",
        "[role='button']",
        "[role='link']",
        "[role='textbox']"
      ].join(", "),
      (elements) => elements
        .filter((element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        })
        .map((element, index) => {
          const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
          const label =
            element.getAttribute("aria-label") ||
            element.getAttribute("placeholder") ||
            text ||
            element.getAttribute("name") ||
            "";
          return {
            ref: `@e${index + 1}`,
            tag: element.tagName.toLowerCase(),
            type: element.getAttribute("type") || "",
            role: element.getAttribute("role") || "",
            label: label.slice(0, 160),
            text: text.slice(0, 160)
          };
        })
    )
  };
}

function directLocator(page, target) {
  if (!target || typeof target === "string") {
    throw new Error(`direct_target_not_supported:${JSON.stringify(target)}`);
  }
  const role = target.role || "";
  const name = target.name || target.label || "";
  if (role && name) {
    return page.getByRole(role, { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
  }
  if (role) return page.getByRole(role).first();
  if (target.text) return page.getByText(target.text).first();
  throw new Error(`direct_target_not_supported:${JSON.stringify(target)}`);
}

async function runFlowDirect(args, flow, fallbackReason) {
  if (!args.directInProcess && process.env.BROWSER_FLOW_DIRECT_IN_PROCESS !== "1") {
    return runFlowDirectViaEval(args, flow, fallbackReason);
  }

  const { chromium } = await loadPlaywright();
  const failures = [];
  const setupGaps = fallbackReason ? [`browserctl_fallback:${fallbackReason}`] : [];
  const steps = [];
  const artifactPaths = {};
  const consoleEvents = [];
  const networkEvents = [];
  let status = "passed";
  let browser;
  let context;
  let page;

  async function closeWithTimeout(resource, label) {
    if (!resource?.close) return;
    await Promise.race([
      resource.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, Number(process.env.BROWSER_FLOW_CLOSE_TIMEOUT_MS || 3000)))
    ]).catch((error) => {
      setupGaps.push(`${label}_close_timeout:${String(error?.message || error)}`);
    });
  }

  try {
    browser = await chromium.launch({
      headless: true,
      ...resolveChromeLaunchOptions(args),
      timeout: Number(process.env.BROWSER_FLOW_PLAYWRIGHT_TIMEOUT_MS || 15000)
    });
    context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    page = await context.newPage();
    page.on("console", (message) => {
      consoleEvents.push({
        type: message.type(),
        text: message.text(),
        timestamp: new Date().toISOString(),
        source: "playwright-direct"
      });
    });
    page.on("request", (request) => {
      networkEvents.push({
        kind: "request",
        method: request.method(),
        url: request.url(),
        timestamp: new Date().toISOString()
      });
    });
    page.on("response", (response) => {
      networkEvents.push({
        kind: "response",
        status: response.status(),
        url: response.url(),
        timestamp: new Date().toISOString()
      });
    });

    for (const [index, step] of flow.steps.entries()) {
      const action = String(step.action || "snapshot");
      const result = { index: index + 1, action, status: "passed", runtime: "playwright-direct" };
      if (step.recover === true || step.recover === "true") result.recover = true;
      try {
        if (action === "goto") {
          const response = await page.goto(step.url || flow.targetUrl, {
            waitUntil: "domcontentloaded",
            timeout: 15000
          });
          result.output = { ok: true, url: page.url(), status: response?.status?.() ?? null, title: await page.title() };
        } else if (action === "snapshot") {
          const snapshot = await getDirectSnapshot(page);
          result.refCount = snapshot.refs.length;
          result.output = snapshot;
        } else if (action === "click") {
          await directLocator(page, step.target || step.targetRef || step.ref).click({ timeout: 10000 });
          await page.waitForTimeout(150);
        } else if (action === "type") {
          await directLocator(page, step.target || step.targetRef || step.ref).fill(String(step.text || step.value || ""), { timeout: 10000 });
        } else if (action === "screenshot") {
          const screenshotPath = path.join(".claude", "browser-artifacts", `${flow.name}.png`);
          await page.screenshot({ path: path.resolve(repoRoot, screenshotPath), fullPage: true });
          artifactPaths.screenshot = screenshotPath;
          result.artifact = screenshotPath;
        } else if (action === "console" || action === "network") {
          const artifactPath = path.join(".claude", "browser-artifacts", `${flow.name}-${action}.json`);
          fs.mkdirSync(path.dirname(path.resolve(repoRoot, artifactPath)), { recursive: true });
          fs.writeFileSync(
            path.resolve(repoRoot, artifactPath),
            `${JSON.stringify({ events: action === "console" ? consoleEvents : networkEvents }, null, 2)}\n`
          );
          artifactPaths[action] = artifactPath;
          result.artifact = artifactPath;
        } else {
          throw new Error(`unsupported_action:${action}`);
        }
      } catch (error) {
        result.status = "failed";
        result.error = String(error?.message || error);
        failures.push(`step_${index + 1}_${action}:${result.error}`);
        status = "failed";
      }
      steps.push(result);
      if (status === "failed") break;
    }
  } catch (error) {
    status = "setup_gap";
    setupGaps.push(String(error?.message || error));
  } finally {
    await closeWithTimeout(page, "page");
    await closeWithTimeout(context, "context");
    await closeWithTimeout(browser, "browser");
  }

  const evidenceDepth = classifyEvidenceDepth(steps);
  if (flow.critical && evidenceDepth === "smoke" && status === "passed") {
    failures.push("critical_flow_smoke_only");
    status = "failed";
  }

  return {
    runId: args.runId,
    status,
    targetUrl: flow.targetUrl,
    flowName: flow.name,
    critical: flow.critical,
    evidenceDepth,
    steps,
    artifacts: artifactPaths,
    setupGaps,
    failures,
    runtime: "playwright-direct"
  };
}

function directEvalMain() {
  async function run() {
    const fsModule = await import("node:fs");
    const pathModule = await import("node:path");
    const childProcessModule = await import("node:child_process");
    const fs = fsModule.default;
    const path = pathModule.default;
    const { spawnSync } = childProcessModule;
    const inputPath = process.argv[1];
    const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const loaded = await import(input.playwrightEntryUrl);
    const playwright = loaded.default || loaded;
    const { chromium } = playwright;
    const flow = input.flow;
    const failures = [];
    const setupGaps = input.fallbackReason ? ["browserctl_fallback:" + input.fallbackReason] : [];
    const steps = [];
    const artifactPaths = {};
    const consoleEvents = [];
    const networkEvents = [];
    let status = "passed";
    let browser;
    let context;
    let page;
    let launchServicesProfileDir = "";

    function writeJson(filePath, payload) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n");
    }

    function escapeRegex(text) {
      return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function classifyEvidenceDepth(stepResults) {
      const passed = stepResults.filter((step) => step.status === "passed").map((step) => step.action);
      const hasOpen = passed.includes("goto") || passed.includes("snapshot");
      const hasAct = passed.some((action) => ["click", "type"].includes(action));
      const hasMutation = hasAct && stepResults.some((step) => step.action === "snapshot" && step.status === "passed");
      const hasRecover = stepResults.some((step) => step.status === "passed" && step.recover === true);
      if (hasOpen && hasAct && hasMutation && hasRecover) return "open-act-mutate-persist-recover";
      if (hasOpen && hasAct) return "open-act";
      return "smoke";
    }

    async function getDirectSnapshot(targetPage) {
      return {
        refs: await targetPage.$$eval(
          [
            "a[href]",
            "button",
            "input",
            "textarea",
            "select",
            "[role='button']",
            "[role='link']",
            "[role='textbox']"
          ].join(", "),
          (elements) => elements
            .filter((element) => {
              const box = element.getBoundingClientRect();
              return box.width > 0 && box.height > 0;
            })
            .map((element, index) => {
              const text = (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ");
              const label =
                element.getAttribute("aria-label") ||
                element.getAttribute("placeholder") ||
                text ||
                element.getAttribute("name") ||
                "";
              return {
                ref: "@e" + (index + 1),
                tag: element.tagName.toLowerCase(),
                type: element.getAttribute("type") || "",
                role: element.getAttribute("role") || "",
                label: label.slice(0, 160),
                text: text.slice(0, 160)
              };
            })
        )
      };
    }

    function directLocator(targetPage, target) {
      if (!target || typeof target === "string") {
        throw new Error("direct_target_not_supported:" + JSON.stringify(target));
      }
      const role = target.role || "";
      const name = target.name || target.label || "";
      if (role && name) {
        return targetPage.getByRole(role, { name: new RegExp(escapeRegex(name), "i") }).first();
      }
      if (role) return targetPage.getByRole(role).first();
      if (target.text) return targetPage.getByText(target.text).first();
      throw new Error("direct_target_not_supported:" + JSON.stringify(target));
    }

    async function closeWithTimeout(resource, label) {
      if (!resource?.close) return;
      await Promise.race([
        resource.close().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, input.closeTimeoutMs))
      ]).catch((error) => {
        setupGaps.push(label + "_close_timeout:" + String(error?.message || error));
      });
    }

    function chooseCdpPort() {
      let hash = 0;
      for (const character of String(input.runId)) {
        hash = (hash * 31 + character.charCodeAt(0)) % 10000;
      }
      return 33000 + hash;
    }

    async function waitForCdp(port) {
      const deadline = Date.now() + input.openCdpTimeoutMs;
      let lastError = "";
      while (Date.now() < deadline) {
        try {
          const response = await fetch("http://127.0.0.1:" + port + "/json/version");
          if (response.ok) return;
          lastError = "http_" + response.status;
        } catch (error) {
          lastError = String(error?.message || error);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error("cdp_not_ready:" + lastError);
    }

    async function launchViaLaunchServices() {
      const port = chooseCdpPort();
      launchServicesProfileDir = path.join(input.artifactsAbsDir, input.runId + "-chrome-profile");
      fs.rmSync(launchServicesProfileDir, { recursive: true, force: true });
      fs.mkdirSync(launchServicesProfileDir, { recursive: true });
      let openResult = spawnSync(
        "/usr/bin/open",
        [
          "-n",
          "/Applications/Google Chrome.app",
          "--args",
          "--remote-debugging-port=" + port,
          "--user-data-dir=" + launchServicesProfileDir,
          "--no-first-run",
          "--no-default-browser-check",
          "about:blank"
        ],
        { cwd: input.repoRoot, encoding: "utf8", maxBuffer: 1024 * 1024 }
      );
      if ((openResult.status ?? 1) !== 0) {
        const shellCommand = [
          "open",
          "-na",
          "'Google Chrome'",
          "--args",
          "--remote-debugging-port=" + port,
          "--user-data-dir='" + launchServicesProfileDir.replace(/'/g, "'\\''") + "'",
          "--no-first-run",
          "--no-default-browser-check",
          "about:blank"
        ].join(" ");
        const appleScript = 'do shell script "' + shellCommand.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
        openResult = spawnSync("/usr/bin/osascript", ["-e", appleScript], {
          cwd: input.repoRoot,
          encoding: "utf8",
          maxBuffer: 1024 * 1024
        });
      }
      if ((openResult.status ?? 1) !== 0) {
        throw new Error("launchservices_open_failed:" + ((openResult.stderr || openResult.stdout || "").trim() || openResult.status));
      }
      await waitForCdp(port);
      setupGaps.push("direct_launch_recovered_with_launchservices_cdp");
      return chromium.connectOverCDP("http://127.0.0.1:" + port);
    }

    async function launchBrowser() {
      if (input.cdpEndpoint) {
        return chromium.connectOverCDP(input.cdpEndpoint);
      }
      if (input.preferLaunchServices) {
        return launchViaLaunchServices();
      }
      try {
        return await chromium.launch({
          headless: true,
          ...input.launchOptions,
          timeout: input.timeoutMs
        });
      } catch (error) {
        if (!input.allowLaunchServicesFallback) throw error;
        setupGaps.push("direct_launch_failed:" + String(error?.message || error).split("\n")[0]);
        return launchViaLaunchServices();
      }
    }

    function cleanupLaunchServicesChrome() {
      if (!launchServicesProfileDir) return;
      spawnSync("/usr/bin/pkill", ["-f", launchServicesProfileDir], {
        cwd: input.repoRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024
      });
      fs.rmSync(launchServicesProfileDir, { recursive: true, force: true });
    }

    try {
      browser = await launchBrowser();
      context = browser.contexts()[0] || await browser.newContext({ viewport: { width: 1440, height: 960 } });
      page = await context.newPage();
      await page.setViewportSize({ width: 1440, height: 960 }).catch(() => {});
      page.on("console", (message) => {
        consoleEvents.push({
          type: message.type(),
          text: message.text(),
          timestamp: new Date().toISOString(),
          source: "playwright-direct-eval"
        });
      });
      page.on("request", (request) => {
        networkEvents.push({
          kind: "request",
          method: request.method(),
          url: request.url(),
          timestamp: new Date().toISOString()
        });
      });
      page.on("response", (response) => {
        networkEvents.push({
          kind: "response",
          status: response.status(),
          url: response.url(),
          timestamp: new Date().toISOString()
        });
      });

      for (const [index, step] of flow.steps.entries()) {
        const action = String(step.action || "snapshot");
        const result = { index: index + 1, action, status: "passed", runtime: "playwright-direct-eval" };
        if (step.recover === true || step.recover === "true") result.recover = true;
        try {
          if (action === "goto") {
            const response = await page.goto(step.url || flow.targetUrl, {
              waitUntil: "domcontentloaded",
              timeout: 15000
            });
            result.output = { ok: true, url: page.url(), status: response?.status?.() ?? null, title: await page.title() };
          } else if (action === "snapshot") {
            const snapshot = await getDirectSnapshot(page);
            result.refCount = snapshot.refs.length;
            result.output = snapshot;
          } else if (action === "click") {
            await directLocator(page, step.target || step.targetRef || step.ref).click({ timeout: 10000 });
            await page.waitForTimeout(150);
          } else if (action === "type") {
            await directLocator(page, step.target || step.targetRef || step.ref).fill(String(step.text || step.value || ""), { timeout: 10000 });
          } else if (action === "screenshot") {
            const screenshotPath = path.join(".claude", "browser-artifacts", flow.name + ".png");
            await page.screenshot({ path: path.resolve(input.repoRoot, screenshotPath), fullPage: true });
            artifactPaths.screenshot = screenshotPath;
            result.artifact = screenshotPath;
          } else if (action === "console" || action === "network") {
            const artifactPath = path.join(".claude", "browser-artifacts", flow.name + "-" + action + ".json");
            const artifactPayload = { events: action === "console" ? consoleEvents : networkEvents };
            writeJson(path.resolve(input.repoRoot, artifactPath), artifactPayload);
            artifactPaths[action] = artifactPath;
            result.artifact = artifactPath;
          } else {
            throw new Error("unsupported_action:" + action);
          }
        } catch (error) {
          result.status = "failed";
          result.error = String(error?.message || error);
          failures.push("step_" + (index + 1) + "_" + action + ":" + result.error);
          status = "failed";
        }
        steps.push(result);
        if (status === "failed") break;
      }
    } catch (error) {
      status = "setup_gap";
      setupGaps.push(String(error?.message || error));
    } finally {
      await closeWithTimeout(page, "page");
      await closeWithTimeout(context, "context");
      await closeWithTimeout(browser, "browser");
      cleanupLaunchServicesChrome();
    }

    const evidenceDepth = classifyEvidenceDepth(steps);
    if (flow.critical && evidenceDepth === "smoke" && status === "passed") {
      failures.push("critical_flow_smoke_only");
      status = "failed";
    }

    const verdict = {
      runId: input.runId,
      status,
      targetUrl: flow.targetUrl,
      flowName: flow.name,
      critical: flow.critical,
      evidenceDepth,
      steps,
      artifacts: artifactPaths,
      setupGaps,
      failures,
      runtime: "playwright-direct-eval"
    };
    writeJson(input.outputPath, verdict);
    process.exitCode = status === "passed" ? 0 : status === "setup_gap" ? 64 : 1;
  }

  run().catch((error) => {
    process.stderr.write(String(error?.stack || error?.message || error) + "\n");
    process.exit(1);
  });
}

function getDirectEvalEnv() {
  const env = { ...process.env };
  if (process.env.BROWSER_FLOW_EVAL_PRESERVE_ENV === "1") return env;
  for (const key of Object.keys(env)) {
    if (/^(BROWSERCTL_|BROWSER_FLOW_|PLAYWRIGHT_|PW_)/.test(key)) {
      delete env[key];
    }
  }
  return env;
}

function runFlowDirectViaEval(args, flow, fallbackReason) {
  const playwrightEntry = path.join(repoRoot, ".claude", "tools", "browserd", "node_modules", "playwright", "index.js");
  if (!fs.existsSync(playwrightEntry)) {
    return {
      runId: args.runId,
      status: "setup_gap",
      targetUrl: flow.targetUrl,
      flowName: flow.name,
      critical: flow.critical,
      evidenceDepth: "smoke",
      steps: [],
      artifacts: {},
      setupGaps: [`playwright_not_installed:${playwrightEntry}`],
      failures: [],
      runtime: "playwright-direct-eval"
    };
  }

  const safeRunId = args.runId.replace(/[^A-Za-z0-9_.-]/g, "_");
  const inputPath = path.join(artifactsDir, `${safeRunId}-direct-input.json`);
  const outputPath = path.join(artifactsDir, `${safeRunId}-direct-output.json`);
  fs.mkdirSync(artifactsDir, { recursive: true });
  const launchOptions = resolveChromeLaunchOptions(args);
  const cdpEndpoint = args.cdpEndpoint || process.env.BROWSER_FLOW_CDP_ENDPOINT || readCdpEndpointFile();
  const canUseLaunchServices =
    process.env.BROWSER_FLOW_DISABLE_LAUNCHSERVICES_FALLBACK !== "1" &&
    !cdpEndpoint &&
    !launchOptions.executablePath &&
    fs.existsSync("/Applications/Google Chrome.app");
  fs.writeFileSync(
    inputPath,
    `${JSON.stringify(
      {
        repoRoot,
        runId: args.runId,
        flow,
        fallbackReason,
        cdpEndpoint,
        launchOptions,
        playwrightEntryUrl: pathToFileURL(playwrightEntry).href,
        timeoutMs: Number(process.env.BROWSER_FLOW_PLAYWRIGHT_TIMEOUT_MS || 15000),
        closeTimeoutMs: Number(process.env.BROWSER_FLOW_CLOSE_TIMEOUT_MS || 3000),
        openCdpTimeoutMs: Number(process.env.BROWSER_FLOW_OPEN_CDP_TIMEOUT_MS || 15000),
        allowLaunchServicesFallback: canUseLaunchServices,
        preferLaunchServices: canUseLaunchServices,
        artifactsAbsDir: artifactsDir,
        outputPath
      },
      null,
      2
    )}\n`
  );

  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `(${directEvalMain.toString()})()`, inputPath], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    timeout: getBrowserCommandTimeoutMs() + 10000,
    env: getDirectEvalEnv()
  });

  if (fs.existsSync(outputPath)) {
    const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (result.status !== 0 && payload.status === "passed") {
      payload.setupGaps ||= [];
      payload.setupGaps.push(`direct_eval_exit_status:${result.status ?? "unknown"}`);
    }
    return payload;
  }

  const stderr = [result.stderr || "", result.error ? String(result.error.message || result.error) : ""].filter(Boolean).join("\n").trim();
  return {
    runId: args.runId,
    status: "setup_gap",
    targetUrl: flow.targetUrl,
    flowName: flow.name,
    critical: flow.critical,
    evidenceDepth: "smoke",
    steps: [],
    artifacts: {},
    setupGaps: [stderr || `direct_eval_no_output:${result.status ?? "unknown"}`],
    failures: [],
    runtime: "playwright-direct-eval"
  };
}

async function runFlow(args, flow) {
  const failures = [];
  const setupGaps = [];
  const steps = [];
  const artifactPaths = {};
  let lastSnapshot = null;
  let status = "passed";

  if (args.forceDirect || process.env.BROWSER_FLOW_FORCE_PLAYWRIGHT_DIRECT === "1") {
    return runFlowDirect(args, flow, "forced_direct_playwright");
  }

  if (!flow.targetUrl) {
    status = "setup_gap";
    setupGaps.push("missing_target_url");
  }
  if (!fs.existsSync(args.browserctl)) {
    status = "setup_gap";
    setupGaps.push(`missing_browserctl:${args.browserctl}`);
  }

  if (status === "passed") {
    const started = shell(args.browserctl, ["start"]);
    if (!started.ok) {
      const startupMessage = started.stderr.trim() || started.stdout.trim() || "browserctl_start_failed";
      status =
        started.status === 64 ||
        startupMessage.includes("ETIMEDOUT") ||
        startupMessage.includes("browserd startup failed") ||
        startupMessage.includes("browserd_startup_timeout") ||
        startupMessage.includes("startup already in progress") ||
        startupMessage.includes("Timed out waiting for browserd") ||
        startupMessage.includes("Executable doesn't exist") ||
        startupMessage.includes("Playwright runtime not installed")
          ? "setup_gap"
          : "failed";
      (status === "setup_gap" ? setupGaps : failures).push(started.stderr.trim() || started.stdout.trim() || "browserctl_start_failed");
      if (status === "setup_gap") {
        releaseFailedBrowserStartupLock();
      }
    }
  }

  if (status === "setup_gap" && process.env.BROWSER_FLOW_DISABLE_PLAYWRIGHT_FALLBACK !== "1") {
    return runFlowDirect(args, flow, setupGaps.join(";"));
  }

  if (status === "passed") {
    for (const [index, step] of flow.steps.entries()) {
      const action = String(step.action || "snapshot");
      const result = { index: index + 1, action, status: "passed" };
      if (step.recover === true || step.recover === "true") result.recover = true;
      try {
        if (action === "goto") {
          const target = step.url || flow.targetUrl;
          const run = shell(args.browserctl, ["goto", target, "--json"]);
          if (!run.ok) throw new Error(run.stderr || run.stdout || "goto_failed");
          result.output = readJsonMaybe(run.stdout) || run.stdout.trim();
        } else if (action === "snapshot") {
          const run = shell(args.browserctl, ["snapshot", "--json"]);
          if (!run.ok) throw new Error(run.stderr || run.stdout || "snapshot_failed");
          lastSnapshot = readJsonMaybe(run.stdout);
          result.refCount = lastSnapshot?.refs?.length ?? 0;
        } else if (action === "click" || action === "type") {
          if (!lastSnapshot) {
            const snap = shell(args.browserctl, ["snapshot", "--json"]);
            if (!snap.ok) throw new Error(snap.stderr || snap.stdout || "snapshot_failed");
            lastSnapshot = readJsonMaybe(snap.stdout);
          }
          const ref = resolveRef(lastSnapshot, step.target || step.targetRef || step.ref);
          if (!ref) throw new Error(`target_not_found:${JSON.stringify(step.target || step.targetRef || step.ref)}`);
          result.targetRef = ref;
          const run =
            action === "click"
              ? shell(args.browserctl, ["click", ref])
              : shell(args.browserctl, ["type", ref, String(step.text || step.value || "")]);
          if (!run.ok) throw new Error(run.stderr || run.stdout || `${action}_failed`);
          result.output = readJsonMaybe(run.stdout) || run.stdout.trim();
          lastSnapshot = null;
        } else if (action === "screenshot") {
          const screenshotPath = path.join(".claude", "browser-artifacts", `${flow.name}.png`);
          const run = shell(args.browserctl, ["screenshot", screenshotPath, "--json"]);
          if (!run.ok) throw new Error(run.stderr || run.stdout || "screenshot_failed");
          artifactPaths.screenshot = screenshotPath;
          result.artifact = screenshotPath;
        } else if (action === "console" || action === "network") {
          const artifactPath = path.join(".claude", "browser-artifacts", `${flow.name}-${action}.json`);
          const run = shell(args.browserctl, [action, "--json"]);
          if (!run.ok) throw new Error(run.stderr || run.stdout || `${action}_failed`);
          fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
          fs.writeFileSync(artifactPath, run.stdout || "{}\n");
          artifactPaths[action] = artifactPath;
          result.artifact = artifactPath;
        } else {
          throw new Error(`unsupported_action:${action}`);
        }
      } catch (error) {
        result.status = "failed";
        result.error = String(error?.message || error);
        failures.push(`step_${index + 1}_${action}:${result.error}`);
        status = "failed";
      }
      steps.push(result);
      if (status === "failed") break;
    }
  }

  const evidenceDepth = classifyEvidenceDepth(steps);
  if (flow.critical && evidenceDepth === "smoke" && status === "passed") {
    failures.push("critical_flow_smoke_only");
    status = "failed";
  }

  return {
    runId: args.runId,
    status,
    targetUrl: flow.targetUrl,
    flowName: flow.name,
    critical: flow.critical,
    evidenceDepth,
    steps,
    artifacts: artifactPaths,
    setupGaps,
    failures
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help") {
    usage();
    return 0;
  }

  fs.mkdirSync(artifactsDir, { recursive: true });
  const flow = loadDeclaredFlow(args);
  const verdict = attachVisualDiff(args, flow, await runFlow(args, flow));
  writeVerdict(args.output, verdict);
  process.stdout.write(`${args.output}\n`);
  if (verdict.status === "passed") return 0;
  if (verdict.status === "setup_gap") return 64;
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    const args = parseArgs(process.argv.slice(2).filter((item) => item !== "--help" && item !== "-h"));
    const payload = {
      runId: args.runId,
      status: "failed",
      targetUrl: args.url || "",
      flowName: args.flow || args.command || "",
      critical: false,
      evidenceDepth: "smoke",
      steps: [],
      artifacts: {},
      setupGaps: [],
      failures: [String(error?.message || error)]
    };
    writeVerdict(args.output, payload);
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.stdout.write(`${args.output}\n`);
    process.exit(1);
  });
