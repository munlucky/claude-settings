import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateShellSyntax } from './verify-shell-syntax.mjs';

test('passes files with LF endings and successful bash syntax check', () => {
  withFixture((root) => {
    const filePath = writeFile(root, 'ok.sh', '#!/usr/bin/env bash\nset -euo pipefail\n');
    const result = evaluateShellSyntax([], {
      files: [filePath],
      runSyntaxCheck: () => ({ status: 0, stdout: '', stderr: '', error: '' }),
    });

    assert.equal(result.status, 0);
    assert.match(result.lines.join('\n'), /Shell syntax policy passed/);
  });
});

test('fails missing shell files', () => {
  const result = evaluateShellSyntax([], {
    files: ['missing.sh'],
    runSyntaxCheck: () => ({ status: 0, stdout: '', stderr: '', error: '' }),
  });

  assert.equal(result.status, 1);
  assert.equal(result.failures[0].reason, 'missing_shell_file');
});

test('fails CRLF shell files before invoking bash', () => {
  withFixture((root) => {
    const filePath = writeFile(root, 'crlf.sh', '#!/usr/bin/env bash\r\nset -e\r\n');
    let invoked = false;
    const result = evaluateShellSyntax([], {
      files: [filePath],
      runSyntaxCheck: () => {
        invoked = true;
        return { status: 0, stdout: '', stderr: '', error: '' };
      },
    });

    assert.equal(result.status, 1);
    assert.equal(result.failures[0].reason, 'crlf_line_endings');
    assert.equal(invoked, false);
  });
});

test('reports bash spawn failure as verifier unavailable', () => {
  withFixture((root) => {
    const filePath = writeFile(root, 'ok.sh', '#!/usr/bin/env bash\n');
    const result = evaluateShellSyntax([], {
      files: [filePath],
      runSyntaxCheck: () => ({ status: null, stdout: '', stderr: '', error: 'spawnSync bash EPERM' }),
    });

    assert.equal(result.status, 2);
    assert.equal(result.unavailable[0].reason, 'spawnSync bash EPERM');
  });
});

function withFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-syntax-'));
  try {
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFile(root, name, content) {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}
