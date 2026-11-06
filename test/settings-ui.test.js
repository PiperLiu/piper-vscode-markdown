'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createSettingsUI } = require('../src/settings-ui');
const { readConfig } = require('../src/config');
const { credentialScope } = require('../src/upload');

const secretKey = config => 'upload:' + crypto.createHash('sha256').update(credentialScope(config)).digest('hex');
const clone = value => structuredClone(value);
function harness({ language = 'en', global = {}, workspace = {}, folder = {}, steps = [], root = '/fixture', documentPath = path.join(root, 'article.md'), editResult = true, failUpdate, failSecretStore } = {}) {
  const stores = { 1: clone(global), 2: clone(workspace), 3: clone(folder) };
  const prompts = [], updates = [], secretEvents = [], messages = [], commands = [], secretStore = new Map();
  let source = '# Fixture\n', pending = [...steps];
  const uri = { scheme: 'file', fsPath: documentPath, toString: () => 'file://' + documentPath };
  const doc = { uri, languageId: 'markdown', getText: () => source };
  const configuration = {
    inspect(key) { return { globalValue: stores[1][key], workspaceValue: stores[2][key], workspaceFolderValue: stores[3][key] }; },
    async update(key, value, target) {
      if (failUpdate) await failUpdate(key, value, target);
      updates.push({ key, value, target });
      if (value === undefined) delete stores[target][key]; else stores[target][key] = value;
    },
  };
  const next = (kind, options, choices) => {
    const step = pending.shift();
    assert.ok(step, `unexpected ${kind}: ${options.title || options.openLabel}`);
    assert.equal(step.kind, kind);
    prompts.push({ kind, options, choices });
    step.inspect?.({ options, choices, stores, prompts });
    if (step.cancel) return undefined;
    if (kind === 'pick') { const chosen = choices.find(item => item.value === step.value); assert.ok(chosen, `missing choice ${step.value}`); return chosen; }
    if (kind === 'input' && options.validateInput) assert.equal(options.validateInput(step.value), undefined, 'test input must pass the real UI validator');
    return step.value;
  };
  const editor = { document: doc, selection: { active: 0 }, async edit(callback) {
    const insertions = []; callback({ insert: (position, text) => insertions.push({ position, text }) });
    if (editResult instanceof Error) throw editResult;
    if (!editResult) return false;
    source += insertions.map(item => item.text).join(''); return true;
  } };
  const vscode = {
    env: { language }, ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    workspace: { getConfiguration: name => name === 'piperMarkdown' ? configuration : { inspect: () => undefined }, getWorkspaceFolder: () => ({ uri: { fsPath: root } }) },
    window: {
      visibleTextEditors: [editor], showTextDocument: async () => editor,
      showQuickPick: async (choices, options) => next('pick', options, choices),
      showInputBox: async options => next('input', options),
      showOpenDialog: async options => next('file', options),
      showInformationMessage: async message => { messages.push(message); },
    },
    commands: { executeCommand: async (...args) => { commands.push(args); } },
  };
  const context = { secrets: {
    async get(key) { secretEvents.push({ action: 'get', key }); return secretStore.get(key); },
    async store(key, value) { if (failSecretStore) throw new Error('simulated secret storage failure'); secretEvents.push({ action: 'store', key }); secretStore.set(key, value); },
    async delete(key) { secretEvents.push({ action: 'delete', key }); secretStore.delete(key); },
  } };
  const cfg = () => readConfig(vscode.workspace, uri);
  return { ui: createSettingsUI(vscode, context, cfg, secretKey), cfg, doc, stores, prompts, updates, secretEvents, secretStore, messages, commands, remaining: () => pending.length };
}
const genericSteps = () => [
  { kind: 'pick', value: 'generic' },
  { kind: 'input', value: 'https://uploads.example.com/images' },
  { kind: 'pick', value: 'header' },
  { kind: 'input', value: 'X-Image-Key' },
  { kind: 'input', value: 'Token ' },
  { kind: 'input', value: 'asset' },
  { kind: 'input', value: 'data.links.0.url' },
  { kind: 'input', value: '{"Accept":"application/json"}' },
  { kind: 'input', value: '{"album":"fixture"}' },
  { kind: 'input', value: 'synthetic-upload-credential' },
];

