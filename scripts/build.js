'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const run = (binary, args, cwd = root) => execFileSync(binary, args, { cwd, stdio: 'inherit' });
run(process.execPath, ['scripts/sync-manifest.js']);
run('pnpm', ['build'], path.join(root, 'vendor/mpe'));
run(process.execPath, ['scripts/build-native.js']);
run(process.execPath, ['scripts/third-party-notices.js']);
