/* global suite, test, suiteSetup, suiteTeardown */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');
const esbuild = require('esbuild');
let folder, parseEnhanced, bridge;
async function load(file, mocks = {}, plugins = []) {
  const result = await esbuild.build({
    entryPoints: [path.resolve(__dirname, '../src', file)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    packages: 'external',
    plugins,
  });
  const filename = path.resolve(__dirname, '.publishing-test.cjs');
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = function (name) {
    return Object.hasOwn(mocks, name)
      ? mocks[name]
      : Module.prototype.require.call(this, name);
  };
  loaded._compile(result.outputFiles[0].text, filename);
  return loaded.exports;
}
suite('publishing parser and same-panel bridge', function () {
  this.timeout(30000);
  suiteSetup(async () => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'piper-publishing-'));
    fs.writeFileSync(path.join(folder, 'article.md'), '# Disk');
    ({ parseEnhanced } = await load('publishing-parser.ts'));
  });
  suiteTeardown(() => fs.rmSync(folder, { recursive: true, force: true }));
  const parse = (text) =>
    parseEnhanced(text, {
      filename: path.join(folder, 'article.md'),
      root: folder,
    });
  test('publishing parser loads with the actual ESM CJK build adapter', async () => {
    const built = await load('publishing-parser.ts', {}, [
      require('../src/markdown-it-cjk-build.cjs'),
      {
        name: 'inline-cjk-test',
        setup(build) {
          build.onResolve(
            { filter: /^(markdown-it-cjk-friendly|get-east-asian-width)$/ },
            (args) => ({
              path: require.resolve(args.path, {
                paths: [path.dirname(args.importer)],
              }),
            }),
          );
        },
      },
    ]);
    const result = await built.parseEnhanced('# Bundled parser', {
      filename: path.join(folder, 'article.md'),
      root: folder,
    });
    assert.match(result.html, /Bundled parser/);
  });
  test('snapshot retains enhanced content and leaves source untouched', async () => {
    const result = await parse(
      '# Snapshot\n\n正文$x^2$[^a]\n\n[^a]: 注释\n\n```mermaid\ngraph TD\n A-->B\n```\n\n```dot\ndigraph { A -> B }\n```',
    );
    assert.match(result.html, /Snapshot/);
    assert.strictEqual(result.headings[0].line, 0);
    assert.match(result.html, /data-source-line="0"/);
    assert.match(result.html, /mathjax-exps/);
    assert.match(result.html, /footnote/);
    assert.match(result.html, /class="mermaid"/);
    assert.match(result.html, /<svg/);
    assert.strictEqual(
      fs.readFileSync(path.join(folder, 'article.md'), 'utf8'),
      '# Disk',
    );
  });
  test('only local bounded imports and no workspace configuration are loaded', async () => {
    fs.writeFileSync(path.join(folder, 'part.md'), '## Imported');
    fs.mkdirSync(path.join(folder, '.crossnote'));
    fs.writeFileSync(
      path.join(folder, '.crossnote', 'config.js'),
      'throw new Error("must not load")',
    );
    assert.match((await parse('@import "part.md"')).html, /Imported/);
  });
  test('remote imports and executable fence options stop conversion', async () => {
    for (const text of [
      '@import "https://example.com/article.md"',
      '```python {cmd=true}\nprint(1)\n```',
      '```mermaid {kroki=true}\ngraph TD\n A-->B\n```',
    ])
      await assert.rejects(() => parse(text));
  });
  test('remote tool diagrams cannot enter through colon fences', async () => {
    await assert.rejects(
      () => parse(':::plantuml\nA -> B\n:::'),
      /cannot safely convert/,
    );
  });
  test('symlink imports cannot escape the root', async () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'piper-private-'));
    try {
      fs.writeFileSync(path.join(external, 'secret.md'), 'private');
      fs.symlinkSync(
        path.join(external, 'secret.md'),
        path.join(folder, 'escape.md'),
      );
      await assert.rejects(
        () => parse('@import "escape.md"'),
        /outside the workspace/,
      );
    } finally {
      fs.rmSync(external, { recursive: true, force: true });
    }
  });
  test('raw HTML cannot trigger host diagram enhancements', async () => {
    const result = await parse(
      '<script>alert(1)</script>\n\n<div class="plantuml">A -> B</div>',
    );
    assert.doesNotMatch(result.html, /<script/);
    assert.match(result.html, /&lt;script/);
  });
  test('cancelled conversion never succeeds', async () => {
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
      () =>
        parseEnhanced('# Cancel', {
          filename: path.join(folder, 'article.md'),
          root: folder,
          signal: abort.signal,
        }),
      { name: 'AbortError' },
    );
  });
  test('bridge binds actions to its source and rejects stale copy revisions', async () => {
    const messages = [];
    let receive, disposed;
    const uri = {
      scheme: 'file',
      toString: () => 'file:///workspace/article.md',
    };
    const document = { uri, version: 3, lineCount: 5 };
    let copies = 0;
    const exports = [];
    const vscode = {
      workspace: { isTrusted: true, openTextDocument: async () => document },
      l10n: { t: (s) => s },
      window: {},
      env: {},
    };
    bridge = await load('publishing-bridge.ts', { vscode });
    const panel = {
      webview: {
        postMessage: async (m) => messages.push(m),
        onDidReceiveMessage: (fn) => {
          receive = fn;
          return { dispose() {} };
        },
      },
      onDidDispose: (fn) => {
        disposed = fn;
      },
    };
    bridge.setPublishingService({
      render: async () => ({ html: '<p>Body</p>' }),
      copy: async () => {
        copies++;
        return {};
      },
      exportStandard: async (doc, format) => exports.push({ doc, format }),
    });
    bridge.attachPublishing(panel, () => uri);
    const send = (payload) =>
      receive({ command: 'piperPublishing', args: [payload] });
    await send({ action: 'ready' });
    assert.ok(!messages.some((m) => m.type === 'content'));
    await send({ action: 'copy' });
    assert.strictEqual(copies, 1);
    copies = 0;
    await send({ action: 'mode', value: true });
    assert.ok(
      messages.some(
        (m) =>
          m.type === 'content' &&
          m.source === uri.toString() &&
          m.version === 3,
      ),
    );
    await send({ action: 'copy', source: 'file:///other.md', version: 3 });
    assert.strictEqual(copies, 0);
    await send({ action: 'copy', source: uri.toString(), version: 2 });
    assert.strictEqual(copies, 0);
    await send({ action: 'copy', source: uri.toString(), version: 3 });
    assert.strictEqual(copies, 1);
    await send({
      action: 'exportStandard',
      format: 'html',
      source: 'file:///other.md',
    });
    await send({ action: 'exportStandard', format: 'pdf' });
    await send({ action: 'exportStandard', format: 'shell' });
    assert.deepStrictEqual(exports, [
      { doc: document, format: 'html' },
      { doc: document, format: 'pdf' },
    ]);
    disposed();
  });
  async function sessionFor(implementation) {
    const messages = [];
    let receive, disposed;
    const uri = { scheme: 'file', toString: () => 'file:///workspace/race.md' };
    const document = { uri, version: 1, lineCount: 10 };
    const vscode = {
      workspace: { isTrusted: true, openTextDocument: async () => document },
      l10n: { t: (s) => s },
      window: {},
      env: {},
    };
    const api = await load('publishing-bridge.ts', { vscode });
    const panel = {
      webview: {
        postMessage: async (message) => messages.push(message),
        onDidReceiveMessage: (callback) => {
          receive = callback;
          return { dispose() {} };
        },
      },
      onDidDispose: (callback) => {
        disposed = callback;
      },
    };
    api.setPublishingService({
      render: async (doc) => ({ html: `<p>version ${doc.version}</p>` }),
      ...implementation,
    });
    api.attachPublishing(panel, () => uri);
    const send = (payload) =>
      receive({ command: 'piperPublishing', args: [payload] });
    await send({ action: 'ready' });
    await send({ action: 'mode', value: true });
    return { api, messages, document, send, dispose: () => disposed() };
  }
  test('cancelled copy clears busy and can be retried without an error event', async () => {
    let begin,
      attempts = 0;
    const started = new Promise((resolve) => (begin = resolve));
    const run = await sessionFor({
      copy: async (_doc, { signal }) => {
        attempts++;
        if (attempts > 1) return { message: 'retry succeeded' };
        begin();
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            setTimeout(
              () => reject(new DOMException('Cancelled', 'AbortError')),
              30,
            ),
          ),
        );
      },
    });
    try {
      const operation = run.send({
        action: 'copy',
        source: run.document.uri.toString(),
        version: 1,
      });
      await started;
      await run.send({ action: 'cancel' });
      await operation;
      assert.ok(run.messages.some((m) => m.type === 'cancelled'));
      assert.ok(!run.messages.some((m) => m.type === 'error'));
      await run.send({
        action: 'copy',
        source: run.document.uri.toString(),
        version: 1,
      });
      assert.strictEqual(attempts, 2);
      assert.ok(
        run.messages.some(
          (m) => m.type === 'copied' && m.result.message === 'retry succeeded',
        ),
      );
    } finally {
      run.dispose();
    }
  });
  test('edits during slow cancellation render the pending document revision', async () => {
    let begin;
    const started = new Promise((resolve) => (begin = resolve));
    const run = await sessionFor({
      copy: async (_doc, { signal }) => {
        begin();
        return new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            setTimeout(
              () => reject(new DOMException('Cancelled', 'AbortError')),
              300,
            ),
          ),
        );
      },
    });
    try {
      const operation = run.send({
        action: 'copy',
        source: run.document.uri.toString(),
        version: 1,
      });
      await started;
      run.document.version = 2;
      run.api.invalidatePublishing(run.document.uri);
      await operation;
      assert.deepStrictEqual(
        run.messages.filter((m) => m.type === 'content').map((m) => m.version),
        [1, 2],
      );
      assert.ok(
        !run.messages.some((m) => m.type === 'error' || m.type === 'copied'),
      );
    } finally {
      run.dispose();
    }
  });
  test('late state and render results cannot overwrite a newer revision', async () => {
    let finishState, finishRender;
    let stateCalls = 0;
    const run = await sessionFor({
      getState: async () => {
        stateCalls++;
        return {};
      },
      copy: async () => ({}),
    });
    try {
      run.api.setPublishingService({
        getState: async () => new Promise((resolve) => (finishState = resolve)),
        render: async () => new Promise((resolve) => (finishRender = resolve)),
        copy: async () => ({}),
      });
      const leave = run.send({ action: 'mode', value: false });
      await new Promise((resolve) => setImmediate(resolve));
      run.document.version = 2;
      run.api.invalidatePublishing(run.document.uri);
      finishState({ settings: { preset: 'stale' } });
      await leave;
      assert.ok(
        !run.messages.some(
          (m) => m.type === 'state' && m.settings?.preset === 'stale',
        ),
      );
      const enter = run.send({ action: 'mode', value: true });
      await new Promise((resolve) => setImmediate(resolve));
      run.document.version = 3;
      run.api.invalidatePublishing(run.document.uri);
      finishRender({ html: 'stale-render' });
      await enter;
      assert.ok(
        !run.messages.some(
          (m) => m.type === 'content' && m.html === 'stale-render',
        ),
      );
    } finally {
      run.dispose();
    }
  });
});
