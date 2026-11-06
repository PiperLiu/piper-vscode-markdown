'use strict';
// Run against an installed VSIX in isolated --user-data-dir/--extensions-dir only.
// No UI automation, real cloud credentials, user documents or clipboard data files.
// Required: PIPER040_EVIDENCE, PIPER_PARITY_WORKSPACE, PIPER_PARITY_REPORT,
// PIPER_PARITY_EXPECT_ROOT. Workspace must be a fresh copy of examples/parity.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const images = html => [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map(match => match[1].replace(/&amp;/g, '&'));
const tocCount = html => (html.match(/class="article-toc"/g) || []).length;
async function until(predicate, name, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = predicate(); if (result) return result; await delay(100); }
  throw new Error('Timed out: ' + name);
}
async function clipboardGuard() {
  const child = spawn('swift', [path.join(__dirname, 'clipboard-guard.swift')], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errorOutput = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errorOutput += data; });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Clipboard guard failed: ' + code + ' ' + errorOutput)));
  });
  // Attach a handler immediately so a startup failure cannot become unhandled.
  closed.catch(() => {});
  try { await Promise.race([until(() => output.includes('ready\n'), 'clipboard guard', 60000), closed.then(() => { throw new Error('Clipboard guard exited before ready'); })]); }
  catch (error) { child.stdin.end(); await closed.catch(() => {}); throw error; }
  return async () => { child.stdin.end('restore\n'); await closed; assert.ok(output.includes('restored\n')); };
}
const readClipboard = async () => JSON.parse((await runFile('swift', [path.join(__dirname, 'read-general-clipboard.swift')], { maxBuffer: 8 * 1024 * 1024 })).stdout);
exports.run = async () => {
  const vscode = require('vscode');
  const workspace = process.env.PIPER_PARITY_WORKSPACE;
  const evidence = process.env.PIPER040_EVIDENCE;
  const expectedRoot = process.env.PIPER_PARITY_EXPECT_ROOT;
  for (const value of [workspace, evidence, expectedRoot, process.env.PIPER_PARITY_REPORT]) assert.ok(value && path.isAbsolute(value), 'explicit isolated paths are required');
  const repository = fs.realpathSync(path.join(__dirname, '..'));
  fs.mkdirSync(evidence, { recursive: true });
  for (const directory of [workspace, evidence, expectedRoot]) {
    const relative = path.relative(repository, fs.realpathSync(directory));
    assert.ok(relative.startsWith('..' + path.sep) || path.isAbsolute(relative), 'tests and installation must stay outside the source repository');
  }
  assert.equal(process.env.PIPER_PARITY_PREVIEW_EVIDENCE, undefined, 'UI acceptance is performed separately through CUA');
  assert.notEqual(process.env.PIPER_PARITY_PREVIEW_ONLY, '1', 'full baseline exports are required');
  const report = { startedAt: new Date().toISOString(), checks: [], scope: 'Synthetic installed-package API acceptance; visual menus and PDF pages require separate inspection.' };
  const save = () => fs.writeFileSync(path.join(evidence, 'features-040-report.json'), JSON.stringify(report, null, 2));
  const pass = (name, details = {}) => { report.checks.push({ name, status: 'PASS', ...details }); console.log('040 PASS: ' + name); save(); };
  const requests = [], requestErrors = [], sockets = new Set(), originals = new Map(), previous = new Map();
  let server, restoreClipboard, config, mockMode = 'success', abortOnRequest;
  try {
    const extension = vscode.extensions.getExtension('piperliu.piper-markdown-review');
    assert.ok(extension);
    const installedRelative = path.relative(fs.realpathSync(expectedRoot), fs.realpathSync(extension.extensionPath));
    assert.ok(installedRelative !== '..' && !installedRelative.startsWith('..' + path.sep) && !path.isAbsolute(installedRelative), 'use isolated installed package');
    assert.equal(extension.packageJSON.version, '0.4.0');
    assert.equal(vscode.extensions.getExtension('shd101wyy.markdown-preview-enhanced'), undefined);
    assert.ok(vscode.workspace.isTrusted, 'isolated synthetic workspace must be trusted');
    const api = await extension.activate(), service = api.wechat?.service;
    assert.equal(typeof service?.render, 'function'); assert.equal(typeof service?.copy, 'function');
    assert.equal(typeof api.enhanced?.openPublishingPreview, 'function');
    report.extension = { version: extension.packageJSON.version, path: extension.extensionPath };
    await require('./parity-host').run();
    pass('enhanced preview, HTML, PDF and undoable TOC work without the MPE extension');
    config = vscode.workspace.getConfiguration('piperMarkdown');
    const update = async (key, value) => {
      if (!previous.has(key)) previous.set(key, config.inspect(key)?.globalValue);
      await config.update(key, value, vscode.ConfigurationTarget.Global);
    };
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.method, 'POST'); assert.equal(req.url, '/upload');
        assert.equal(req.headers.authorization, undefined); assert.equal(req.headers['x-requested-with'], undefined);
        assert.equal(req.headers['x-piper-acceptance'], 'synthetic');
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const form = await new Request('http://localhost/upload', { method: 'POST', headers: { 'content-type': req.headers['content-type'] }, body: Buffer.concat(chunks) }).formData();
        assert.equal(form.get('album'), 'acceptance'); assert.equal(form.get('token'), null); assert.equal(form.get('ttl'), null);
        assert.deepEqual([...form.keys()].sort(), ['album', 'asset']);
        const file = form.get('asset'); assert.ok(file && file.size > 0);
        assert.ok(['image/png', 'image/gif'].includes(file.type));
        const bytes = Buffer.from(await file.arrayBuffer()), digest = hash(bytes);
        const url = 'https://images.example.com/acceptance/' + digest + (file.type === 'image/gif' ? '.gif' : '.png');
        requests.push({ sha256: digest, bytes: bytes.length, mime: file.type, url });
        if (mockMode === 'cancel') { abortOnRequest?.(); res.destroy(); return; }
        if (mockMode === 'failure') { res.writeHead(503); res.end('Synthetic host failure'); return; }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: { links: [{ url }] } }));
      } catch (error) {
        // Cancellation can close sibling upload streams while multipart bodies arrive.
        if (mockMode !== 'success' && (error.code === 'ECONNRESET' || error.name === 'AbortError')) return;
        requestErrors.push(String(error.stack || error)); if (!res.headersSent) res.writeHead(500); res.end('Mock assertion failed');
      }
    });
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    for (const [key, value] of Object.entries({ imageHostProvider: 'generic', uploadUrl: 'http://127.0.0.1:' + server.address().port + '/upload', uploadAuthMode: 'none', uploadHeaders: { 'X-Piper-Acceptance': 'synthetic' }, uploadFields: { album: 'acceptance' }, fileField: 'asset', urlField: 'data.links.0.url', wechatSkipLeadingH1: false, wechatIncludeTOC: false })) await update(key, value);
    const source = '# PARITY_040_TITLE 中文标题\n\n[TOC]\n\nPARITY_040_BODY 这是**合法的加粗。**后文，前文*强调。*后文。\n\n英文 foo**bar.**baz 与 `这是**原样。**后文` 保持原样。\n\n## PARITY_040_ASSETS\n\n![合成 PNG](<./assets/空格 image.png>)\n\n![同一 PNG](<./assets/空格 image.png>)\n\n![本地 SVG](./assets/chart.svg)\n\n![GIF 动画](./assets/animation.gif)\n\n行内公式 $E=mc^2$ 与重复 $E=mc^2$。\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n```mermaid\ngraph LR\n  A[Markdown] --> B[WeChat]\n```\n\n## PARITY_040_NOTES\n\n- [x] PARITY_040_TASK_DONE\n- [ ] PARITY_040_TASK_PENDING\n\n这是脚注引用[^note]。\n\n[^note]: PARITY_040_FOOTNOTE 正文脚注。\n\n[本地链接](./第二篇.md) 与 [同文锚点](#parity_040_notes)。\n\n# PARITY_040_LATER_H1\n\nPARITY_040_END\n';
    const uri = vscode.Uri.file(path.join(workspace, 'features-040.md'));
    assert.ok(!fs.existsSync(uri.fsPath), 'fresh feature fixture required'); fs.writeFileSync(uri.fsPath, source);
    for (const name of ['features-040.md', 'assets/空格 image.png', 'assets/chart.svg', 'assets/animation.gif']) originals.set(path.join(workspace, name), fs.readFileSync(path.join(workspace, name)));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    const tabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => tab.input instanceof vscode.TabInputWebview);
    await api.enhanced.openPreview(uri, { beside: true });
    await until(() => tabs().length > 0, 'enhanced preview tab');
    const existingTabs = tabs(), groupCount = vscode.window.tabGroups.all.length;
    await api.enhanced.openPublishingPreview(uri);
    await api.enhanced.openPublishingPreview(uri);
    assert.equal(tabs().length, existingTabs.length); assert.equal(vscode.window.tabGroups.all.length, groupCount);
    assert.ok(existingTabs.every(tab => tabs().includes(tab)), 'publishing preserves existing Webview tab objects');
    pass('reading and publishing reuse the same Webview tab and editor group');
    const kept = await service.render(doc, { onProgress() {} });
    assert.match(kept.html, /<h1[^>]*>PARITY_040_TITLE/); assert.equal(tocCount(kept.html), 1);
    await update('wechatSkipLeadingH1', true); await update('wechatIncludeTOC', true);
    const preview = await service.render(doc, { onProgress() {} });
    assert.equal(requests.length, 0, 'all previews are local'); assert.equal(tocCount(preview.html), 1, 'automatic TOC must not duplicate source TOC');
    assert.ok(preview.omittedTitle); assert.ok(!preview.html.includes('PARITY_040_TITLE'));
    assert.match(preview.html, /<strong[^>]*>合法的加粗。<\/strong>/); assert.match(preview.html, /<em[^>]*>强调。<\/em>/);
    for (const marker of ['PARITY_040_LATER_H1', 'PARITY_040_FOOTNOTE', 'PARITY_040_TASK_DONE', 'PARITY_040_TASK_PENDING', 'PARITY_040_END']) assert.ok(preview.html.includes(marker), marker);
    assert.ok(!/<input\b/i.test(preview.html), 'task states must be static for publishing');
    assert.ok(!/file:\/\//i.test(preview.html + preview.text));
    assert.ok(!preview.text.includes(workspace));
    assert.ok(preview.warnings.length > 0, 'local-link removal must be visible as a diagnostic');
    const previewImages = images(preview.html);
    assert.ok(previewImages.length >= 7, 'PNG, SVG, GIF, repeated formula, display formula and Mermaid are rendered');
    const expectedHashes = new Set(previewImages.map(value => { const match = /^data:(image\/(?:png|gif));base64,(.+)$/.exec(value); assert.ok(match, 'preview image is a supported embedded image'); return hash(Buffer.from(match[2], 'base64')); }));
    assert.equal(expectedHashes.size, preview.uniqueAssets); assert.ok(preview.assets > preview.uniqueAssets, 'duplicate images/formulas share upload bytes');
    assert.ok(expectedHashes.has(hash(originals.get(path.join(workspace, 'assets/animation.gif')))), 'GIF is preserved byte for byte');
    fs.writeFileSync(path.join(evidence, 'publication-preview.html'), preview.html);
    pass('local advanced preview, CJK emphasis, preserved explicit TOC, initial H1 omission, static tasks and safe links', { assets: preview.assets, uniqueAssets: preview.uniqueAssets, warnings: preview.warnings });
    const automaticTocUri = vscode.Uri.file(path.join(workspace, 'features-040-automatic-toc.md'));
    fs.writeFileSync(automaticTocUri.fsPath, '# Title\n\n## Automatic heading\n\nBody.\n');
    const automaticTocDoc = await vscode.workspace.openTextDocument(automaticTocUri);
    assert.equal(tocCount((await service.render(automaticTocDoc)).html), 1);
    await update('wechatIncludeTOC', false);
    assert.equal(tocCount((await service.render(automaticTocDoc)).html), 0);
    assert.equal(tocCount((await service.render(doc)).html), 1, 'turning automatic TOC off preserves an explicit source TOC');
    await update('wechatIncludeTOC', true);
    assert.equal(requests.length, 0);
    pass('automatic body TOC setting adds a TOC only when needed and preserves authored TOCs');
    restoreClipboard = await clipboardGuard();
    const phases = [], beforeUploads = requests.length;
    const copied = await service.copy(doc, { onProgress: event => phases.push(event.phase) });
    const copiedClipboard = await readClipboard(), successful = requests.slice(beforeUploads);
    assert.equal(successful.length, expectedHashes.size); assert.deepEqual(new Set(successful.map(item => item.sha256)), expectedHashes);
    assert.equal(new Set(successful.map(item => item.sha256)).size, successful.length, 'one request per unique resource');
    assert.equal(copied.uniqueAssets, preview.uniqueAssets);
    assert.deepEqual(new Set(images(copied.html)), new Set(successful.map(item => item.url)));
    assert.ok(!/data:image|file:\/\//i.test(copied.html));
    assert.ok(copiedClipboard.html.includes('PARITY_040_BODY')); assert.match(copiedClipboard.html, /<strong[^>]*>合法的加粗。<\/strong>/);
    assert.equal(copiedClipboard.text, copied.text); assert.ok(!copiedClipboard.text.includes('PARITY_040_TITLE'));
    assert.ok(!copiedClipboard.text.includes(workspace) && !/file:\/\//i.test(copiedClipboard.text));
    for (const phase of ['parse', 'convert', 'upload', 'style', 'clipboard']) assert.ok(phases.includes(phase), phase);
    assert.deepEqual(requestErrors, []);
    fs.writeFileSync(path.join(evidence, 'publication-copied.html'), copiedClipboard.html);
    pass('anonymous generic upload, exact preview/copy bytes, resource deduplication and actual HTML/plain clipboard', { requests: successful, phases: [...new Set(phases)] });
    const unchanged = async (name, operation) => {
      const before = await readClipboard(); await assert.rejects(operation); const after = await readClipboard();
      assert.deepEqual(after, before, name + ' must not change any observed clipboard field'); pass(name);
    };
    const cancelled = new AbortController(); cancelled.abort();
    const beforeCancelled = requests.length;
    await unchanged('pre-cancelled copy preserves clipboard', () => service.copy(doc, { signal: cancelled.signal, onProgress() {} }));
    assert.equal(requests.length, beforeCancelled);
    mockMode = 'failure';
    await unchanged('failed host upload preserves clipboard', () => service.copy(doc, { onProgress() {} }));
    mockMode = 'cancel'; const duringUpload = new AbortController(); abortOnRequest = () => duringUpload.abort();
    const beforeMidCancel = requests.length;
    await unchanged('cancellation during upload preserves clipboard', () => service.copy(doc, { signal: duringUpload.signal, onProgress() {} }));
    assert.ok(requests.length > beforeMidCancel, 'cancellation happened during actual network upload');
    mockMode = 'success'; abortOnRequest = undefined;
    const unsupportedUri = vscode.Uri.file(path.join(workspace, 'features-040-unsupported.md'));
    fs.writeFileSync(unsupportedUri.fsPath, '# Title\n\n```plantuml\nAlice -> Bob\n```\n');
    const unsupportedDoc = await vscode.workspace.openTextDocument(unsupportedUri);
    const beforeUnsupported = requests.length;
    await unchanged('unsupported external-tool diagram fails before upload or clipboard writes', () => service.copy(unsupportedDoc, { onProgress() {} }));
    assert.equal(requests.length, beforeUnsupported);
    await restoreClipboard(); restoreClipboard = undefined; report.clipboardRestored = true;
    for (const [filename, bytes] of originals) assert.deepEqual(fs.readFileSync(filename), bytes, 'source and image bytes unchanged: ' + path.basename(filename));
    assert.equal(doc.getText(), source); assert.equal(doc.isDirty, false);
    assert.deepEqual(requestErrors, []);
    pass('publication rendering and uploads leave Markdown and local assets unchanged');
    // The standard export path must ignore publishing-only H1 omission and retain CJK.
    const htmlTarget = vscode.Uri.file(path.join(workspace, 'features-040.standard.html'));
    const htmlResult = await vscode.commands.executeCommand('piperMarkdown.exportHTML', uri, htmlTarget);
    assert.equal(htmlResult?.fsPath, htmlTarget.fsPath);
    const standardHTML = fs.readFileSync(htmlTarget.fsPath, 'utf8');
    assert.match(standardHTML, /<h1[^>]*>PARITY_040_TITLE/); assert.match(standardHTML, /<strong[^>]*>合法的加粗。<\/strong>/);
    pass('standard HTML preserves title and CJK with publication title omission enabled');
    report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.error = String(error.stack || error); throw error; }
  finally {
    const cleanupErrors = [];
    if (restoreClipboard) { try { await restoreClipboard(); report.clipboardRestored = true; } catch (error) { cleanupErrors.push('Clipboard restore: ' + error.message); } }
    if (server) { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
    if (config) for (const [key, value] of [...previous].reverse()) { try { await config.update(key, value, vscode.ConfigurationTarget.Global); } catch (error) { cleanupErrors.push('Restore isolated setting ' + key + ': ' + error.message); } }
    if (cleanupErrors.length) { report.status = 'FAIL'; report.cleanupErrors = cleanupErrors; }
    report.finishedAt = new Date().toISOString(); save();
    if (cleanupErrors.length) throw new Error(cleanupErrors.join('\n'));
  }
};
