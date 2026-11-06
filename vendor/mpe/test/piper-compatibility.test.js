/* global suite, test, suiteSetup, suiteTeardown, setup, teardown */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const {
  recorder,
  stubPlugin,
  setNamespaces,
  setWorkspaceTrusted,
  setConfigLoader,
  setFileExists,
  setWorkspaceFolderResolver,
} = require('./vscode-stub');
let api;
const file = path.join(__dirname, '.piper-compatibility.bundle.cjs');
const current = 'piperMarkdown.enhanced';
const legacy = 'markdown-preview-enhanced';
suite('Piper namespace and setting compatibility', function () {
  this.timeout(30000);
  suiteSetup(async () => {
    const result = await esbuild.build({
      stdin: {
        contents:
          "export * from './src/config'; export { initExtensionCommon } from './src/extension-common'; export { default as NotebooksManager } from './src/notebooks-manager'; export { Uri } from 'vscode';",
        resolveDir: path.join(__dirname, '..'),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
      plugins: [stubPlugin()],
    });
    fs.writeFileSync(file, result.outputFiles[0].text);
    api = require(file);
  });
  suiteTeardown(() => fs.unlinkSync(file));
  setup(() => {
    setNamespaces({ [current]: {}, [legacy]: {} });
    setWorkspaceTrusted(true);
    recorder.reset();
  });
  teardown(() => {
    setNamespaces(undefined);
    setConfigLoader(undefined);
    setFileExists(undefined);
    setWorkspaceFolderResolver(() => undefined);
    setWorkspaceTrusted(true);
  });
  test('old explicit values survive new registered defaults', () => {
    setNamespaces({
      [current]: { defaultValue: { scrollSync: true } },
      [legacy]: { globalValue: { scrollSync: false } },
    });
    assert.strictEqual(api.getMPEConfig('scrollSync'), false);
  });
  test('new explicit false wins over old workspace true', () => {
    setNamespaces({
      [current]: { globalValue: { scrollSync: false } },
      [legacy]: { workspaceValue: { scrollSync: true } },
    });
    assert.strictEqual(api.getMPEConfig('scrollSync'), false);
  });
  test('inspection never promotes workspace paths into trusted user scope', () => {
    setNamespaces({
      [current]: { workspaceValue: { configPath: '/evil' } },
      [legacy]: { globalValue: { configPath: '/user' } },
    });
    assert.strictEqual(api.getMPEConfig('configPath'), '/user');
    const inspected = api.inspectMPEConfig('configPath');
    assert.strictEqual(inspected.globalValue, '/user');
    assert.strictEqual(inspected.workspaceValue, '/evil');
  });
  test('code and preview scripts need user permission and workspace trust', () => {
    for (const key of ['enableScriptExecution', 'enablePreviewScripts']) {
      setNamespaces({
        [current]: { workspaceValue: { [key]: true } },
        [legacy]: {},
      });
      assert.strictEqual(api.getMPEConfig(key), false);
      setNamespaces({
        [current]: {},
        [legacy]: { globalValue: { [key]: true } },
      });
      assert.strictEqual(api.getMPEConfig(key), true);
      setWorkspaceTrusted(false);
      assert.strictEqual(api.getMPEConfig(key), false);
      setWorkspaceTrusted(true);
      setNamespaces({
        [current]: { globalValue: { [key]: false } },
        [legacy]: { globalValue: { [key]: true } },
      });
      assert.strictEqual(api.getMPEConfig(key), false);
    }
  });
  test('host command paths and arguments ignore workspace settings in either namespace', () => {
    for (const key of api.HOST_ONLY_CONFIG_KEYS) {
      setNamespaces({
        [current]: {
          defaultValue: { [key]: 'DEFAULT' },
          workspaceValue: { [key]: 'EVIL' },
        },
        [legacy]: { workspaceValue: { [key]: 'OLD EVIL' } },
      });
      assert.strictEqual(api.getMPEConfig(key), 'DEFAULT', key);
      setNamespaces({
        [current]: {
          globalValue: { [key]: '' },
          workspaceValue: { [key]: 'EVIL' },
        },
        [legacy]: { globalValue: { [key]: 'OLD USER' } },
      });
      assert.strictEqual(api.getMPEConfig(key), '', key);
    }
  });
  test('repository config cannot override user tools or enable execution, while style settings still merge', async () => {
    setWorkspaceFolderResolver(() => ({
      uri: api.Uri.file('/ws'),
      name: 'ws',
      index: 0,
    }));
    setFileExists(() => true);
    setNamespaces({
      [current]: {
        globalValue: { d2Path: '/user/d2' },
        defaultValue: { latexEngine: 'pdflatex', pandocArguments: [] },
      },
      [legacy]: {},
    });
    setConfigLoader((directory) =>
      path.normalize(directory) === '/ws/.crossnote'
        ? {
            d2Path: '/repo/evil',
            latexEngine: '/repo/evil',
            pandocArguments: ['--filter=/repo/evil'],
            enableScriptExecution: true,
            globalCss: 'WORKSPACE CSS',
            mermaidConfig: { theme: 'forest' },
          }
        : {
            d2Path: '/global/d2',
            latexEngine: '/user/latex',
            pandocArguments: ['--standalone'],
            globalCss: 'USER CSS',
          },
    );
    const manager = new api.NotebooksManager({
      subscriptions: [],
      extensionPath: '/ext',
      globalStorageUri: { fsPath: '/storage' },
    });
    const notebook = await manager.getNotebook(api.Uri.file('/ws/a.md'));
    assert.strictEqual(notebook.config.d2Path, '/user/d2');
    assert.strictEqual(notebook.config.latexEngine, 'pdflatex');
    assert.deepStrictEqual(notebook.config.pandocArguments, []);
    assert.strictEqual(notebook.config.enableScriptExecution, false);
    assert.strictEqual(notebook.config.globalCss, 'USER CSSWORKSPACE CSS');
    assert.strictEqual(notebook.config.mermaidConfig.theme, 'forest');
  });
  test('updates only write the Piper namespace at the requested scope', async () => {
    await api.updateMPEConfig('scrollSync', false, 2);
    assert.deepStrictEqual(recorder.configUpdates, [
      { namespace: current, section: 'scrollSync', value: false, target: 2 },
    ]);
  });
  test('activation does not rewrite user editor associations and observes both namespaces', async () => {
    await api.initExtensionCommon({
      subscriptions: [],
      globalState: {
        get: (_key, fallback) => fallback,
        update: async () => {},
      },
      extensionPath: '/ext',
      globalStorageUri: { fsPath: '/ext/storage' },
    });
    assert.deepStrictEqual(recorder.configUpdates, []);
    assert.ok(
      recorder.commands.has('piperMarkdown.enhanced.applyDefaultEditor'),
    );
    assert.ok(
      [...recorder.commands.keys()].every(
        (id) =>
          !id.startsWith('markdown-preview-enhanced.') &&
          !id.startsWith('_crossnote.'),
      ),
    );
    for (const namespace of [current, legacy]) {
      let seen = false;
      for (const handler of recorder.configHandlers)
        handler({
          affectsConfiguration: (value) => {
            if (value === namespace) seen = true;
            return false;
          },
        });
      assert.strictEqual(seen, true);
    }
  });
  test('manifest isolates all public commands, settings, and custom editors', () => {
    const manifest = require('../package.json');
    assert.ok(
      manifest.contributes.commands.every((command) =>
        command.command.startsWith(current + '.'),
      ),
    );
    assert.ok(
      Object.keys(manifest.contributes.configuration.properties).every((key) =>
        key.startsWith(current + '.'),
      ),
    );
    assert.strictEqual(
      manifest.contributes.configuration.properties[
        current + '.enableScriptExecution'
      ].scope,
      'application',
    );
    assert.strictEqual(
      manifest.contributes.customEditors[0].viewType,
      'piper-markdown-enhanced',
    );
  });
});