test('image-host setup cancellation preserves prior settings and credentials at every connection step', async () => {
  const initial = { uploadUrl: 'https://old.example.com/upload', imageHostProvider: 'piper', ttl: '3h' };
  for (let index = 0; index < 9; index++) {
    const steps = genericSteps().slice(0, index + 1); steps[index] = { kind: steps[index].kind, cancel: true };
    const h = harness({ global: initial, steps });
    await h.ui.configureHost(h.doc, true);
    assert.deepEqual(h.stores[1], initial, `cancel step ${index}`);
    assert.equal(h.updates.length, 0); assert.equal(h.secretEvents.length, 0); assert.equal(h.remaining(), 0);
  }
});

test('cancel at setup credential step leaves the previous connection unchanged', async () => {
  const initial = { uploadUrl: 'https://old.example.com/upload', imageHostProvider: 'piper', ttl: '3h' };
  const steps = genericSteps(); steps[9] = { kind: 'input', cancel: true };
  const h = harness({ global: initial, steps }); await h.ui.configureHost(h.doc, true);
  assert.deepEqual(h.stores[1], initial); assert.equal(h.secretStore.size, 0);
});

test('successful Generic setup uses actual provider/auth credential scope and stores no secret in settings', async () => {
  const h = harness({ steps: genericSteps() }); await h.ui.configureHost(h.doc);
  const config = h.cfg();
  assert.equal(config.imageHostProvider, 'generic'); assert.equal(config.uploadHeaderName, 'X-Image-Key');
  assert.equal(config.uploadHeaderPrefix, 'Token '); assert.equal(config.fileField, 'asset');
  assert.equal(config.urlField, 'data.links.0.url'); assert.deepEqual(config.uploadFields, { album: 'fixture' });
  assert.equal(h.secretStore.get(secretKey(config)), 'synthetic-upload-credential');
  assert.doesNotMatch(JSON.stringify(h.stores), /synthetic-upload-credential/);
  assert.ok(h.updates.every(update => update.target === 1));
  const alternate = { ...config, uploadHeaderName: 'Authorization' };
  assert.notEqual(secretKey(alternate), secretKey(config)); assert.equal(h.secretStore.get(secretKey(alternate)), undefined);
});

test('partial settings write failure rolls the connection back before credential storage', async () => {
  const initial = { imageHostProvider: 'piper', uploadUrl: 'https://old.example.com/upload', fileField: 'previous-file' };
  let failed = false;
  const h = harness({ global: initial, steps: genericSteps(), failUpdate(key) { if (!failed && key === 'fileField') { failed = true; throw new Error('simulated settings write failure'); } } });
  await assert.rejects(h.ui.configureHost(h.doc, true), /simulated settings write failure/);
  assert.deepEqual(h.stores[1], initial); assert.equal(h.secretStore.size, 0);
});

test('invalid extra credential metadata is rejected before any settings or secret writes', async () => {
  const steps = genericSteps().slice(0, 9); steps[7].value = '{"Authorization":"do-not-store-this"}';
  const h = harness({ steps });
  await assert.rejects(h.ui.configureHost(h.doc), /凭据|credential/i);
  assert.equal(h.updates.length, 0); assert.equal(h.secretEvents.length, 0);
});

