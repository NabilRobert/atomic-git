#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Both bin.js and cli.ts live in bin/ — same directory reference
const cliPath = join(__dirname, 'cli.ts');

// Use 'shell: true' to ensure Windows finds the 'npx' script correctly
const child = spawn('npx', ['tsx', cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => process.exit(code || 0));
