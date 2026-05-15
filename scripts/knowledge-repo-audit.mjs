#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const COMPACT_OUTPUT = process.argv.includes('--compact') || String(process.env.TOKEN_OUTPUT_MODE || '').toLowerCase() === 'compact';

function commandStdout(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || (result.status ?? 1) !== 0) {
    return '';
  }
  return (result.stdout ?? '').trim();
}

function resolveRootDir() {
  const harnessRoot = process.env.HARNESS_ROOT_DIR;
  if (harnessRoot && fs.existsSync(harnessRoot) && fs.statSync(harnessRoot).isDirectory()) {
    return path.resolve(harnessRoot);
  }

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.claude/CLAUDE.md')) || fs.existsSync(path.join(cwd, 'AGENTS.md'))) {
    return cwd;
  }

  const gitRoot = commandStdout('git', ['rev-parse', '--show-toplevel']);
  if (gitRoot && (fs.existsSync(path.join(gitRoot, '.claude/CLAUDE.md')) || fs.existsSync(path.join(gitRoot, 'AGENTS.md')))) {
    return gitRoot;
  }

  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? `${fallback}`, 10);
  return Number.isFinite(value) ? value : fallback;
}

function envBoolString(name, fallback = 'false') {
  return String(process.env[name] ?? fallback).toLowerCase() === 'true' ? 'true' : 'false';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatRunIdDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function walkFiles(rootDir, predicate) {
  const results = [];
  if (!fs.existsSync(rootDir)) {
    return results;
  }

  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(next);
      } else if (!predicate || predicate(next)) {
        results.push(next);
      }
    }
  }

  visit(rootDir);
  results.sort((a, b) => a.localeCompare(b));
  return results;
}

function relativeFromRoot(rootDir, filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function extractLastReviewed(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(Last-Reviewed|lastReviewed):\s*(.+)\s*$/i);
    if (match) {
      return match[2].trim();
    }
  }
  return '';
}

function dateToEpoch(value) {
  const parsed = Date.parse(String(value).trim());
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

function countLines(text) {
  if (text.length === 0) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}

function localMarkdownTargets(text) {
  const targets = [];
  const regex = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of text.matchAll(regex)) {
    const raw = (match[1] ?? '').trim();
    if (!raw) {
      continue;
    }
    const target = raw.split('#', 1)[0].trim();
    if (!target) {
      continue;
    }
    if (/^(https?:\/\/|mailto:|#)/i.test(raw)) {
      continue;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) {
      continue;
    }
    targets.push(target);
  }
  return targets;
}

function checkLinksInFile(rootDir, filePath, brokenLinks) {
  const baseDir = path.dirname(filePath);
  for (const target of localMarkdownTargets(fs.readFileSync(filePath, 'utf8'))) {
    const absolute = path.isAbsolute(target) ? target : path.resolve(baseDir, target);
    if (!fs.existsSync(absolute)) {
      brokenLinks.push(`${relativeFromRoot(rootDir, filePath)} -> ${target}`);
    }
  }
}

function normalizeRuleLine(line) {
  let value = line.replace(/^\s+|\s+$/g, '');
  if (!value || value.startsWith('#')) {
    return '';
  }
  value = value.replace(/^[-*]\s+/, '').replace(/`/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return value.length >= 30 ? value : '';
}

function checkDuplicateRuleLines(ruleFiles, duplicateRuleLines, warnings) {
  const counts = new Map();
  for (const filePath of ruleFiles) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    let inCode = false;
    let inFrontmatter = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.trim() === '---') {
        if (index === 0) {
          inFrontmatter = true;
          continue;
        }
        if (inFrontmatter) {
          inFrontmatter = false;
          continue;
        }
      }
      if (inFrontmatter) {
        continue;
      }
      if (line.startsWith('```')) {
        inCode = !inCode;
        continue;
      }
      if (inCode) {
        continue;
      }
      const normalized = normalizeRuleLine(line);
      if (!normalized) {
        continue;
      }
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10);
  for (const [text, count] of duplicates) {
    duplicateRuleLines.push(`${count} x ${text}`);
  }
  if (duplicateRuleLines.length > 0) {
    warnings.push(`Potential duplicated rule lines found: ${duplicateRuleLines.length}`);
  }
}

function stripFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return text;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      return lines.slice(index + 1).join('\n');
    }
  }
  return text;
}

function collectNormalizedStructure(text) {
  const body = stripFrontmatter(text);
  const headings = [];
  let bulletCount = 0;
  let numberedCount = 0;
  let codeFenceCount = 0;
  const anchors = new Set();

  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('```')) {
      codeFenceCount += 1;
    }
    const headingMatch = line.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      headings.push(headingMatch[1].length);
    }
    if (/^\s*[-*]\s+/.test(line)) {
      bulletCount += 1;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      numberedCount += 1;
    }
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const token = (match[1] ?? '').trim().replace(/\s+/g, ' ');
      if (token) {
        anchors.add(token);
      }
    }
    for (const target of localMarkdownTargets(line)) {
      anchors.add(target);
    }
    for (const match of line.matchAll(/(?:(?:\.\.\/|\.\/)?\.claude\/[A-Za-z0-9_./-]+\.(?:md|yaml|sh)|[A-Z][A-Z0-9_]+\.md)/g)) {
      anchors.add(match[0]);
    }
  }

  return { headings, bulletCount, numberedCount, codeFenceCount, anchors };
}

function checkLocalizedRuleParity(rootDir, errors, missingPairs, parityIssues) {
  const enRoot = path.join(rootDir, '.claude/rules');
  const koRoot = path.join(rootDir, '.claude/docs/ko/rules');
  if (!fs.existsSync(enRoot)) {
    return;
  }
  if (!fs.existsSync(koRoot)) {
    errors.push('Missing localized rules directory: .claude/docs/ko/rules');
    return;
  }

  const enFiles = walkFiles(enRoot, (filePath) => filePath.endsWith('.md'));
  for (const enFile of enFiles) {
    const rel = relativeFromRoot(enRoot, enFile);
    const koRel = rel.replace(/\.md$/, '.ko.md');
    const koFile = path.join(koRoot, koRel);
    if (!fs.existsSync(koFile)) {
      missingPairs.push(`.claude/rules/${rel} -> missing .claude/docs/ko/rules/${koRel}`);
      continue;
    }

    const enNormalized = collectNormalizedStructure(fs.readFileSync(enFile, 'utf8'));
    const koNormalized = collectNormalizedStructure(fs.readFileSync(koFile, 'utf8'));
    const issues = [];

    if (JSON.stringify(enNormalized.headings) !== JSON.stringify(koNormalized.headings)) {
      issues.push(`heading levels ${JSON.stringify(enNormalized.headings)} != ${JSON.stringify(koNormalized.headings)}`);
    }
    if (enNormalized.bulletCount !== koNormalized.bulletCount) {
      issues.push(`bullet count ${enNormalized.bulletCount} != ${koNormalized.bulletCount}`);
    }
    if (enNormalized.numberedCount !== koNormalized.numberedCount) {
      issues.push(`numbered count ${enNormalized.numberedCount} != ${koNormalized.numberedCount}`);
    }
    if (enNormalized.codeFenceCount !== koNormalized.codeFenceCount) {
      issues.push(`code fence count ${enNormalized.codeFenceCount} != ${koNormalized.codeFenceCount}`);
    }

    const missingAnchors = [...enNormalized.anchors].filter((item) => !koNormalized.anchors.has(item)).sort();
    const extraAnchors = [...koNormalized.anchors].filter((item) => !enNormalized.anchors.has(item)).sort();
    if (missingAnchors.length > 0) {
      issues.push(`missing anchors [${missingAnchors.slice(0, 6).join(', ')}${missingAnchors.length > 6 ? ', ...' : ''}]`);
    }
    if (extraAnchors.length > 0) {
      issues.push(`extra anchors [${extraAnchors.slice(0, 6).join(', ')}${extraAnchors.length > 6 ? ', ...' : ''}]`);
    }

    if (issues.length > 0) {
      parityIssues.push(`.claude/rules/${rel} :: ${issues.join('; ')}`);
    }
  }

  const koFiles = walkFiles(koRoot, (filePath) => filePath.endsWith('.ko.md'));
  for (const koFile of koFiles) {
    const rel = relativeFromRoot(koRoot, koFile);
    const enRel = rel.replace(/\.ko\.md$/, '.md');
    if (!fs.existsSync(path.join(enRoot, enRel))) {
      missingPairs.push(`.claude/docs/ko/rules/${rel} -> missing .claude/rules/${enRel}`);
    }
  }

  if (missingPairs.length > 0) {
    errors.push(`Localized rule file pairs missing: ${missingPairs.length}`);
  }
  if (parityIssues.length > 0) {
    errors.push(`Localized rule content parity failed: ${parityIssues.length}`);
  }
}

