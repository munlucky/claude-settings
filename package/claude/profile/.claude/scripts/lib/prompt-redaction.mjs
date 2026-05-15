import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function normalizeRepoRelativePath(filePath, rootDir = process.cwd()) {
  const relativePath = path.relative(rootDir, filePath);
  return relativePath.split(path.sep).join('/');
}

function promptArchiveRoot(rootDir = process.cwd()) {
  return path.join(rootDir, '.claude', 'logs', 'agent-loop', 'prompts');
}

export function archivePromptText(promptText, rootDir = process.cwd()) {
  const prompt = String(promptText ?? '');
  const promptHashRaw = crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
  const promptHash = `sha256:${promptHashRaw}`;
  const promptBytes = Buffer.byteLength(prompt, 'utf8');
  const archiveDir = promptArchiveRoot(rootDir);
  fs.mkdirSync(archiveDir, { recursive: true });
  const archivePath = path.join(archiveDir, `${promptHashRaw}.txt`);

  if (!fs.existsSync(archivePath)) {
    fs.writeFileSync(archivePath, prompt, 'utf8');
  }

  return {
    promptHash,
    promptBytes,
    promptArchivePath: normalizeRepoRelativePath(archivePath, rootDir),
  };
}

function redactPromptArg(commandName) {
  if (commandName === 'claude') {
    return '<prompt-redacted>';
  }
  if (commandName === 'codex') {
    return '<prompt-redacted>';
  }
  return '<redacted>';
}

function detectPromptArg(command) {
  const commandName = path.basename(String(command[0] ?? '')).toLowerCase();
  const args = command.slice(1).map((arg) => String(arg ?? ''));

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--codex-prompt-file' || arg === '--prompt-file') {
      return {
        commandName,
        promptIndex: index + 1,
        promptKind: 'prompt-file',
        promptValue: args[index + 1] ?? '',
      };
    }
    if (arg === '-p' || arg === '--prompt') {
      return {
        commandName,
        promptIndex: index + 1,
        promptKind: 'prompt-arg',
        promptValue: args[index + 1] ?? '',
      };
    }
  }

  if (commandName === 'codex' && args.length > 0) {
    return {
      commandName,
      promptIndex: args.length - 1,
      promptKind: 'prompt-arg',
      promptValue: args[args.length - 1] ?? '',
    };
  }

  return {
    commandName,
    promptIndex: -1,
    promptKind: '',
    promptValue: '',
  };
}

export function summarizeSpawnCommand(command, rootDir = process.cwd()) {
  const commandArray = Array.isArray(command) ? command.map((arg) => String(arg ?? '')) : [];
  const detected = detectPromptArg(commandArray);
  const argvSummary = [...commandArray];
  const promptSummaryIndex = detected.promptIndex >= 0 ? detected.promptIndex + 1 : -1;
  let promptDetails = {
    promptHash: '',
    promptBytes: 0,
    promptArchivePath: '',
  };

  if (promptSummaryIndex >= 0 && detected.promptValue) {
    let promptText = detected.promptValue;
    try {
      if (detected.promptKind === 'prompt-file') {
        promptText = fs.readFileSync(detected.promptValue, 'utf8');
      }
    } catch {
      promptDetails = {
        promptHash: '',
        promptBytes: 0,
        promptArchivePath: normalizeRepoRelativePath(detected.promptValue, rootDir),
      };
      argvSummary[promptSummaryIndex] = detected.promptKind === 'prompt-file'
        ? promptDetails.promptArchivePath
        : redactPromptArg(detected.commandName);
      const argvHash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(argvSummary), 'utf8').digest('hex')}`;
      return {
        commandName: detected.commandName || path.basename(String(commandArray[0] ?? '')),
        argvSummary,
        argvHash,
        ...promptDetails,
      };
    }

    promptDetails = archivePromptText(promptText, rootDir);
    argvSummary[promptSummaryIndex] = detected.promptKind === 'prompt-file'
      ? promptDetails.promptArchivePath
      : redactPromptArg(detected.commandName);
  }

  const argvHash = `sha256:${crypto.createHash('sha256').update(JSON.stringify(argvSummary), 'utf8').digest('hex')}`;

  return {
    commandName: detected.commandName || path.basename(String(commandArray[0] ?? '')),
    argvSummary,
    argvHash,
    ...promptDetails,
  };
}