for (const [language, title, saved] of [['en', 'Image host upload credential', 'Upload credential saved'], ['zh-cn', '图床上传凭据', '上传凭据已保存']]) {
  test(`direct credential action has ${language} labels, a password input, and the legacy Piper scope`, async () => {
    const global = { imageHostProvider: 'piper', uploadUrl: 'https://images.example.com/api/public-images' };
    const h = harness({ language, global, steps: [{ kind: 'input', value: 'synthetic-token', inspect({ options }) { assert.ok(options.password); assert.match(options.title, new RegExp(title)); assert.ok(options.title.endsWith('images.example.com')); assert.equal(options.value, undefined); } }] });
    await h.ui.setToken(h.doc);
    const legacyKey = 'upload:' + crypto.createHash('sha256').update(global.uploadUrl).digest('hex');
    assert.equal(h.secretStore.get(legacyKey), 'synthetic-token'); assert.equal(h.updates.length, 0);
    assert.match(h.messages[0], new RegExp(saved));
    await h.ui.clearToken(h.doc); assert.equal(h.secretStore.size, 0);
  });
}

test('cancel direct credential entry keeps the saved secret', async () => {
  const h = harness({ global: { uploadUrl: 'https://images.example.com/upload' }, steps: [{ kind: 'input', cancel: true }] });
  const key = secretKey(h.cfg()); h.secretStore.set(key, 'existing-secret');
  await h.ui.setToken(h.doc); assert.equal(h.secretStore.get(key), 'existing-secret'); assert.deepEqual(h.secretEvents, []);
});

test('anonymous Generic setup and direct credential action never prompt for or store a secret', async () => {
  const h = harness({ steps: [
    { kind: 'pick', value: 'generic' }, { kind: 'input', value: 'https://uploads.example.com/images' },
    { kind: 'pick', value: 'none' }, { kind: 'input', value: 'image' }, { kind: 'input', value: 'url' },
    { kind: 'input', value: '{}' }, { kind: 'input', value: '{}' },
  ] });
  await h.ui.configureHost(h.doc); await h.ui.setToken(h.doc);
  assert.equal(h.cfg().uploadAuthMode, 'none'); assert.equal(h.secretEvents.length, 0);
  assert.ok(h.prompts.every(prompt => !prompt.options.password)); assert.ok(h.messages.some(message => /does not require/.test(message)));
});

test('style changes update the existing scope immediately and the next menu reflects the new value', async () => {
  const h = harness({ workspace: { fontSize: 17 }, steps: [
    { kind: 'pick', value: 'fontSize' }, { kind: 'input', value: '20' },
    { kind: 'pick', value: 'done', inspect({ choices }) { assert.equal(choices.find(choice => choice.value === 'fontSize').description, '20 px'); } },
  ] });
  await h.ui.configureStyle(h.doc); assert.equal(h.cfg().fontSize, 20);
  assert.deepEqual(h.updates, [{ key: 'fontSize', value: 20, target: 2 }]);
  const before = clone(h.stores);
  for (const [key, value] of [['fontSize', NaN], ['fontSize', 25], ['wechatLineHeight', 0], ['wechatAccentColor', '#bad'], ['wechatPreset', 'unknown'], ['wechatHeadingStyle', 'script'], ['skipLeadingH1', 'true'], ['uploadUrl', 'https://attacker.example']]) await assert.rejects(h.ui.updateSetting(h.doc, key, value));
  assert.deepEqual(h.stores, before);
  await h.ui.updateSetting(h.doc, 'includeTOC', true); assert.equal(h.cfg().wechatIncludeTOC, true);
});

async function imageFixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'piper-settings-ui-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace'), outside = path.join(base, 'outside');
  await fs.mkdir(root); await fs.mkdir(outside);
  const original = Buffer.from('synthetic image bytes'), image = path.join(outside, '图片 (original).png');
  await fs.writeFile(image, original); await fs.writeFile(path.join(root, 'article.md'), '# Fixture\n');
  return { base, root, outside, image, original };
}

