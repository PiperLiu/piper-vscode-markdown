'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { name, version } = require('../package.json');
execFileSync(path.join(root, 'node_modules/.bin/vsce'), ['package', '--allow-missing-repository', '--target', 'darwin-arm64', '--out', `${name}-${version}-darwin-arm64.vsix`], { cwd: root, stdio: 'inherit' });
