#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_SANDBOX_ROOT = '.tmp/external-skill-pilots/skills-sh';

const candidates = [
  { tier: 'A', source: 'jwynia/agent-skills', skill: 'requirements-analysis', decision: 'adapt', localTarget: 'product-orchestrator, moonshot-plan-writer, task-slicer' },
  { tier: 'A', source: 'jwynia/agent-skills', skill: 'system-design', decision: 'adapt', localTarget: 'product-orchestrator, moonshot-plan-writer, design gates' },
  { tier: 'A', source: 'obra/superpowers', skill: 'brainstorming', decision: 'adapt', localTarget: 'product-orchestrator, task-slicer' },
  { tier: 'A', source: 'obra/superpowers', skill: 'writing-plans', decision: 'adapt', localTarget: 'moonshot-plan-writer, codex-validate-plan, SPRINT_CONTRACT' },
  { tier: 'A', source: 'obra/superpowers', skill: 'using-git-worktrees', decision: 'adapt', localTarget: 'workspace-isolation-gate, harness-prepare-worktree' },
  { tier: 'A', source: 'obra/superpowers', skill: 'executing-plans', decision: 'adapt', localTarget: 'codex-validate-plan, implementation-runner' },
  { tier: 'A', source: 'obra/superpowers', skill: 'requesting-code-review', decision: 'adapt', localTarget: 'codex-review-code, QA_REPORT' },
  { tier: 'A', source: 'obra/superpowers', skill: 'receiving-code-review', decision: 'adapt', localTarget: 'codex-review-code, QA_REPORT' },
  { tier: 'A', source: 'obra/superpowers', skill: 'verification-before-completion', decision: 'adopt', localTarget: 'completion-verifier, verification-evidence-gate, completion gate' },
  { tier: 'A', source: 'obra/superpowers', skill: 'finishing-a-development-branch', decision: 'adapt', localTarget: 'commit-moonshot, session-logger, HANDOFF' },
  { tier: 'A', source: 'obra/superpowers', skill: 'test-driven-development', decision: 'adopt', localTarget: 'test-driven-development, SPRINT_CONTRACT, QA_REPORT' },
  { tier: 'A', source: 'obra/superpowers', skill: 'systematic-debugging', decision: 'adopt', localTarget: 'failure-analyzer, build-error-resolver, recovery loop' },
  { tier: 'B', source: 'obra/superpowers', skill: 'subagent-driven-development', decision: 'defer', localTarget: 'moonshot-teams-runner, phase execution profiles' },
  { tier: 'B', source: 'obra/superpowers', skill: 'dispatching-parallel-agents', decision: 'defer', localTarget: 'moonshot-teams-runner, team coordination' },
  { tier: 'B', source: 'obra/superpowers', skill: 'writing-skills', decision: 'defer', localTarget: 'skill metadata lint candidate' },
  { tier: 'B', source: 'obra/superpowers', skill: 'using-superpowers', decision: 'defer', localTarget: 'skill selection discipline candidate' },
  { tier: 'B', source: 'skills.sh CLI', skill: 'find-skills', decision: 'defer', localTarget: 'external discovery workflow' },
  { tier: 'B', source: 'callstackincubator/agent-skills', skill: 'validate-skills', decision: 'defer', localTarget: 'skill metadata verifier candidate' },
  { tier: 'C', source: 'othmanadi/planning-with-files', skill: 'planning-with-files', decision: 'adapt', localTarget: 'tasks/progress/findings pattern only' },
  { tier: 'C', source: 'notedit/happy-skills', skill: 'feature-dev', decision: 'defer', localTarget: 'end-to-end feature-dev comparison only' },
  { tier: 'C', source: 'open-horizon-labs/skills', skill: 'review', decision: 'defer', localTarget: 'review rubric comparison only' },
  { tier: 'D', source: 'skills.sh', skill: 'bulk-installation', decision: 'reject', localTarget: 'none' },
  { tier: 'D', source: 'unreviewed external skills', skill: 'hook-shell-network-behavior', decision: 'reject', localTarget: 'none' },
  { tier: 'D', source: 'external skill source', skill: 'direct-public-entrypoint-vendoring', decision: 'reject', localTarget: 'none' },
];

function parseArgs(argv) {
  const options = {
    sandboxRoot: DEFAULT_SANDBOX_ROOT,
    runInstall: false,
    maxInstallCandidates: Number.POSITIVE_INFINITY,
    installTimeoutMs: 20000,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--sandbox-root') {
      options.sandboxRoot = argv[index + 1] || options.sandboxRoot;
      index += 1;
    } else if (arg === '--run-install') {
      options.runInstall = true;
    } else if (arg === '--max-install-candidates') {
      options.maxInstallCandidates = Number.parseInt(argv[index + 1] || '', 10);
      index += 1;
    } else if (arg === '--install-timeout-ms') {
      options.installTimeoutMs = Number.parseInt(argv[index + 1] || '', 10);
      index += 1;
    }
  }
  if (!Number.isFinite(options.maxInstallCandidates) || options.maxInstallCandidates < 0) {
    options.maxInstallCandidates = Number.POSITIVE_INFINITY;
  }
  if (!Number.isFinite(options.installTimeoutMs) || options.installTimeoutMs <= 0) {
    options.installTimeoutMs = 20000;
  }
  return options;
}

