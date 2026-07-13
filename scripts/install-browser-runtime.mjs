#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');

function defaultProfileHome() {
  const injectedHome = process.env.MOONSHOT_BROWSER_PROFILE_HOME;
  return injectedHome ? path.resolve(injectedHome) : os.homedir();
}

function candidateRuntimeRoots() {
  const moonshotHome = process.env.MOONSHOT_RELAY_HOME
    ? path.resolve(process.env.MOONSHOT_RELAY_HOME)
    : path.join(os.homedir(), '.moonshot-relay');
  return [
    rootDir,
    moonshotHome,
    path.join(rootDir, '.claude'),
  ];
}

function browserRuntimeFor(runtimeRoot) {
  const browserctl = path.join(runtimeRoot, 'bin', 'browserctl');
  const nodeClient = path.join(runtimeRoot, 'tools', 'browserd', 'client.mjs');
  const pythonEntry = path.join(runtimeRoot, 'tools', 'browserd', 'browserctl.py');
  return { runtimeRoot, browserctl, nodeClient, pythonEntry };
}

function resolveBrowserRuntime(runtimeRoots) {
  const candidates = runtimeRoots.map(browserRuntimeFor);
  return candidates.find((candidate) => (
    fs.existsSync(candidate.browserctl)
    && (fs.existsSync(candidate.nodeClient) || fs.existsSync(candidate.pythonEntry))
  )) || candidates[0];
}

const runtimeRoots = candidateRuntimeRoots();
const browserRuntime = resolveBrowserRuntime(runtimeRoots);
const localBrowserctl = browserRuntime.browserctl;
const nodeClient = browserRuntime.nodeClient;
const pythonEntry = browserRuntime.pythonEntry;

const profileHome = defaultProfileHome();
const state = {
  force: false,
  profileHome,
  binDir: path.join(profileHome, '.local', 'bin'),
  binDirExplicit: false,
};

function usage() {
  const target = process.platform === 'win32'
    ? path.join(state.binDir, 'browserctl.cmd')
    : path.join(state.binDir, 'browserctl');
  console.log(`Usage:
  install-browser-runtime.sh [--bin-dir <dir>] [--profile-home <dir>] [--force]

Profile home:
  ${state.profileHome}

Default target:
  ${target}`);
}

function parseArgs(argv) {
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--bin-dir':
        state.binDir = args.shift() ?? state.binDir;
        state.binDirExplicit = true;
        break;
      case '--bin-dir=':
        state.binDir = arg.slice('--bin-dir='.length);
        break;
      case '--force':
        state.force = true;
        break;
      case '--profile-home': {
        const value = args.shift();
        if (!value) {
          console.error('Missing value for --profile-home');
          usage();
          process.exit(64);
        }
        state.profileHome = path.resolve(value);
        if (!state.binDirExplicit) {
          state.binDir = path.join(state.profileHome, '.local', 'bin');
        }
        break;
      }
      case '--help':
      case '-h':
        usage();
        process.exit(0);
      default:
        if (arg.startsWith('--bin-dir=')) {
          state.binDir = arg.slice('--bin-dir='.length);
          state.binDirExplicit = true;
          break;
        }
        if (arg.startsWith('--profile-home=')) {
          const value = arg.slice('--profile-home='.length);
          if (!value) {
            console.error('Missing value for --profile-home');
            usage();
            process.exit(64);
          }
          state.profileHome = path.resolve(value);
          if (!state.binDirExplicit) {
            state.binDir = path.join(state.profileHome, '.local', 'bin');
          }
          break;
        }
        console.error(`Unknown argument: ${arg}`);
        usage();
        process.exit(64);
    }
  }
}

