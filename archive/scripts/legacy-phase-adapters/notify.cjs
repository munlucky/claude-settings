#!/usr/bin/env node

// Claude Code Notification Hook Script
// Windows / macOS 크로스 플랫폼 호환

const https = require('https');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const projectName = path.basename(projectDir);
const message = `${projectName} 입력 필요`;

const options = {
  hostname: 'ntfy.sh',
  path: '/moonshot-claude-alert',
  method: 'POST',
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message)
  }
};

const req = https.request(options, () => process.exit(0));
req.on('error', () => process.exit(0));
req.write(message);
req.end();
