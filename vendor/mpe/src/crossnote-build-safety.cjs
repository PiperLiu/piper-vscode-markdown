// SPDX-License-Identifier: MIT
// Copyright (c) 2026 PiperLiu
// Build-time, pinned-source adaptation. Never modify installed node_modules.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const VERSION = '0.9.42';
const HASHES = {
  'out/cjs/index.cjs': 'b65b881deef8c1b6aa5185fcd695f6632fe5fa314ceeb6921164de9d9d7ef8f5',
  'out/esm/index.mjs': 'c620931117a7b7811672ac0d77f0905335dc35d895388ca60d069054141f7361',
  'out/cli/index.cjs': 'd771d95a3866f4224b34d3ce5d49bd4c079604213a024913eec45a04f6f87970',
};
const HOST_KEYS = ['enableScriptExecution', 'chromePath', 'pandocPath', 'imageMagickPath', 'markdownYoBinaryPath', 'configPath', 'd2Path', 'plantumlJarPath', 'latexEngine', 'pandocArguments', 'pandocMarkdownFlavor', 'puppeteerArgs', 'tikzRendererPath'];

// Document/_output.yaml settings cannot select code-running Pandoc backends
// while host script permission is off. User-configured arguments stay outside
// this object. Explicitly enabling script execution retains upstream behavior.
function sanitizePandocConfig(value) {
  if (Array.isArray(value)) return value.map(sanitizePandocConfig);
  if (!value || typeof value !== 'object') return value;
  const blocked = new Set(['pandoc_args', 'filters', 'filter', 'lua-filter', 'lua_filter', 'defaults', 'latex_engine', 'pdf_engine']);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key)).map(([key, child]) => [key, sanitizePandocConfig(child)]));
}
function replaceOnce(source, pattern, replacement, label) {
  const matches = typeof pattern === 'string' ? source.split(pattern).length - 1 : [...source.matchAll(new RegExp(pattern.source, 'g'))].length;
  if (matches !== 1) throw new Error(`Crossnote safety patch ${label}: expected exactly one match, got ${matches}`);
  return source.replace(pattern, replacement);
}
function patchCrossnoteSource(source, relativeFile, version) {
  if (version !== VERSION) throw new Error(`Crossnote safety patch requires ${VERSION}, got ${version}`);
  const digest = crypto.createHash('sha256').update(source).digest('hex');
  if (!HASHES[relativeFile] || HASHES[relativeFile] !== digest) throw new Error(`Crossnote source hash changed: ${relativeFile}. Review safety patches before building.`);
  source = replaceOnce(source, /\[\s*"enableScriptExecution",\s*"chromePath",\s*"pandocPath",\s*"imageMagickPath",\s*"markdownYoBinaryPath"\s*\]/, JSON.stringify(HOST_KEYS), 'host configuration filter');
  if (relativeFile === 'out/cli/index.cjs') {
    source = replaceOnce(source, 'let args = yamlConfig["pandoc_args"] || [];', 'let args = (this.notebook.config.enableScriptExecution ? yamlConfig["pandoc_args"] : []) || [];', 'Pandoc preview arguments');
    source = replaceOnce(source, 'config = loadOutputYAML(fileDirectoryPath, config);', 'config = loadOutputYAML(fileDirectoryPath, config); if (!notebook.config.enableScriptExecution) config = __piperSafePandocConfig(config);', 'Pandoc export configuration');
  } else {
    source = replaceOnce(source, /([A-Za-z_$][\w$]*)\.pandoc_args\|\|\[\]/, '(this.notebook.config.enableScriptExecution?$1.pandoc_args:[])||[]', 'Pandoc preview arguments');
    const before = relativeFile === 'out/cjs/index.cjs' ? 'H=aj(p,H);let V=["-f",B.config.pandocMarkdownFlavor' : 'H=bj(p,H);let V=["-f",$.config.pandocMarkdownFlavor';
    const after = relativeFile === 'out/cjs/index.cjs' ? 'H=aj(p,H);if(!B.config.enableScriptExecution)H=__piperSafePandocConfig(H);let V=["-f",B.config.pandocMarkdownFlavor' : 'H=bj(p,H);if(!$.config.enableScriptExecution)H=__piperSafePandocConfig(H);let V=["-f",$.config.pandocMarkdownFlavor';
    source = replaceOnce(source, before, after, 'Pandoc export configuration');
  }
  return source + '\n;const __piperSafePandocConfig = ' + sanitizePandocConfig.toString().replace(/sanitizePandocConfig/g, '__piperSafePandocConfig') + ';\n';
}
const crossnoteSafetyPlugin = {
  name: 'piper-crossnote-safety',
  setup(build) {
    build.onLoad({ filter: /[\\/]crossnote[\\/]out[\\/](?:cjs|esm|cli)[\\/]index\.(?:cjs|mjs)$/ }, args => {
      const packageRoot = path.resolve(path.dirname(args.path), '../..');
      const relativeFile = path.relative(packageRoot, args.path).split(path.sep).join('/');
      const version = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
      return { contents: patchCrossnoteSource(fs.readFileSync(args.path, 'utf8'), relativeFile, version), loader: 'js', resolveDir: path.dirname(args.path) };
    });
  },
};
module.exports = { patchCrossnoteSource, crossnoteSafetyPlugin, sanitizePandocConfig, HOST_KEYS };