function assertInputs() {
  if (!fs.existsSync(localBrowserctl)) {
    console.error(`Missing executable browserctl. Checked: ${runtimeRoots.map((runtimeRoot) => path.join(runtimeRoot, 'bin', 'browserctl')).join(', ')}`);
    process.exit(64);
  }
  if (!fs.existsSync(nodeClient) && !fs.existsSync(pythonEntry)) {
    console.error(`Missing browser runtime entrypoints. Checked: ${runtimeRoots.map((runtimeRoot) => path.join(runtimeRoot, 'tools', 'browserd')).join(', ')}`);
    process.exit(64);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileContentsMatch(filePath, expected) {
  try {
    return fs.readFileSync(filePath, 'utf8') === expected;
  } catch {
    return false;
  }
}

function removeIfForced(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  if (!state.force) {
    console.error(`Target already exists: ${targetPath}`);
    console.error('Re-run with --force to replace it.');
    process.exit(65);
  }
  fs.rmSync(targetPath, { force: true });
}

function installPosix() {
  const targetLink = path.join(state.binDir, 'browserctl');
  const targetEnvFile = path.join(state.binDir, 'env');

  ensureDir(state.binDir);

  if (fs.existsSync(targetLink) || fs.lstatSync(targetLink, { throwIfNoEntry: false })) {
    try {
      if (fs.lstatSync(targetLink).isSymbolicLink() && fs.readlinkSync(targetLink) === localBrowserctl) {
        console.log(`browserctl already linked at ${targetLink}`);
      } else {
        removeIfForced(targetLink);
      }
    } catch {
      removeIfForced(targetLink);
    }
  }

  try {
    if (!fs.existsSync(targetLink)) {
      fs.symlinkSync(localBrowserctl, targetLink);
      console.log(`Installed browserctl -> ${targetLink}`);
    }
  } catch {
    const shim = `#!/usr/bin/env sh\nexec "${localBrowserctl}" "$@"\n`;
    fs.writeFileSync(targetLink, shim, 'utf8');
    fs.chmodSync(targetLink, 0o755);
    console.log(`Installed browserctl shim -> ${targetLink}`);
  }

  const envScript = `#!/usr/bin/env sh
case ":\$PATH:" in
  *:"${state.binDir}":*)
    ;;
  *)
    export PATH="${state.binDir}:\$PATH"
    ;;
esac
`;
  fs.writeFileSync(targetEnvFile, envScript, 'utf8');
  fs.chmodSync(targetEnvFile, 0o644);

  const profileWarnings = [];
  for (const profile of ['.zprofile', '.bash_profile', '.profile']) {
    const profilePath = path.join(state.profileHome, profile);
    const sourceLine = `. "${targetEnvFile}"`;
    let current = '';
    try {
      current = fs.readFileSync(profilePath, 'utf8');
    } catch {
      current = '';
    }
    if (!current.includes(sourceLine)) {
      const next = `${current}${current.endsWith('\n') || current.length === 0 ? '' : '\n'}# Ensure browser runtime binaries are available\n${sourceLine}\n`;
      try {
        fs.writeFileSync(profilePath, next, 'utf8');
      } catch (error) {
        profileWarnings.push(`${profilePath}: ${error.code || error.message}`);
      }
    }
  }

  console.log(`Installed PATH env helper -> ${targetEnvFile}`);
  for (const warning of profileWarnings) {
    console.log(`WARN: could not update profile automatically: ${warning}`);
  }
  if (process.env.PATH.split(path.delimiter).includes(state.binDir)) {
    console.log(`Resolved on PATH: ${targetLink}`);
  } else {
    console.log('browserctl is installed, but the current shell does not resolve it on PATH.');
    console.log('Open a new login shell or source ~/.local/bin/env manually.');
  }
}

function windowsCmdShim() {
  return `@echo off
setlocal
set "NODE_CLIENT=${nodeClient.replace(/\//g, '\\')}"
set "PYTHON_ENTRY=${pythonEntry.replace(/\//g, '\\')}"
set "NODE_BIN=%BROWSERCTL_NODE_BIN%"
if not defined NODE_BIN set "NODE_BIN=node"
if exist "%NODE_CLIENT%" (
  "%NODE_BIN%" "%NODE_CLIENT%" %*
  set "EXITCODE=%ERRORLEVEL%"
  if not "%EXITCODE%"=="9009" exit /b %EXITCODE%
)
if exist "%PYTHON_ENTRY%" (
  py -3 "%PYTHON_ENTRY%" %*
  exit /b %ERRORLEVEL%
)
echo browserctl runtime entrypoints not found 1>&2
exit /b 1
`;
}

function windowsPowerShellShim() {
  return `$NodeClient = '${nodeClient.replace(/'/g, "''")}'
$PythonEntry = '${pythonEntry.replace(/'/g, "''")}'
$NodeBin = if ($env:BROWSERCTL_NODE_BIN) { $env:BROWSERCTL_NODE_BIN } else { 'node' }
if (Test-Path $NodeClient) {
  & $NodeBin $NodeClient @args
  if ($LASTEXITCODE -ne 9009) { exit $LASTEXITCODE }
}
if (Test-Path $PythonEntry) {
  & py -3 $PythonEntry @args
  exit $LASTEXITCODE
}
Write-Error "browserctl runtime entrypoints not found"
exit 1
`;
}

function installWindows() {
  ensureDir(state.binDir);
  const cmdPath = path.join(state.binDir, 'browserctl.cmd');
  const ps1Path = path.join(state.binDir, 'browserctl.ps1');
  const cmdContents = windowsCmdShim();
  const ps1Contents = windowsPowerShellShim();

  if (fs.existsSync(cmdPath) && !fileContentsMatch(cmdPath, cmdContents)) {
    removeIfForced(cmdPath);
  }
  if (fs.existsSync(ps1Path) && !fileContentsMatch(ps1Path, ps1Contents)) {
    removeIfForced(ps1Path);
  }

  if (!fs.existsSync(cmdPath)) {
    fs.writeFileSync(cmdPath, cmdContents, 'utf8');
  }
  if (!fs.existsSync(ps1Path)) {
    fs.writeFileSync(ps1Path, ps1Contents, 'utf8');
  }

  console.log(`Installed browserctl.cmd -> ${cmdPath}`);
  console.log(`Installed browserctl.ps1 -> ${ps1Path}`);
  console.log('Windows native install posture: no automatic profile or registry PATH mutation.');
  console.log(`Add this directory to PATH manually if needed: ${state.binDir}`);
  console.log('After PATH is updated, reopen PowerShell or CMD and run `browserctl --help`.');
}

parseArgs(process.argv.slice(2));
assertInputs();

if (process.platform === 'win32') {
  installWindows();
} else {
  installPosix();
}
