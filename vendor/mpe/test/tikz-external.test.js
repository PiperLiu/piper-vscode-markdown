/* global suite, test, suiteSetup, suiteTeardown, teardown */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');
let api;
let dir;
let runnerPath;
const modules = {};
suite('optional TikZ subprocess boundary', function () {
  this.timeout(10000);
  suiteSetup(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'piper-tikz-test-'));
    runnerPath = path.join(dir, 'tikz-runner.cjs');
    const entryDir = path.join(__dirname, '..', 'src');
    const outputs = await Promise.all([
      esbuild.build({
        entryPoints: [path.join(entryDir, 'tikz-external.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile: path.join(dir, 'adapter.cjs'),
        metafile: true,
      }),
      esbuild.build({
        entryPoints: [path.join(entryDir, 'tikz-runner.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile: runnerPath,
        metafile: true,
      }),
    ]);
    for (const build of outputs)
      assert.ok(
        Object.keys(build.metafile.inputs).every(
          (file) => !/node_modules|dvi2svg/.test(file),
        ),
      );
    api = require(path.join(dir, 'adapter.cjs'));
    for (const [name, text] of Object.entries({
      good: `module.exports = async (source, options) => { console.log('diagnostic only'); return '<svg><desc>' + JSON.stringify({ source, options }) + '</desc></svg>'; };`,
      invalid: `module.exports = async () => 'not an svg';`,
      failed: `module.exports = async () => { throw new Error('mock rendering failure'); };`,
      hanging: `module.exports = () => new Promise(() => { setInterval(() => {}, 1000); });`,
      large: `module.exports = async () => '<svg>' + 'x'.repeat(4096) + '</svg>';`,
      noisy: `module.exports = async () => { await new Promise(resolve => process.stderr.write('x'.repeat(70000), resolve)); return '<svg></svg>'; };`,
    })) {
      modules[name] = path.join(dir, name + '.cjs');
      fs.writeFileSync(modules[name], text);
    }
  });
  suiteTeardown(() => fs.rmSync(dir, { recursive: true, force: true }));
  teardown(() => api.configureTikzRenderer(''));
  const run = (name, source = 'SOURCE', options = {}, limits = {}) =>
    api.runTikzProcess(source, options, {
      modulePath: modules[name],
      runnerPath,
      ...limits,
    });
  test('uses the compatible default export and transfers only allowlisted render parameters', async () => {
    const svg = await run('good', 'SOURCE', {
      texPackages: { amsmath: '' },
      tikzLibraries: 'arrows.meta,calc',
      addToPreamble: '% test',
      embedFontCss: true,
      fontCssUrl: 'https://example.com/fonts.css',
      showConsole: true,
      modulePath: '/evil',
      executable: '/bin/sh',
      outputPath: '/source.md',
    });
    const output = JSON.parse(
      svg.slice('<svg><desc>'.length, -'</desc></svg>'.length),
    );
    assert.strictEqual(output.source, 'SOURCE');
    assert.deepStrictEqual(output.options, {
      showConsole: false,
      texPackages: { amsmath: '' },
      tikzLibraries: 'arrows.meta,calc',
      addToPreamble: '% test',
      embedFontCss: true,
      fontCssUrl: 'https://example.com/fonts.css',
    });
  });
  test('rejects missing tools with a concrete manual installation instruction', async () => {
    await assert.rejects(
      api.runTikzProcess(
        'SOURCE',
        {},
        { modulePath: path.join(dir, 'missing'), runnerPath },
      ),
      /npm install --prefix .*node-tikzjax@1\.0\.5/,
    );
  });
  test('accepts only a user-configured absolute module location', () => {
    api.configureTikzRenderer('/user/tools/node-tikzjax');
    assert.strictEqual(
      api.getTikzRendererModulePath(),
      '/user/tools/node-tikzjax',
    );
    api.configureTikzRenderer('relative/repo/tool');
    assert.throws(
      () => api.getTikzRendererModulePath(),
      /absolute module path/,
    );
  });
  test('rejects oversized source and invalid options before spawning', async () => {
    await assert.rejects(run('good', 'x'.repeat(512 * 1024 + 1)), /512 KiB/);
    await assert.rejects(
      run('good', 'ok', { texPackages: { '../evil': '' } }),
      /package/,
    );
    await assert.rejects(
      run('good', 'ok', { fontCssUrl: 'file:///private/key' }),
      /HTTP/,
    );
  });
  test('surfaces renderer failure and invalid SVG', async () => {
    await assert.rejects(run('failed'), /mock rendering failure/);
    await assert.rejects(run('invalid'), /invalid.*SVG/i);
  });
  test('kills a renderer exceeding the output or diagnostics cap', async () => {
    await assert.rejects(
      run('large', 'SOURCE', {}, { maxOutputBytes: 512 }),
      /output limit/,
    );
    await assert.rejects(run('noisy'), /diagnostics.*64 KiB/);
  });
  test('kills a hung renderer at the configured time limit', async () => {
    const start = Date.now();
    await assert.rejects(
      run('hanging', 'SOURCE', {}, { timeoutMs: 100 }),
      /timed out/,
    );
    assert.ok(Date.now() - start < 3000);
  });
  test('manifest marks renderer location user/machine-only', () => {
    const setting =
      require('../package.json').contributes.configuration.properties[
        'piperMarkdown.enhanced.tikzRendererPath'
      ];
    assert.strictEqual(setting.scope, 'machine');
    assert.strictEqual(setting.default, '');
  });
});