function classifyInstallResult(result) {
  if (result.error?.code === 'ETIMEDOUT') {
    return 'network_blocked';
  }
  if (result.status === 0) {
    return 'installed';
  }
  const output = `${result.stderr || ''}\n${result.stdout || ''}`.toLowerCase();
  if (
    output.includes('enotfound')
    || output.includes('eai_again')
    || output.includes('network')
    || output.includes('timeout')
    || output.includes('could not resolve')
    || output.includes('certificate')
  ) {
    return 'network_blocked';
  }
  return 'install_failed';
}

function runInstall(candidate, sandboxRoot, installTimeoutMs) {
  if (!candidate.source.includes('/') || candidate.tier === 'D') {
    return {
      status: 'not_applicable',
      command: '',
      exitCode: null,
      stdout: '',
      stderr: '',
    };
  }

  const args = [
    'skills',
    'add',
    candidate.source,
    '-a',
    'claude-code',
    '-a',
    'codex',
    '--skill',
    candidate.skill,
    '--copy',
    '-y',
  ];
  const result = spawnSync('npx', args, {
    cwd: sandboxRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: path.resolve(sandboxRoot, 'home'),
      CODEX_HOME: path.resolve(sandboxRoot, '.codex'),
    },
    timeout: installTimeoutMs,
  });

  return {
    status: classifyInstallResult(result),
    command: `npx ${args.join(' ')}`,
    exitCode: result.status,
    stdout: String(result.stdout || '').slice(-4000),
    stderr: String(result.stderr || result.error?.message || '').slice(-4000),
  };
}

function listInstalledFiles(sandboxRoot) {
  const roots = [
    path.join(sandboxRoot, '.claude'),
    path.join(sandboxRoot, '.codex'),
    path.join(sandboxRoot, 'home'),
  ];
  const files = [];
  const visit = (dir) => {
    if (!fs.existsSync(dir)) {
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(path.relative(sandboxRoot, fullPath));
      }
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return files.sort();
}

function writeMarkdown(manifest, outputPath, korean = false) {
  const lines = korean
    ? [
      '# 외부 Skills Pilot 결과',
      '',
      `생성 시각: ${manifest.generatedAt}`,
      `Sandbox root: \`${manifest.sandboxRoot}\``,
      `Install 실행: ${manifest.runInstall ? 'yes' : 'no'}`,
      '',
      '| Tier | 후보 | 결정 | 설치 결과 | 로컬 반영 대상 |',
      '|---|---|---|---|---|',
    ]
    : [
      '# External Skills Pilot Results',
      '',
      `Generated: ${manifest.generatedAt}`,
      `Sandbox root: \`${manifest.sandboxRoot}\``,
      `Install executed: ${manifest.runInstall ? 'yes' : 'no'}`,
      '',
      '| Tier | Candidate | Decision | Install Result | Local Patch Target |',
      '|---|---|---|---|---|',
    ];

  for (const item of manifest.candidates) {
    lines.push(`| ${item.tier} | \`${item.source}:${item.skill}\` | ${item.decision} | ${item.install.status} | ${item.localTarget} |`);
  }

  lines.push(
    '',
    korean ? '## 보안/운영 원칙' : '## Safety Rules',
    '',
    korean
      ? '- Production `.claude/skills`에는 외부 skill을 bulk install하지 않는다.'
      : '- Do not bulk install external skills into production `.claude/skills`.',
    korean
      ? '- hook/shell/network 동작이 있는 skill은 보안 검토 전 allowlist에 넣지 않는다.'
      : '- Do not allowlist skills with hook/shell/network behavior before security review.',
    korean
      ? '- `network_blocked`는 실패가 아니라 재현 가능한 pilot evidence로 기록한다.'
      : '- Treat `network_blocked` as reproducible pilot evidence, not as a production failure.',
    '',
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const options = parseArgs(process.argv);
  const sandboxRoot = path.resolve(options.sandboxRoot);
  fs.mkdirSync(sandboxRoot, { recursive: true });
  fs.mkdirSync(path.join(sandboxRoot, 'home'), { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    sandboxRoot: path.relative(process.cwd(), sandboxRoot) || sandboxRoot,
    runInstall: options.runInstall,
    maxInstallCandidates: Number.isFinite(options.maxInstallCandidates) ? options.maxInstallCandidates : 'all',
    installTimeoutMs: options.installTimeoutMs,
    policy: {
      productionInstall: false,
      publicEntrypointVendoring: false,
      sandboxOnly: true,
    },
    candidates: candidates.map((candidate, index) => {
      const shouldAttemptInstall = options.runInstall
        && candidate.tier !== 'D'
        && index < options.maxInstallCandidates;
      const install = shouldAttemptInstall
        ? runInstall(candidate, sandboxRoot, options.installTimeoutMs)
        : { status: candidate.tier === 'D' ? 'not_applicable' : 'not_run', command: '', exitCode: null, stdout: '', stderr: '' };
      return {
        ...candidate,
        install,
        hookShellNetworkBehavior: 'requires source review after sandbox install',
        securityNotes: candidate.tier === 'D' ? 'rejected for default path' : 'do not promote without allowlist review',
      };
    }),
  };

  manifest.installedFiles = listInstalledFiles(sandboxRoot);

  fs.writeFileSync(
    path.join(sandboxRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  writeMarkdown(manifest, 'docs/claude-tasks/external-harness-adoption/pilot-results.md');
  writeMarkdown(manifest, 'docs/claude-tasks/external-harness-adoption/pilot-results.ko.md', true);

  process.stdout.write(`${path.join(sandboxRoot, 'manifest.json')}\n`);
}

main();
