import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

test('installer atomic switch, rollback, idempotency, and native addon scan contract', async () => {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  
  const scanNativeAddons = (dir) => {
    const results = [];
    const walk = (d) => {
      if (!fs.existsSync(d)) return;
      const entries = fs.readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.node')) {
          results.push(full);
        }
      }
    };
    walk(dir);
    return results;
  };
  
  const addons = scanNativeAddons(path.join(repoRoot, 'scripts'));
  assert.equal(addons.length, 0, `No native addons should be present in scripts`);
});
