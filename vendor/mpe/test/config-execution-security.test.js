/* global suite, test, suiteSetup, suiteTeardown */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');
const { loadConfigsInDirectory, wrapNodeFSAsApi } = require('crossnote');
let directory;
let safeLess;
suite('workspace configuration execution boundaries', function () {
  this.timeout(30000);
  suiteSetup(async () => {
    directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'piper-config-security-'),
    );
    const bundlePath = path.join(directory, 'less-safe.cjs');
    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/less-safe.cjs')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: bundlePath,
      plugins: [
        {
          name: 'original-less',
          setup(build) {
            build.onResolve({ filter: /^piper-less-original$/ }, () => ({
              path: require.resolve('less', {
                paths: [path.dirname(require.resolve('crossnote'))],
              }),
            }));
          },
        },
      ],
    });
    safeLess = require(bundlePath);
  });
  suiteTeardown(() => fs.rmSync(directory, { recursive: true, force: true }));
  test('LESS variables and CSS imports work while direct and imported plugins cannot execute', async () => {
    const marker = path.join(directory, 'plugin-executed');
    const plugin = path.join(directory, 'unsafe-plugin.js');
    fs.writeFileSync(
      plugin,
      `module.exports = { install() { require('fs').writeFileSync(${JSON.stringify(marker)}, 'bad'); } };`,
    );
    fs.writeFileSync(
      path.join(directory, 'nested.less'),
      '@plugin "unsafe-plugin.js";',
    );
    const normal = await safeLess.render(
      '@color: #123456; .preview { color: @color; }',
    );
    assert.ok(normal.css.includes('#123456'));
    fs.writeFileSync(
      path.join(directory, 'safe.less'),
      '.imported { color: #abcdef; }',
    );
    const imported = await safeLess.render('@import "safe.less";', {
      paths: [directory],
    });
    assert.ok(imported.css.includes('#abcdef'));
    for (const source of [
      '@plugin "unsafe-plugin.js";',
      '@import "nested.less";',
    ]) {
      await assert.rejects(
        safeLess.render(source, {
          paths: [directory],
          disablePluginRule: false,
        }),
        /plugin.*not allowed/i,
      );
      assert.strictEqual(fs.existsSync(marker), false);
    }
    await assert.rejects(
      safeLess.render('.preview { width: `1 + 1`; }', {
        javascriptEnabled: true,
      }),
      /javascript.*not enabled/i,
    );
  });
  test('config.js and parser.js execute inside QuickJS without Node process or require access', async () => {
    const configDir = path.join(directory, '.crossnote');
    fs.mkdirSync(configDir);
    const marker = path.join(directory, 'host-executed');
    fs.writeFileSync(
      path.join(configDir, 'style.less'),
      '.preview { color: red; }',
    );
    fs.writeFileSync(
      path.join(configDir, 'config.js'),
      `(() => { globalThis.__piperSandboxEscape = true; try { require('fs').writeFileSync(${JSON.stringify(marker)}, 'bad'); } catch {} return { mermaidConfig: { processType: typeof process, requireType: typeof require } }; })()`,
    );
    fs.writeFileSync(
      path.join(configDir, 'parser.js'),
      '({ onWillParseMarkdown: value => typeof process + ":" + typeof require + ":" + value })',
    );
    const config = await loadConfigsInDirectory(configDir, wrapNodeFSAsApi());
    try {
      assert.strictEqual(config.mermaidConfig.processType, 'undefined');
      assert.strictEqual(config.mermaidConfig.requireType, 'undefined');
      assert.strictEqual(
        await config.parserConfig.onWillParseMarkdown('CONTENT'),
        'undefined:undefined:CONTENT',
      );
      assert.strictEqual(globalThis.__piperSandboxEscape, undefined);
      assert.strictEqual(fs.existsSync(marker), false);
    } finally {
      config.parserConfig.dispose?.();
    }
  });
});
