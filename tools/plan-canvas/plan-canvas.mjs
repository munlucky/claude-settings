#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const normalizePath = (value = '') => String(value).replaceAll('\\', '/');

export const defaultCanvasOutput = ({ repoRoot = process.cwd(), planDir }) => {
  const slug = path.basename(planDir);
  return path.join(repoRoot, '.moonshot-relay', 'plan-canvas', slug, 'index.html');
};

export const listPlanSourceFiles = async (planDir) => {
  const files = await readdir(planDir);
  return files
    .filter((file) => /^00-master-plan-v\d+\.md$/.test(file) || /^\d{2}-.*\.md$/.test(file) || file.endsWith('.yaml') || file.endsWith('.yml'))
    .sort();
};

const renderMarkdownPreview = (content) => content
  .split(/\r?\n/)
  .map((line) => {
    if (/^#\s+/.test(line)) return `<h1>${escapeHtml(line.replace(/^#\s+/, ''))}</h1>`;
    if (/^##\s+/.test(line)) return `<h2>${escapeHtml(line.replace(/^##\s+/, ''))}</h2>`;
    if (/^###\s+/.test(line)) return `<h3>${escapeHtml(line.replace(/^###\s+/, ''))}</h3>`;
    if (/^\s*-\s+/.test(line)) return `<li>${escapeHtml(line.replace(/^\s*-\s+/, ''))}</li>`;
    if (line.trim() === '') return '';
    return `<p>${escapeHtml(line)}</p>`;
  })
  .join('\n');

export const renderPlanCanvas = async ({ planDir, repoRoot = process.cwd(), generatedAt = new Date().toISOString() }) => {
  const files = await listPlanSourceFiles(planDir);
  const sections = [];
  for (const file of files) {
    const absolute = path.join(planDir, file);
    const content = await readFile(absolute, 'utf8');
    sections.push({
      file,
      content,
      html: renderMarkdownPreview(content),
    });
  }

  const relativePlanDir = normalizePath(path.relative(repoRoot, planDir)) || '.';
  const body = sections.map((section) => [
    `<section class="plan-file" data-source-file="${escapeHtml(section.file)}">`,
    `<header><h2>${escapeHtml(section.file)}</h2><code>${escapeHtml(relativePlanDir)}/${escapeHtml(section.file)}</code></header>`,
    `<div class="source-preview">${section.html}</div>`,
    '</section>',
  ].join('\n')).join('\n');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Moonshot Plan Canvas</title>',
    '<style>',
    'body{font-family:Arial,sans-serif;margin:0;color:#202124;background:#f7f8fa;}',
    'main{max-width:1120px;margin:0 auto;padding:24px;}',
    '.notice{border:1px solid #b8c1d1;background:#fff;padding:12px;margin-bottom:16px;}',
    '.plan-file{background:#fff;border:1px solid #d9dee8;margin:12px 0;padding:16px;}',
    'header{display:flex;justify-content:space-between;gap:12px;align-items:baseline;border-bottom:1px solid #eceff4;margin-bottom:12px;}',
    'h1,h2,h3{letter-spacing:0;}',
    'code{font-size:12px;color:#526070;}',
    'p,li{line-height:1.45;}',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    '<h1>Moonshot Plan Canvas</h1>',
    `<div class="notice" data-source-truth="markdown_yaml_plan_package">Generated at ${escapeHtml(generatedAt)} from ${escapeHtml(relativePlanDir)}. Markdown/YAML remain source truth; this canvas is derived output.</div>`,
    body,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
};

export const writePlanCanvas = async ({ planDir, out = '', repoRoot = process.cwd() }) => {
  const target = out || defaultCanvasOutput({ repoRoot, planDir });
  const html = await renderPlanCanvas({ planDir, repoRoot });
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, 'utf8');
  return { status: 'rendered', out: normalizePath(path.relative(repoRoot, target)), sourceTruth: 'markdown_yaml_plan_package' };
};

export const buildFeedbackReceipt = ({ planDir, generatedFrom = '', items = [], repoRoot = process.cwd() }) => ({
  schemaVersion: 1,
  artifactId: 'PLAN_CANVAS_FEEDBACK',
  planDir: normalizePath(path.relative(repoRoot, planDir)) || normalizePath(planDir),
  sourceTruth: 'markdown_yaml_plan_package',
  generatedFrom: normalizePath(generatedFrom),
  items,
});

export const buildRevisionProposal = ({ feedback, createdAt = new Date().toISOString() }) => {
  const actionable = (feedback.items || []).filter((item) => item.disposition === 'needs_revision');
  return {
    schemaVersion: 1,
    artifactId: 'PLAN_REVISION_PROPOSAL',
    sourceTruth: 'markdown_yaml_plan_package',
    mutatesSource: false,
    createdAt,
    targetPlanDir: feedback.planDir,
    proposedChanges: actionable.map((item) => ({
      feedbackId: item.id,
      file: item.target.file,
      heading: item.target.heading || '',
      comment: item.comment,
      instruction: 'Apply through a reviewed plan revision in the source Markdown/YAML package.',
    })),
  };
};

const usage = () => 'Usage: node tools/plan-canvas/plan-canvas.mjs render --plan-dir <dir> [--out <index.html>] [--json]\n       node tools/plan-canvas/plan-canvas.mjs feedback --plan-dir <dir> --items-json <json-array> [--generated-from <path>] [--out <feedback.json>] [--json]\n       node tools/plan-canvas/plan-canvas.mjs revision-proposal --feedback <feedback.json> [--out <proposal.json>] [--json]';

const parseArgs = (argv) => {
  const options = { command: argv[0] || '', json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--plan-dir') options.planDir = argv[++index] || '';
    else if (arg === '--out') options.out = argv[++index] || '';
    else if (arg === '--items-json') options.itemsJson = argv[++index] || '';
    else if (arg === '--generated-from') options.generatedFrom = argv[++index] || '';
    else if (arg === '--feedback') options.feedback = argv[++index] || '';
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.command === 'render') {
    if (!args.planDir) throw new Error(`Missing --plan-dir\n${usage()}`);
    const result = await writePlanCanvas({ planDir: path.resolve(args.planDir), out: args.out ? path.resolve(args.out) : '' });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.out);
    return;
  }
  if (args.command === 'feedback') {
    if (!args.planDir || !args.itemsJson) throw new Error(`Missing --plan-dir or --items-json\n${usage()}`);
    const receipt = buildFeedbackReceipt({
      planDir: path.resolve(args.planDir),
      generatedFrom: args.generatedFrom || '',
      items: JSON.parse(args.itemsJson),
    });
    if (args.out) {
      await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
      await writeFile(path.resolve(args.out), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    }
    if (args.json) console.log(JSON.stringify({ status: 'recorded', feedback: receipt, wrote: args.out || '' }, null, 2));
    else console.log('recorded');
    return;
  }
  if (args.command === 'revision-proposal') {
    if (!args.feedback) throw new Error(`Missing --feedback\n${usage()}`);
    const feedback = JSON.parse(await readFile(path.resolve(args.feedback), 'utf8'));
    const proposal = buildRevisionProposal({ feedback });
    if (args.out) {
      await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
      await writeFile(path.resolve(args.out), `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
    }
    if (args.json) console.log(JSON.stringify({ status: 'proposed', proposal, wrote: args.out || '' }, null, 2));
    else console.log('proposed');
    return;
  }
  throw new Error(`Unknown command: ${args.command}\n${usage()}`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
