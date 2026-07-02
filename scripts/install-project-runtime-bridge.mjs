#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const usage = () => `Usage: node scripts/install-project-runtime-bridge.mjs [--target <project-root>] [--plan-package <docs/implementation/slug-or-account-root-package>] [--dry-run] [--json]`;

const parseArgs = (argv) => {
  const options = {
    target: process.cwd(),
    planPackage: '',
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--target') {
      options.target = path.resolve(argv[++index] || '');
    } else if (arg === '--plan-package') {
      options.planPackage = argv[++index] || '';
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  return options;
};

const portable = (value) => value.split(path.sep).join('/');

const shim = (targetRelative) => {
  const encodedTargetRelative = JSON.stringify(targetRelative);
  return `#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const relayHome = process.env.MOONSHOT_RELAY_HOME || path.join(os.homedir(), '.moonshot-relay');
process.env.MOONSHOT_RELAY_STATE_ROOT ||= path.resolve(process.cwd(), '.moonshot-relay', 'state');
const target = path.join(relayHome, ...${encodedTargetRelative});
process.argv[1] = target;
await import(pathToFileURL(target).href);
`;
};

const filesForTarget = () => ({
  [path.join('scripts', 'runtime-state.mjs')]: shim(['scripts', 'runtime-state.mjs']),
  [path.join('scripts', 'prepare-phase-runner-state.mjs')]: shim(['scripts', 'prepare-phase-runner-state.mjs']),
  [path.join('scripts', 'knowledge-context-build.mjs')]: shim(['scripts', 'knowledge-context-build.mjs']),
  [path.join('tools', 'sandbox', 'policy.mjs')]: shim(['tools', 'sandbox', 'policy.mjs']),
  [path.join('.moonshot-relay', '.gitignore')]: `state/
*.sqlite
*.sqlite-shm
*.sqlite-wal
`,
  'verification.contract.yaml': `schemaVersion: 1
name: project-moonshot-runtime-contract
lastReviewed: ${new Date().toISOString().slice(0, 10)}

runtime:
  relayHome: "\${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}"
  stateRoot: "\${MOONSHOT_RELAY_STATE_ROOT:-.moonshot-relay/state}"
  stateAuthority: "scripts/runtime-state.mjs"
  phaseStateProjection: ".moonshot-relay/docs/phase-status.yaml"
  knowledgeContext: "scripts/knowledge-context-build.mjs"
  phaseRunnerPrepare: "scripts/prepare-phase-runner-state.mjs"
  sandboxPolicy: "tools/sandbox/policy.mjs"

commands:
  runtimeInit: "node scripts/runtime-state.mjs init --json"
  runtimeStatus: "node scripts/runtime-state.mjs status --json"
  knowledgeContextExecute: "node scripts/knowledge-context-build.mjs --stage execute --json"
  sandboxPolicyCheck: "node tools/sandbox/policy.mjs check --json"

contracts:
  - "Project-local entrypoints delegate to MOONSHOT_RELAY_HOME."
  - "Project-local shims default MOONSHOT_RELAY_STATE_ROOT to .moonshot-relay/state so sandboxed runs can use runtime-state without writing to the account root."
  - "runtime-state.sqlite is the completion authority when scripts/runtime-state.mjs is available."
  - ".moonshot-relay/docs/phase-status.yaml is a cursor projection, not completion authority."

degradedFallback:
  allowedOnlyWhen:
    - "MOONSHOT_RELAY_HOME is unavailable"
    - "runtime-state reports degraded status"
  requiredEvidence:
    - ".moonshot-relay/docs/phase-status.yaml"
    - "QA_REPORT.md"
    - "SCORECARD.md"
    - "HANDOFF.md"
  restriction: "Do not claim whole-plan completion from degraded fallback evidence alone."
`,
});

const mergeGitignore = async (targetRoot, planPackage) => {
  if (!planPackage) return null;
  const normalized = portable(planPackage).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized.startsWith('docs/implementation/')) {
    return null;
  }
  const gitignorePath = path.join(targetRoot, '.gitignore');
  let existing = '';
  try {
    existing = await readFile(gitignorePath, 'utf8');
  } catch {
    // A project may not have a .gitignore yet.
  }
  const lines = [
    '',
    '# Moonshot Relay durable plan package evidence',
    '!docs/implementation/',
    `!${normalized}/`,
    `!${normalized}/**`,
  ];
  const additions = lines.filter((line) => line === '' || !existing.split(/\r?\n/).includes(line));
  if (additions.length <= 1) return null;
  return {
    path: '.gitignore',
    content: `${existing.replace(/\s*$/, '')}\n${additions.join('\n')}\n`,
  };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const targetRoot = path.resolve(options.target || process.cwd());
  const planned = filesForTarget();
  const writes = [];

  for (const [relative, content] of Object.entries(planned)) {
    writes.push({ relative, content });
  }

  const gitignorePatch = await mergeGitignore(targetRoot, options.planPackage);
  if (gitignorePatch) writes.push({ relative: gitignorePatch.path, content: gitignorePatch.content });

  if (!options.dryRun) {
    for (const item of writes) {
      const destination = path.join(targetRoot, item.relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, item.content, 'utf8');
    }
  }

  const result = {
    status: 'ready',
    dryRun: options.dryRun,
    target: targetRoot,
    written: writes.map((item) => portable(item.relative)).sort(),
    nextVerification: [
      'node scripts/runtime-state.mjs init --json',
      'node scripts/runtime-state.mjs status --json',
      'node scripts/knowledge-context-build.mjs --stage execute --json',
      'node tools/sandbox/policy.mjs check --json --operation read --path AGENTS.md',
    ],
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.status}: ${result.target}`);
    for (const file of result.written) console.log(`- ${file}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
