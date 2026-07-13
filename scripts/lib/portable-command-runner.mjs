import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export class PortableCommandError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'PortableCommandError';
    this.code = code;
    this.details = details;
  }
}

const pathKey = (target, platform) => (
  platform === 'win32' ? path.resolve(target).toLowerCase() : path.resolve(target)
);

const canonicalRegularFile = (target, label) => {
  try {
    if (!path.isAbsolute(target || '')) throw new Error('path is not absolute');
    const info = lstatSync(target);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('path is not a non-reparse regular file');
    return realpathSync.native(target);
  } catch (error) {
    throw new PortableCommandError(
      'PORTABLE_NPM_INSTALL_IDENTITY_INVALID',
      `${label} is not a canonical non-reparse regular file: ${target}`,
      { cause: error.message },
    );
  }
};

const assertInsideNonReparseRoot = (root, target, platform) => {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new PortableCommandError('PORTABLE_NPM_LAYOUT_INVALID', `npm path is outside the trusted Node installation: ${target}`);
  }
  let cursor = root;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new PortableCommandError('PORTABLE_NPM_REPARSE_REJECTED', `npm installation contains a symlink/reparse component: ${cursor}`);
    }
  }
  if (pathKey(realpathSync.native(target), platform) !== pathKey(target, platform)) {
    throw new PortableCommandError('PORTABLE_NPM_REPARSE_REJECTED', `npm path canonicalizes outside its lexical installation layout: ${target}`);
  }
};

const pathEntries = (env) => String(env.PATH || env.Path || env.path || '')
  .split(path.delimiter)
  .map((entry) => entry.replace(/^"|"$/g, ''))
  .filter(Boolean);

const findOnPath = (name, env) => {
  for (const directory of pathEntries(env)) {
    const candidate = path.resolve(directory, name);
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Continue to the next PATH entry.
    }
  }
  return undefined;
};

export const parsePortableCommandChain = (command) => {
  if (typeof command !== 'string' || !command.trim()) {
    throw new PortableCommandError('PORTABLE_COMMAND_EMPTY', 'Command must be a nonempty string');
  }
  const segments = [];
  let argv = [];
  let token = '';
  let quote = '';
  let tokenStarted = false;
  const pushToken = () => {
    if (tokenStarted) argv.push(token);
    token = '';
    tokenStarted = false;
  };
  const pushSegment = () => {
    pushToken();
    if (!argv.length) throw new PortableCommandError('PORTABLE_COMMAND_EMPTY_SEGMENT', 'Command chain contains an empty segment');
    segments.push(argv);
    argv = [];
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) {
        quote = '';
        tokenStarted = true;
      } else if (char === '\\' && command[index + 1] === quote) {
        token += quote;
        tokenStarted = true;
        index += 1;
      } else {
        token += char;
        tokenStarted = true;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
    } else if (/\s/u.test(char)) {
      pushToken();
    } else if (char === '&' && command[index + 1] === '&') {
      pushSegment();
      index += 1;
    } else if ('&|;<>'.includes(char)) {
      throw new PortableCommandError('PORTABLE_COMMAND_METACHAR_REJECTED', `Unquoted shell metacharacter is forbidden: ${char}`);
    } else {
      token += char;
      tokenStarted = true;
    }
  }
  if (quote) throw new PortableCommandError('PORTABLE_COMMAND_UNTERMINATED_QUOTE', `Unterminated ${quote} quote`);
  pushSegment();
  return segments;
};

const trustedWindowsNodeInstall = ({ execPath, platform }) => {
  const nodeExecutable = canonicalRegularFile(path.resolve(execPath), 'Selected Node executable');
  const nodeRoot = realpathSync.native(path.dirname(nodeExecutable));
  const npmCliExpected = path.join(nodeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const npmCli = canonicalRegularFile(npmCliExpected, 'Trusted npm CLI');
  assertInsideNonReparseRoot(nodeRoot, npmCliExpected, platform);
  if (pathKey(npmCli, platform) !== pathKey(npmCliExpected, platform)) {
    throw new PortableCommandError('PORTABLE_NPM_LAYOUT_INVALID', 'Trusted npm CLI canonical path does not match the standard Node installation layout');
  }

  const packagePath = path.join(nodeRoot, 'node_modules', 'npm', 'package.json');
  const canonicalPackage = canonicalRegularFile(packagePath, 'Trusted npm package metadata');
  assertInsideNonReparseRoot(nodeRoot, packagePath, platform);
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(canonicalPackage, 'utf8'));
  } catch (error) {
    throw new PortableCommandError('PORTABLE_NPM_METADATA_INVALID', `Unable to parse trusted npm package metadata: ${error.message}`);
  }
  const npmBin = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin?.npm;
  if (metadata.name !== 'npm' || String(npmBin || '').replaceAll('\\', '/') !== 'bin/npm-cli.js') {
    throw new PortableCommandError('PORTABLE_NPM_METADATA_INVALID', 'Trusted npm package metadata must declare name npm and bin/npm-cli.js');
  }
  return { nodeExecutable, nodeRoot, npmCli };
};

