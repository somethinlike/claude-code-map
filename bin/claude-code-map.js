#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'src', 'cli.ts');

// Resolve tsx binary from our own node_modules
const require = createRequire(import.meta.url);
const tsxBin = join(dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs');

try {
  execFileSync(process.execPath, [tsxBin, cliPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
} catch (err) {
  process.exit(err.status || 1);
}
