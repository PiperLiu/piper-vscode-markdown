/* global suite, test, suiteSetup, suiteTeardown, setup */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const esbuild = require('esbuild');
const file = path.join(__dirname, '.piper-api.bundle.cjs');
let api;
let writes;
let reads;
let opened;
let result;
let notebook;
const source = '/source/article.md';
suite('Piper snapshot export API', function () {
  this.timeout(30000);
  suiteSetup(async () => {
    const build = await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/piper-exports.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
      plugins: [
        {
          name: 'export-boundaries',
          setup(build) {
            build.onResolve({ filter: /^(crossnote|vscode)$/ }, (args) => ({
              path: args.path,
              namespace: 'stub',
            }));
            build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
              contents:
                args.path === 'vscode'
                  ? `module.exports = { Uri: { file: path => ({ fsPath: path }) }, workspace: { fs: { writeFile: (...args) => globalThis.__piperExportTest.write(...args) } }, env: { openExternal: (...args) => globalThis.__piperExportTest.open(...args) } };`
                  : `module.exports = { MarkdownEngine: class {
              constructor({ notebook, filePath }) { this.notebook = notebook; this.filePath = filePath; }
              async generateHTMLTemplateForExport(html, yaml, options) { globalThis.__piperExportTest.appearance = {...this.notebook.config}; return html; }
              async parseMD(markdown, options) { globalThis.__piperExportTest.parsed(markdown, options); return { html: markdown, yamlConfig: { puppeteer: { format: 'A5', margin: { top: '2cm' } } } }; }
              async htmlExportDocument(options) { const text = await this.notebook.fs.readFile(this.filePath); await this.notebook.fs.readFile('/source/import.md'); const parsed = await this.parseMD(text, { useRelativeFilePath: true }); return '<html>' + parsed.html + '</html>'; }
              async chromeExport(options) { const text = await this.notebook.fs.readFile(this.filePath); const parsed = await this.parseMD(text, { useRelativeFilePath: false }); globalThis.__piperExportTest.pdf(parsed.yamlConfig.chrome, options); return '/source/article.pdf'; }
            } };`,
              loader: 'js',
            }));
          },
        },
      ],
    });
    fs.writeFileSync(file, build.outputFiles[0].text);
    api = require(file);
  });
  suiteTeardown(() => {
    fs.unlinkSync(file);
    delete globalThis.__piperExportTest;
  });
  setup(() => {
    writes = [];
    reads = [];
    opened = [];
    result = {};
    notebook = {
      config: { globalCss: '/* existing custom styles */' },
      fs: {
        readFile: async (file) => {
          reads.push(file);
          return 'DISK IMPORT';
        },
      },
    };
    globalThis.__piperExportTest = {
      write: async (uri, bytes) => {
        writes.push({ path: uri.fsPath, text: bytes.toString() });
      },
      open: async (uri) => {
        opened.push(uri.fsPath);
      },
      parsed: (text, options) => {
        result.markdown = text;
        result.options = options;
      },
      pdf: (config, options) => {
        result.pdf = config;
        result.exportOptions = options;
      },
    };
  });
  test('snapshot filesystem preserves base64 encoding for portable binary images', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'piper-snapshot-image-'),
    );
    try {
      const imagePath = path.join(directory, 'image.png');
      const bytes = Buffer.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128, 42,
      ]);
      fs.writeFileSync(imagePath, bytes);
      notebook.fs.readFile = (file, encoding) =>
        fs.promises.readFile(file, encoding || 'utf8');
      const engine = api.createSnapshotEngine(notebook, source, '中文 UNSAVED');
      const encoded = await engine.notebook.fs.readFile(imagePath, 'base64');
      assert.strictEqual(encoded, bytes.toString('base64'));
      assert.deepStrictEqual(Buffer.from(encoded, 'base64'), bytes);
      assert.strictEqual(
        await engine.notebook.fs.readFile(source, 'base64'),
        Buffer.from('中文 UNSAVED').toString('base64'),
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  test('HTML exports unsaved text directly to chosen destination and keeps imports on original FS', async () => {
    const target = await api.exportSnapshot(
      notebook,
      source,
      'UNSAVED',
      'html',
      { targetPath: '/chosen/output.html' },
    );
    assert.strictEqual(target, '/chosen/output.html');
    assert.deepStrictEqual(writes, [
      { path: '/chosen/output.html', text: '<html>UNSAVED</html>' },
    ]);
    assert.deepStrictEqual(reads, ['/source/import.md']);
    assert.strictEqual(result.options.useRelativeFilePath, false);
    assert.deepStrictEqual(opened, []);
  });
  test('PDF sets actual output path before engine writes and preserves print options', async () => {
    const target = await api.exportSnapshot(
      notebook,
      source,
      'UNSAVED PDF',
      'pdf',
      { targetPath: '/chosen/output.pdf', openFile: true },
    );
    assert.strictEqual(target, '/chosen/output.pdf');
    assert.deepStrictEqual(result.pdf, {
      format: 'A5',
      margin: { top: '2cm' },
      path: '/chosen/output.pdf',
    });
    assert.strictEqual(result.markdown, 'UNSAVED PDF');
    assert.strictEqual(result.exportOptions.openFileAfterGeneration, false);
    assert.deepStrictEqual(opened, ['/chosen/output.pdf']);
    assert.deepStrictEqual(reads, []);
    assert.deepStrictEqual(writes, []);
  });
  test('snapshot engines do not mutate the shared notebook filesystem', async () => {
    const original = notebook.fs;
    const a = api.createSnapshotEngine(notebook, source, 'A');
    const b = api.createSnapshotEngine(notebook, source, 'B');
    assert.strictEqual(await a.notebook.fs.readFile(source), 'A');
    assert.strictEqual(await b.notebook.fs.readFile(source), 'B');
    assert.strictEqual(notebook.fs, original);
    assert.notStrictEqual(a.notebook.config, notebook.config);
    assert.strictEqual(
      notebook.config.globalCss,
      '/* existing custom styles */',
    );
    assert.ok(a.notebook.config.globalCss.includes('@media print'));
    assert.ok(a.notebook.config.globalCss.includes('white-space: pre-wrap'));

    assert.strictEqual(await notebook.fs.readFile(source), 'DISK IMPORT');
  });
  for (const linkType of ['symlink', 'hardlink']) {
    test(`rejects ${linkType} targets pointing to the source before HTML or PDF generation`, async () => {
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'piper-source-protection-'),
      );
      const markdownPath = path.join(directory, 'article.md');
      fs.writeFileSync(markdownPath, 'ORIGINAL MARKDOWN');
      try {
        for (const format of ['html', 'pdf']) {
          const linkedTarget = path.join(directory, `output.${format}`);
          if (linkType === 'symlink')
            fs.symlinkSync('./article.md', linkedTarget);
          else fs.linkSync(markdownPath, linkedTarget);
          await assert.rejects(
            api.exportSnapshot(notebook, markdownPath, 'NEW CONTENT', format, {
              targetPath: linkedTarget,
            }),
            /cannot overwrite.*filesystem link/,
          );
          assert.strictEqual(
            fs.readFileSync(markdownPath, 'utf8'),
            'ORIGINAL MARKDOWN',
          );
          assert.strictEqual(
            fs.readFileSync(linkedTarget, 'utf8'),
            'ORIGINAL MARKDOWN',
          );
        }
        assert.deepStrictEqual(writes, []);
        assert.deepStrictEqual(result, {});
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
  test('rejects a source-overwriting or mismatched destination before any writes', async () => {
    await assert.rejects(
      api.exportSnapshot(notebook, source, 'TEXT', 'html', {
        targetPath: source,
      }),
      /overwrite/,
    );
    await assert.rejects(
      api.exportSnapshot(notebook, source, 'TEXT', 'pdf', {
        targetPath: '/chosen/wrong.html',
      }),
      /\.pdf/,
    );
    assert.deepStrictEqual(writes, []);
    assert.strictEqual(
      api.resolveExportTarget('/source/untitled', 'html'),
      '/source/untitled.html',
    );
  });
  test('implicit Mermaid palette follows dark HTML but forced-light PDF stays light', async () => {
    notebook.config = {
      previewTheme: 'one-dark.css',
      mermaidTheme: 'default',
      printBackground: false,
    };
    const engine = api.createSnapshotEngine(
      notebook,
      source,
      '```mermaid\ngraph LR; A-->B\n```',
    );
    await engine.generateHTMLTemplateForExport(
      '<div class="mermaid"></div>',
      {},
      {},
    );
    assert.strictEqual(
      globalThis.__piperExportTest.appearance.mermaidTheme,
      'dark',
    );
    await engine.generateHTMLTemplateForExport(
      '<div class="mermaid"></div>',
      {},
      { isForPrint: true },
    );
    assert.strictEqual(
      globalThis.__piperExportTest.appearance.mermaidTheme,
      'default',
    );
    await engine.generateHTMLTemplateForExport(
      '<div class="mermaid"></div>',
      { print_background: true },
      { isForPrint: true },
    );
    assert.strictEqual(
      globalThis.__piperExportTest.appearance.mermaidTheme,
      'dark',
    );
    assert.strictEqual(notebook.config.mermaidTheme, 'default');
    assert.strictEqual(engine.notebook.config.mermaidTheme, 'default');
  });
  test('an explicitly selected default Mermaid theme remains unchanged on dark pages', async () => {
    notebook.config = {
      previewTheme: 'one-dark.css',
      mermaidTheme: 'default',
      [api.EXPLICIT_MERMAID_STYLE]: true,
    };
    const engine = api.createSnapshotEngine(
      notebook,
      source,
      '```mermaid\ngraph LR; A-->B\n```',
    );
    await engine.generateHTMLTemplateForExport('diagram', {}, {});
    assert.strictEqual(
      globalThis.__piperExportTest.appearance.mermaidTheme,
      'default',
    );
    assert.strictEqual(
      engine.notebook.config[api.EXPLICIT_MERMAID_STYLE],
      true,
    );
  });
  test('custom Mermaid themes, variables and diagram directives are preserved', async () => {
    for (const config of [
      { mermaidTheme: 'forest' },
      {
        mermaidTheme: 'default',
        mermaidConfig: { themeVariables: { lineColor: '#abcdef' } },
      },
    ]) {
      notebook.config = { previewTheme: 'one-dark.css', ...config };
      const engine = api.createSnapshotEngine(
        notebook,
        source,
        '```mermaid\ngraph LR; A-->B\n```',
      );
      await engine.generateHTMLTemplateForExport('diagram', {}, {});
      assert.strictEqual(
        globalThis.__piperExportTest.appearance.mermaidTheme,
        config.mermaidTheme,
      );
      assert.deepStrictEqual(
        globalThis.__piperExportTest.appearance.mermaidConfig,
        config.mermaidConfig,
      );
    }
    notebook.config = { previewTheme: 'one-dark.css', mermaidTheme: 'default' };
    const engine = api.createSnapshotEngine(
      notebook,
      source,
      '```mermaid\n%%{init: {"theme": "forest"}}%%\ngraph LR; A-->B\n```',
    );
    await engine.generateHTMLTemplateForExport('diagram', {}, {});
    assert.strictEqual(
      globalThis.__piperExportTest.appearance.mermaidTheme,
      'default',
    );
  });
  test('adaptive pages receive a legible default diagram canvas without changing the notebook', async () => {
    notebook.config = {
      previewTheme: 'one-dark.css',
      mermaidTheme: 'default',
      exportColorScheme: 'auto',
    };
    const engine = api.createSnapshotEngine(
      notebook,
      source,
      '```mermaid\ngraph LR; A-->B\n```',
    );
    await engine.generateHTMLTemplateForExport('diagram', {}, {});
    assert.strictEqual(
      globalThis.__piperExportTest.appearance.mermaidTheme,
      'default',
    );
    assert.match(
      globalThis.__piperExportTest.appearance.globalCss,
      /div\.mermaid \{ background: #fff/,
    );
    assert.strictEqual(notebook.config.globalCss, undefined);
  });
});