const resolveWindowsNpmCli = ({ env, execPath, platform }) => {
  const trusted = trustedWindowsNodeInstall({ execPath, platform });
  if (env.npm_execpath) {
    const hinted = path.resolve(env.npm_execpath);
    if (path.basename(hinted).toLowerCase() === 'npm-cli.js' && pathKey(hinted, platform) === pathKey(trusted.npmCli, platform)) {
      const canonicalHint = canonicalRegularFile(hinted, 'npm_execpath');
      if (pathKey(canonicalHint, platform) !== pathKey(trusted.npmCli, platform)) {
        throw new PortableCommandError('PORTABLE_NPM_EXECPATH_UNTRUSTED', 'npm_execpath canonical identity differs from the trusted npm CLI');
      }
      return trusted.npmCli;
    }
  }

  const npmCmd = findOnPath('npm.cmd', env);
  if (!npmCmd) throw new PortableCommandError('PORTABLE_NPM_CLI_NOT_FOUND', 'Trusted npm.cmd was not found on PATH');
  const canonicalCmd = canonicalRegularFile(npmCmd, 'PATH npm.cmd');
  const expectedCmd = path.join(trusted.nodeRoot, 'npm.cmd');
  assertInsideNonReparseRoot(trusted.nodeRoot, expectedCmd, platform);
  if (pathKey(npmCmd, platform) !== pathKey(expectedCmd, platform) || pathKey(canonicalCmd, platform) !== pathKey(expectedCmd, platform)) {
    throw new PortableCommandError('PORTABLE_NPM_LAUNCHER_UNTRUSTED', `PATH npm.cmd is not anchored to the selected Node installation: ${npmCmd}`);
  }
  return trusted.npmCli;
};

export const resolvePortableCommand = (argv, {
  env = process.env,
  platform = process.platform,
  execPath = process.execPath,
} = {}) => {
  if (!Array.isArray(argv) || !argv.length || !argv[0]) {
    throw new PortableCommandError('PORTABLE_COMMAND_EMPTY', 'Command argv must be nonempty');
  }
  const [requested, ...args] = argv;
  const base = path.basename(requested).toLowerCase();
  if (/\.(?:cmd|bat)$/iu.test(base)) {
    throw new PortableCommandError('PORTABLE_BATCH_LAUNCHER_REJECTED', `Explicit batch launcher is forbidden: ${requested}`);
  }
  if (base === 'node' || base === 'node.exe' || path.resolve(requested) === path.resolve(execPath)) {
    return { requested, executable: execPath, args, kind: 'node', shell: false };
  }
  if (base === 'npm') {
    if (platform === 'win32') {
      const npmCli = resolveWindowsNpmCli({ env, execPath, platform });
      return { requested, executable: execPath, args: [npmCli, ...args], kind: 'npm-js', npmCli, shell: false };
    }
    return { requested, executable: requested, args, kind: 'native', shell: false };
  }
  if (platform === 'win32' && ['npx', 'pnpm', 'yarn'].includes(base)) {
    throw new PortableCommandError('PORTABLE_PACKAGE_LAUNCHER_UNSUPPORTED', `${base} requires a verified JavaScript entrypoint`);
  }
  return { requested, executable: requested, args, kind: 'native', shell: false };
};

export const spawnPortableCommandSync = (argv, {
  cwd = process.cwd(),
  env = process.env,
  platform = process.platform,
  execPath = process.execPath,
  maxBuffer = 64 * 1024 * 1024,
} = {}) => {
  const resolved = resolvePortableCommand(argv, { env, platform, execPath });
  const child = spawnSync(resolved.executable, resolved.args, {
    cwd,
    env,
    encoding: 'utf8',
    shell: false,
    maxBuffer,
  });
  const error = child.error ? {
    code: child.error.code || 'PORTABLE_CHILD_LAUNCH_FAILED',
    message: child.error.message || String(child.error),
  } : undefined;
  return {
    ...child,
    resolved,
    error,
    diagnostic: error ? `${error.code}: ${error.message}\n` : '',
    status: child.status ?? (error ? 127 : 1),
  };
};