test('local image insertion copies bytes inside the workspace and inserts an escaped relative path', async t => {
  const f = await imageFixture(t), h = harness({ root: f.root, steps: [{ kind: 'file', value: [{ scheme: 'file', fsPath: f.image }] }] });
  await h.ui.insertImage(h.doc, 'file');
  const reference = h.doc.getText().match(/!\[\]\(([^\n]+)\)/)[1];
  assert.match(reference, /^images\//); assert.match(reference, /%28/); assert.doesNotMatch(reference, /[()\s]/);
  const destination = path.resolve(f.root, decodeURIComponent(reference));
  assert.deepEqual(await fs.readFile(destination), f.original); assert.deepEqual(await fs.readFile(f.image), f.original);
  assert.equal(await fs.readFile(h.doc.uri.fsPath, 'utf8'), '# Fixture\n', 'VS Code edit remains unsaved');
});

test('image links are inserted without file writes and Markdown delimiter characters are escaped', async t => {
  const f = await imageFixture(t), h = harness({ root: f.root, steps: [{ kind: 'input', value: 'https://images.example.com/a(b).png' }] });
  await h.ui.insertImage(h.doc, 'link'); assert.match(h.doc.getText(), /a%28b%29\.png/);
  assert.deepEqual(await fs.readdir(f.root), ['article.md']);
});

test('images symlink cannot send a copied image outside the workspace', async t => {
  const f = await imageFixture(t); await fs.symlink(f.outside, path.join(f.root, 'images'));
  const before = await fs.readdir(f.outside), h = harness({ root: f.root, steps: [{ kind: 'file', value: [{ scheme: 'file', fsPath: f.image }] }] });
  await assert.rejects(h.ui.insertImage(h.doc, 'file'), /inside this workspace|工作区/);
  assert.deepEqual(await fs.readdir(f.outside), before); assert.equal(h.doc.getText(), '# Fixture\n');
});

test('document-directory symlink is rejected before creating an outside images directory', async t => {
  const f = await imageFixture(t); await fs.symlink(f.outside, path.join(f.root, 'linked'));
  const before = await fs.readdir(f.outside), h = harness({ root: f.root, documentPath: path.join(f.root, 'linked/article.md'), steps: [{ kind: 'file', value: [{ scheme: 'file', fsPath: f.image }] }] });
  await assert.rejects(h.ui.insertImage(h.doc, 'file'), /inside this workspace|工作区/);
  assert.deepEqual(await fs.readdir(f.outside), before);
});

test('failed local image edit removes the copied asset and preserves the original', async t => {
  for (const editResult of [false, new Error('Document closed')]) {
    const f = await imageFixture(t), h = harness({ root: f.root, editResult, steps: [{ kind: 'file', value: [{ scheme: 'file', fsPath: f.image }] }] });
    await assert.rejects(h.ui.insertImage(h.doc, 'file'), /could not be inserted|无法|Document closed/);
    assert.deepEqual(await fs.readdir(path.join(f.root, 'images')), []); assert.deepEqual(await fs.readFile(f.image), f.original);
  }
});


test('secret-storage failure rolls back the new connection settings', async () => {
  const initial = { imageHostProvider: 'piper', uploadUrl: 'https://old.example.com/upload' };
  const h = harness({ global: initial, steps: genericSteps(), failSecretStore: true });
  await assert.rejects(h.ui.configureHost(h.doc, true), /simulated secret storage failure/);
  assert.deepEqual(h.stores[1], initial); assert.equal(h.secretStore.size, 0);
});

test('existing credential for the exact Generic profile is reused without another password dialog', async () => {
  const h = harness({ steps: genericSteps().slice(0, 9) });
  const expected = { ...h.cfg(), imageHostProvider: 'generic', uploadUrl: 'https://uploads.example.com/images', uploadAuthMode: 'header', uploadHeaderName: 'X-Image-Key', uploadHeaderPrefix: 'Token ' };
  h.secretStore.set(secretKey(expected), 'existing-profile-secret');
  await h.ui.configureHost(h.doc);
  assert.equal(h.secretStore.get(secretKey(h.cfg())), 'existing-profile-secret');
  assert.ok(h.prompts.every(prompt => !prompt.options.password));
  assert.ok(h.secretEvents.every(event => event.action !== 'store'));
});

test('Qiniu direct credentials are isolated by public image domain', async () => {
  const global = { imageHostProvider: 'qiniu', uploadUrl: 'https://up-z0.qiniup.com', publicBaseUrl: 'https://one.example.com' };
  const h = harness({ global, steps: [{ kind: 'input', value: 'domain-one-token' }, { kind: 'input', value: 'domain-two-token' }] });
  const first = secretKey(h.cfg()); await h.ui.setToken(h.doc);
  h.stores[1].publicBaseUrl = 'https://two.example.com'; const second = secretKey(h.cfg());
  await h.ui.setToken(h.doc); assert.notEqual(first, second);
  assert.equal(h.secretStore.get(first), 'domain-one-token'); assert.equal(h.secretStore.get(second), 'domain-two-token');
  await h.ui.clearToken(h.doc); assert.equal(h.secretStore.get(first), 'domain-one-token'); assert.equal(h.secretStore.has(second), false);
});

test('anonymous host summary does not present missing credentials as an error', async () => {
  const h = harness({ global: { imageHostProvider: 'generic', uploadAuthMode: 'none', uploadUrl: 'https://uploads.example.com/images' }, steps: [{ kind: 'pick', cancel: true, inspect({ choices }) {
    assert.equal(choices.some(item => ['token', 'clear'].includes(item.value)), false);
    assert.match(choices.find(item => item.value === 'none').label, /No upload credential required/);
  } }] });
  await h.ui.configureHost(h.doc); assert.equal(h.updates.length, 0);
});

test('advanced image-host settings include Qiniu domain, key prefix, and Piper lifetime', async () => {
  const h = harness({ global: { uploadUrl: 'https://images.example.com/upload' }, steps: [{ kind: 'pick', value: 'settings' }] });
  await h.ui.configureHost(h.doc);
  assert.equal(h.commands[0][0], 'workbench.action.openSettings');
  for (const key of ['imageHostProvider', 'publicBaseUrl', 'qiniuKeyPrefix', 'ttl']) assert.ok(h.commands[0][1].includes('piperMarkdown.' + key));
});

test('preset selection applies its palette and rhythm, then individual controls remain editable', async () => {
  const h = harness({ steps: [
    { kind: 'pick', value: 'wechatPreset' }, { kind: 'pick', value: 'minimal' },
    { kind: 'pick', value: 'wechatAccentColor', inspect({ choices }) {
      assert.equal(choices.find(choice => choice.value === 'wechatAccentColor').description, '#374151');
      assert.equal(choices.find(choice => choice.value === 'wechatHeadingStyle').description, 'plain');
      assert.equal(choices.find(choice => choice.value === 'wechatLineHeight').description, '1.75');
    } },
    { kind: 'input', value: '#123456' }, { kind: 'pick', value: 'done' },
  ] });
  await h.ui.configureStyle(h.doc);
  assert.equal(h.cfg().wechatPreset, 'minimal'); assert.equal(h.cfg().wechatAccentColor, '#123456');
  assert.equal(h.cfg().wechatHeadingStyle, 'plain'); assert.equal(h.cfg().wechatLineHeight, 1.75);
  assert.equal(h.cfg().fontSize, 16);
});

test('publication scroll sync accepts only booleans and respects existing scope', async () => {
 const h=harness({ workspace: {scrollSync:true} });
 await h.ui.updateSetting(h.doc,'scrollSync',false);
 assert.equal(h.stores[2].scrollSync,false);
 await assert.rejects(h.ui.updateSetting(h.doc,'scrollSync','false'),/boolean/);
});
