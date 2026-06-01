#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function readTextLines(filePath) {
  return readText(filePath).split(/\r?\n/);
}

export function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function sha1File(filePath) {
  const hash = crypto.createHash('sha1');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function walkFiles(rootDir, { skipDirs = new Set() } = {}) {
  const results = [];

  function visit(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) {
          continue;
        }
        visit(fullPath);
        continue;
      }
      if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  visit(rootDir);
  return results;
}