function checkLocalizedSkillPairs(rootDir, errors, missingPairs) {
  const skillsRoot = path.join(rootDir, '.claude/skills');
  if (!fs.existsSync(skillsRoot)) {
    return;
  }

  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillDir = path.join(skillsRoot, entry.name);
    const enFile = path.join(skillDir, 'SKILL.md');
    const koFile = path.join(skillDir, 'SKILL.ko.md');

    if (fs.existsSync(enFile) && !fs.existsSync(koFile)) {
      missingPairs.push(`.claude/skills/${entry.name}/SKILL.md -> missing .claude/skills/${entry.name}/SKILL.ko.md`);
    }
    if (fs.existsSync(koFile) && !fs.existsSync(enFile)) {
      missingPairs.push(`.claude/skills/${entry.name}/SKILL.ko.md -> missing .claude/skills/${entry.name}/SKILL.md`);
    }
  }

  if (missingPairs.length > 0) {
    errors.push(`Localized skill file pairs missing: ${missingPairs.length}`);
  }
}

function main() {
  const rootDir = resolveRootDir();
  const runId = `knowledge-audit-${formatRunIdDate(new Date())}`;
  const reviewMaxDays = envInt('KNOWLEDGE_REVIEW_MAX_DAYS', 45);
  const alwaysLoadedRuleLineMax = envInt('KNOWLEDGE_ALWAYS_LOADED_RULE_LINE_MAX', 250);
  const alwaysLoadedTotalLineMax = envInt('KNOWLEDGE_ALWAYS_LOADED_TOTAL_LINE_MAX', 320);
  const alwaysLoadedTokenMax = envInt('KNOWLEDGE_ALWAYS_LOADED_TOKEN_MAX', 2200);
  const requireProjectFilled = envBoolString('KNOWLEDGE_REQUIRE_PROJECT_FILLED', 'false');
  const outFile = process.env.HARNESS_KNOWLEDGE_AUDIT_FILE || path.join(rootDir, '.claude', `knowledge-repo-audit-${runId}.json`);

  const errors = [];
  const warnings = [];
  const brokenLinks = [];
  const staleDocs = [];
  const missingReviewDate = [];
  const contextBudgetViolations = [];
  const projectPlaceholderHits = [];
  const duplicateRuleLines = [];
  const localizedRuleMissingPairs = [];
  const localizedRuleParityIssues = [];
  const localizedSkillMissingPairs = [];

  const requiredFiles = [
    'AGENTS.md',
    '.claude/CLAUDE.md',
    '.claude/PROJECT.md',
    '.claude/docs/guidelines/document-memory-policy.md',
    '.claude/docs/guidelines/knowledge-repository-ops.md',
  ];
  const linkScanFiles = [
    '.claude/CLAUDE.md',
    '.claude/CLAUDE.ko.md',
    '.claude/PROJECT.md',
    '.claude/PROJECT.ko.md',
    '.claude/docs/guidelines/knowledge-repository-ops.md',
    '.claude/docs/guidelines/knowledge-repository-ops.ko.md',
  ];
  const freshnessFiles = [...linkScanFiles];

  for (const rel of requiredFiles) {
    if (!fs.existsSync(path.join(rootDir, rel))) {
      errors.push(`Missing required file: ${rel}`);
    }
  }

  for (const rel of linkScanFiles) {
    const abs = path.join(rootDir, rel);
    if (fs.existsSync(abs)) {
      checkLinksInFile(rootDir, abs, brokenLinks);
    }
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  for (const rel of freshnessFiles) {
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const lastReviewed = extractLastReviewed(abs);
    if (!lastReviewed) {
      missingReviewDate.push(rel);
      continue;
    }
    const reviewedEpoch = dateToEpoch(lastReviewed);
    if (reviewedEpoch === null) {
      warnings.push(`Invalid review date in ${rel}: ${lastReviewed}`);
      continue;
    }
    const ageDays = Math.floor((nowEpoch - reviewedEpoch) / 86400);
    if (ageDays > reviewMaxDays) {
      staleDocs.push(`${rel} (${ageDays} days old)`);
    }
  }

  const ruleFiles = walkFiles(path.join(rootDir, '.claude/rules'), (filePath) => filePath.endsWith('.md'));
  let alwaysLoadedRuleLines = 0;
  let alwaysLoadedTotalLines = 0;
  let alwaysLoadedEstimatedTokens = 0;
  const claudeFile = path.join(rootDir, '.claude/CLAUDE.md');
  if (fs.existsSync(claudeFile)) {
    let ruleChars = 0;
    for (const filePath of ruleFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      alwaysLoadedRuleLines += countLines(content);
      ruleChars += content.length;
    }
    const claudeContent = fs.readFileSync(claudeFile, 'utf8');
    const claudeLines = countLines(claudeContent);
    alwaysLoadedTotalLines = alwaysLoadedRuleLines + claudeLines;
    alwaysLoadedEstimatedTokens = Math.floor((ruleChars + claudeContent.length + 3) / 4);

    if (alwaysLoadedRuleLines > alwaysLoadedRuleLineMax) {
      contextBudgetViolations.push(`rules lines ${alwaysLoadedRuleLines} > ${alwaysLoadedRuleLineMax}`);
    }
    if (alwaysLoadedTotalLines > alwaysLoadedTotalLineMax) {
      contextBudgetViolations.push(`always-loaded total lines ${alwaysLoadedTotalLines} > ${alwaysLoadedTotalLineMax}`);
    }
    if (alwaysLoadedEstimatedTokens > alwaysLoadedTokenMax) {
      contextBudgetViolations.push(`always-loaded estimated tokens ${alwaysLoadedEstimatedTokens} > ${alwaysLoadedTokenMax}`);
    }
    if (contextBudgetViolations.length > 0) {
      errors.push('Always-loaded context budget exceeded');
    }
  }

  const placeholderMarkers = [
    '[service/product name and short description]',
    '[tech stack - see guide below]',
    '[default response language]',
    '[project root]/',
    '[main folder1]/',
    '[main folder2]/',
    '[main folder3]/',
    '[feature folder pattern example]',
    '[API routing rules]',
    '[commonly used utilities]',
    '[how clients call APIs]',
    '[type file locations and naming rules]',
    '[Entity, DTO, Request/Response structures]',
    '[JWT, session, etc.]',
    '[permission management approach]',
    '[auth/authorization middleware locations]',
    '[dev server command]',
    '[build command]',
    '[lint command]',
    '[typecheck command]',
    '[test command]',
    '[ENV_NAME]',
    'This file is a per-project template',
    '[서비스/제품 이름 및 간단한 설명]',
    '[기술 스택 - 아래 가이드 참고]',
    '[기본 응답 언어 지정]',
    '[프로젝트 루트]/',
    '[주요 폴더1]/',
    '[주요 폴더2]/',
    '[주요 폴더3]/',
    '[기능 폴더 패턴 예시]',
    '[API 라우트 규칙]',
    '[자주 사용하는 유틸리티 함수]',
    '[클라이언트에서 API 호출 방식]',
    '[타입 파일 위치 및 명명 규칙]',
    '[Entity, DTO, Request/Response 구조]',
    '[JWT, Session 등]',
    '[권한 관리 방식]',
    '[인증/권한 처리 미들웨어 위치]',
    '[개발 서버 실행 명령]',
    '[빌드 명령]',
    '[린트 명령]',
    '[타입 체크 명령]',
    '[테스트 실행 명령]',
    '[환경 변수명]',
    '프로젝트별로 작성해야 하는 템플릿',
  ];

  for (const rel of ['.claude/PROJECT.md', '.claude/PROJECT.ko.md']) {
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const content = fs.readFileSync(abs, 'utf8');
    for (const marker of placeholderMarkers) {
      if (content.includes(marker)) {
        projectPlaceholderHits.push(`${rel} -> ${marker}`);
      }
    }
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      if (/^\s*[-*]?\s*\*\*[^*]+\*\*:\s*\[[^\]]+\]\s*$/.test(line)) {
        projectPlaceholderHits.push(`${rel} -> generic placeholder at ${index + 1}:${line.trim()}`);
      }
    }
  }
  if (projectPlaceholderHits.length > 0 && requireProjectFilled === 'true') {
    errors.push(`PROJECT template placeholders found: ${projectPlaceholderHits.length}`);
  }

  checkDuplicateRuleLines(ruleFiles, duplicateRuleLines, warnings);
  checkLocalizedRuleParity(rootDir, errors, localizedRuleMissingPairs, localizedRuleParityIssues);
  checkLocalizedSkillPairs(rootDir, errors, localizedSkillMissingPairs);

  if (missingReviewDate.length > 0) {
    warnings.push(`Missing Last-Reviewed metadata in ${missingReviewDate.length} file(s)`);
  }
  if (brokenLinks.length > 0) {
    errors.push(`Broken local links found: ${brokenLinks.length}`);
  }
  if (staleDocs.length > 0) {
    warnings.push(`Stale documents found: ${staleDocs.length}`);
  }

  const verdict = errors.length > 0 ? 'failed' : 'passed';
  const exitCode = verdict === 'failed' ? 1 : 0;
  const payload = {
    runId,
    script: 'knowledge-repo-audit.mjs',
    generatedAt: utcTimestamp(),
    verdict,
    exitCode,
    policy: {
      reviewMaxDays,
      alwaysLoadedRuleLineMax,
      alwaysLoadedTotalLineMax,
      alwaysLoadedTokenMax,
      requireProjectFilled,
    },
    metrics: {
      alwaysLoadedRuleLines,
      alwaysLoadedTotalLines,
      alwaysLoadedEstimatedTokens,
    },
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      brokenLinks: brokenLinks.length,
      staleDocs: staleDocs.length,
      missingReviewDate: missingReviewDate.length,
      contextBudgetViolations: contextBudgetViolations.length,
      projectPlaceholderHits: projectPlaceholderHits.length,
      duplicateRuleLines: duplicateRuleLines.length,
      localizedRuleMissingPairs: localizedRuleMissingPairs.length,
      localizedRuleParityIssues: localizedRuleParityIssues.length,
      localizedSkillMissingPairs: localizedSkillMissingPairs.length,
    },
    details: {
      errors,
      warnings,
      brokenLinks,
      staleDocs,
      missingReviewDate,
      contextBudgetViolations,
      projectPlaceholderHits,
      duplicateRuleLines,
      localizedRuleMissingPairs,
      localizedRuleParityIssues,
      localizedSkillMissingPairs,
    },
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  if (COMPACT_OUTPUT) {
    console.log(`knowledge-audit verdict=${verdict} errors=${errors.length} warnings=${warnings.length} rules=${alwaysLoadedRuleLines}/${alwaysLoadedTotalLines} tokens=${alwaysLoadedEstimatedTokens} artifact=${outFile}`);
    process.exit(verdict === 'passed' ? 0 : 1);
  }

  console.log('');
  console.log('Knowledge Repo Audit');
  console.log(`Run ID: ${runId}`);
  console.log(`Verdict: ${verdict}`);
  console.log(`Errors: ${errors.length} / Warnings: ${warnings.length}`);
  console.log(`Always-loaded lines (rules/total): ${alwaysLoadedRuleLines}/${alwaysLoadedTotalLines}`);
  console.log(`Always-loaded estimated tokens: ${alwaysLoadedEstimatedTokens}`);
  console.log(`Artifact: ${outFile}`);

  process.exit(exitCode);
}

main();
