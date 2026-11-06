/* global suite, test, suiteSetup, suiteTeardown */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const vm = require('vm');
const { pathToFileURL } = require('url');
const {
  patchCrossnoteSource,
  sanitizePandocConfig,
  HOST_KEYS,
} = require('../src/crossnote-build-safety.cjs');
const engineRoot = path.resolve(
  path.dirname(require.resolve('crossnote')),
  '../..',
);
let engine;
let directory;
suite('pinned Crossnote safety across native, server and wiki', function () {
  this.timeout(30000);
  suiteSetup(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'piper-pinned-safety-'));
    const filename = path.join(engineRoot, 'out/cjs/index.cjs');
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    loaded._compile(
      patchCrossnoteSource(
        fs.readFileSync(filename, 'utf8'),
        'out/cjs/index.cjs',
        '0.9.42',
      ),
      filename,
    );
    engine = loaded.exports;
  });
  suiteTeardown(() => fs.rmSync(directory, { recursive: true, force: true }));
  test('patches every pinned engine artifact and refuses source/version drift', () => {
    for (const name of [
      'out/cjs/index.cjs',
      'out/esm/index.mjs',
      'out/cli/index.cjs',
    ]) {
      const source = fs.readFileSync(path.join(engineRoot, name), 'utf8');
      const patched = patchCrossnoteSource(source, name, '0.9.42');
      assert.ok(patched.includes(JSON.stringify(HOST_KEYS)), name);
      assert.ok(patched.includes('__piperSafePandocConfig'), name);
      if (!name.endsWith('.mjs'))
        assert.doesNotThrow(() => new vm.Script(patched));
      assert.throws(
        () => patchCrossnoteSource(source + '\n', name, '0.9.42'),
        /hash changed/,
      );
      assert.throws(
        () => patchCrossnoteSource(source, name, '0.9.43'),
        /requires 0.9.42/,
      );
    }
  });
  test('both global and repository config loaders strip all executable paths/options', async () => {
    for (const kind of ['user-global', 'repository']) {
      const target = path.join(directory, kind);
      fs.mkdirSync(target);
      const dangerous = Object.fromEntries(
        HOST_KEYS.map((key) => [key, '/repo/evil']),
      );
      fs.writeFileSync(
        path.join(target, 'config.js'),
        '(' +
          JSON.stringify({ ...dangerous, mermaidConfig: { theme: 'forest' } }) +
          ')',
      );
      const warnings = [];
      const previous = console.warn;
      console.warn = (value) => warnings.push(value);
      let result;
      try {
        result = await engine.loadConfigsInDirectory(
          target,
          engine.wrapNodeFSAsApi(),
        );
      } finally {
        console.warn = previous;
      }
      try {
        for (const key of HOST_KEYS)
          assert.strictEqual(Object.hasOwn(result, key), false, key);
        assert.strictEqual(result.mermaidConfig.theme, 'forest');
        assert.strictEqual(warnings.length, HOST_KEYS.length);
      } finally {
        result.parserConfig.dispose?.();
      }
    }
  });
  test('Pandoc preview ignores document filters/defaults while preserving trusted user args', async () => {
    const source = path.join(directory, 'article.md');
    fs.writeFileSync(source, '# Source');
    const notebook = await engine.Notebook.init({
      notebookPath: pathToFileURL(directory).href,
      config: {
        markdownParser: 'pandoc',
        pandocArguments: ['--user-argument=keep'],
        enableScriptExecution: false,
      },
    });
    const markdownEngine = new engine.MarkdownEngine({
      notebook,
      filePath: source,
    });
    let captured;
    markdownEngine.pandocRender = async (_text, args) => {
      captured = args;
      return '<p>safe renderer</p>';
    };
    const text =
      '---\npandoc_args: ["--filter=/repo/evil", "--defaults=/repo/evil.yaml"]\n---\n# Source';
    const options = {
      useRelativeFilePath: false,
      isForPreview: true,
      hideFrontMatter: true,
    };
    await markdownEngine.parseMD(text, options);
    assert.deepStrictEqual(captured, ['--user-argument=keep']);
    notebook.config.enableScriptExecution = true;
    await markdownEngine.parseMD(text, options);
    assert.deepStrictEqual(captured, [
      '--user-argument=keep',
      '--filter=/repo/evil',
      '--defaults=/repo/evil.yaml',
    ]);
  });
  test('Pandoc export sanitizes nested _output.yaml options without dropping layout choices', () => {
    const value = {
      output: {
        pdf_document: {
          toc: true,
          latex_engine: '/repo/evil',
          pandoc_args: ['--lua-filter=evil.lua'],
          geometry: 'margin=1in',
        },
      },
      pandoc_args: ['--defaults=evil.yaml'],
      title: 'Title',
    };
    assert.deepStrictEqual(sanitizePandocConfig(value), {
      output: { pdf_document: { toc: true, geometry: 'margin=1in' } },
      title: 'Title',
    });
    assert.ok(value.pandoc_args, 'caller input remains unchanged');
  });
});
