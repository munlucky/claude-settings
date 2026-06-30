#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const marker = process.env.BROWSER_COMPLETION_CLEANUP_MARKER;
if (marker) {
  writeFileSync(marker, 'cleanup ran\n');
}
if (process.env.BROWSER_COMPLETION_SECRET) {
  console.log(`cleanup secret ${process.env.BROWSER_COMPLETION_SECRET}`);
}
console.log('cleanup ok');
