// Run only in an isolated VS Code Extension Development Host, against a copied fixture.
// PIPER_PARITY_MODE=mpe|piper; PIPER_PARITY_WORKSPACE and PIPER_PARITY_REPORT are required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(predicate, label, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await predicate();
    if (result) return result;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function completeFile(filename, kind) {
  return until(() => {
    try {
      const buffer = fs.readFileSync(filename);
      if (kind === 'pdf') return buffer.subarray(0, 5).toString() === '%PDF-' && buffer.subarray(-2048).includes(Buffer.from('%%EOF')) && buffer;
      return buffer.length > 1024 && /<\/html>\s*$/i.test(buffer.toString()) && buffer;
    } catch { return false; }
  }, filename, 180000);
}
exports.run = async () => {
  const vscode = require('vscode');
  const mode = process.env.PIPER_PARITY_MODE || 'piper';
  const workspace = process.env.PIPER_PARITY_WORKSPACE;
  const reportPath = process.env.PIPER_PARITY_REPORT;
  assert.ok(['mpe', 'piper'].includes(mode));
  assert.ok(workspace && path.isAbsolute(workspace), 'explicit temporary workspace required');
  assert.ok(reportPath && path.isAbsolute(reportPath), 'explicit external report path required');
  const sourceFixture = fs.realpathSync(path.join(__dirname, '../examples/parity'));
  assert.notEqual(fs.realpathSync(workspace), sourceFixture, 'never export into source fixtures');
  const report = { mode, startedAt: new Date().toISOString(), vscode: vscode.version, checks: [], outputs: {} };
  const saveReport = () => { fs.mkdirSync(path.dirname(reportPath), { recursive: true }); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); };
  const previewEvidence = process.env.PIPER_PARITY_PREVIEW_EVIDENCE;
  const checkpoint = async (stage, details = {}) => {
    if (!previewEvidence) return;
    fs.mkdirSync(previewEvidence, { recursive: true });
    fs.writeFileSync(path.join(previewEvidence, 'stage.json'), JSON.stringify({ stage, ...details }));
    const ack = await until(() => {
      try { return JSON.parse(fs.readFileSync(path.join(previewEvidence, `${stage}.json`), 'utf8')); } catch { return false; }
    }, `real Webview DOM ${stage}`, 90000);
    assert.equal(ack.status, 'PASS', ack.error || `Webview ${stage}`);
    passed(`real Webview ${stage}`, ack);
  };
  const passed = (name, details = {}) => { report.checks.push({ name, status: 'PASS', ...details }); console.log(`PARITY PASS: ${name}`); saveReport(); };
  try {
    const id = mode === 'mpe' ? 'shd101wyy.markdown-preview-enhanced' : 'piperliu.piper-markdown-review';
    const extension = vscode.extensions.getExtension(id);
    assert.ok(extension, `${id} discovered`);
    if (process.env.PIPER_PARITY_EXPECT_ROOT) assert.ok(extension.extensionPath.startsWith(process.env.PIPER_PARITY_EXPECT_ROOT), 'load the isolated installed package');
    if (mode === 'piper') assert.equal(vscode.extensions.getExtension('shd101wyy.markdown-preview-enhanced'), undefined, 'Piper must work without installed MPE');
    await extension.activate();
    report.extension = { id, version: extension.packageJSON.version, path: extension.extensionPath };
    const commands = await vscode.commands.getCommands(false);
    const needed = mode === 'mpe' ? ['markdown-preview-enhanced.openPreviewToTheSide', 'markdown-preview-enhanced.createTOC', '_crossnote.htmlExport', '_crossnote.chromeExport'] : ['piperMarkdown.preview', 'piperMarkdown.insertTOC', 'piperMarkdown.exportHTML', 'piperMarkdown.exportPDF'];
    for (const command of needed) assert.ok(commands.includes(command), command);
    passed('activation and commands');
    const tocURI = vscode.Uri.file(path.join(workspace, 'toc-command.md'));
    const tocDoc = await vscode.workspace.openTextDocument(tocURI);
    let editor = await vscode.window.showTextDocument(tocDoc, { preview: false });
    const before = tocDoc.getText();
    const position = tocDoc.positionAt(before.indexOf('<!-- INSERT_TOC_HERE -->'));
    editor.selection = new vscode.Selection(position, position);
    const tocCommand = mode === 'mpe' ? 'markdown-preview-enhanced.createTOC' : 'piperMarkdown.insertTOC';
    await vscode.commands.executeCommand(tocCommand);
    await until(() => tocDoc.getText() !== before, 'TOC source edit');
    assert.match(tocDoc.getText(), /\[TOC\]|\]\(#/i, 'a TOC marker or linked list was inserted');
    await vscode.window.showTextDocument(tocDoc, { preview: false });
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    await vscode.commands.executeCommand('undo');
    await until(() => tocDoc.getText() === before, 'single undo restoring TOC input');
    editor.selection = new vscode.Selection(position, position);
    await vscode.commands.executeCommand(tocCommand);
    await until(() => tocDoc.getText() !== before, 'second TOC insertion');
    await tocDoc.save();
    const afterTOC = tocDoc.getText();
    let prefix = 0, suffix = 0;
    while (prefix < before.length && before[prefix] === afterTOC[prefix]) prefix++;
    while (suffix < before.length - prefix && before[before.length - 1 - suffix] === afterTOC[afterTOC.length - 1 - suffix]) suffix++;
    passed('insert TOC, single undo, save', { insertedText: afterTOC.slice(prefix, afterTOC.length - suffix).slice(0, 400) });
    const uri = vscode.Uri.file(path.join(workspace, 'review.md'));
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
    const preview = mode === 'mpe' ? 'markdown-preview-enhanced.openPreviewToTheSide' : 'piperMarkdown.preview';
    await vscode.commands.executeCommand(preview, uri);
    const previewTabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => tab.input instanceof vscode.TabInputWebview || tab.input instanceof vscode.TabInputCustom);
    await until(() => previewTabs().length > 0, 'preview tab');
    const count = previewTabs().length;
    await vscode.window.showTextDocument(doc, { preview: false });
    await vscode.commands.executeCommand(preview, uri);
    assert.equal(previewTabs().length, count, 'preview is reused');
    passed('preview open and reuse', { tabs: previewTabs().map(tab => tab.label) });
    await checkpoint('initial', { source: uri.fsPath });
    const beforeEdit = doc.getText();
    const live = new vscode.WorkspaceEdit();
    live.insert(uri, doc.positionAt(beforeEdit.length), '\nPARITY_LIVE_EDIT\n');
    await vscode.workspace.applyEdit(live);
    assert.match(doc.getText(), /PARITY_LIVE_EDIT/);
    await checkpoint('live-edit');
    const restore = new vscode.WorkspaceEdit();
    restore.delete(uri, new vscode.Range(doc.positionAt(beforeEdit.length), doc.positionAt(doc.getText().length)));
    await vscode.workspace.applyEdit(restore);
    assert.equal(doc.getText(), beforeEdit);
    await doc.save();
    passed('live source edit and restoration', { renderedDOMChecked: Boolean(previewEvidence) });
    if (previewEvidence) {
      editor = await vscode.window.showTextDocument(doc, { preview: false });
      const last = doc.lineCount - 1;
      editor.revealRange(new vscode.Range(last, 0, last, 0), vscode.TextEditorRevealType.AtTop);
      await checkpoint('source-scroll');
      await checkpoint('preview-scroll');
      await until(() => editor.visibleRanges[0]?.start.line <= 5, 'preview scroll updates source editor', 20000);
      passed('preview to source scroll synchronization', { topSourceLine: editor.visibleRanges[0]?.start.line });
    }
    if (process.env.PIPER_PARITY_PREVIEW_ONLY === '1') { report.status = 'PASS'; return; }
    const htmlPath = path.join(workspace, 'review.html'), pdfPath = path.join(workspace, 'review.pdf');
    assert.ok(!fs.existsSync(htmlPath) && !fs.existsSync(pdfPath), 'fresh output paths required');
    if (mode === 'mpe') await vscode.commands.executeCommand('_crossnote.htmlExport', uri.toString(), true);
    else {
      const result = await vscode.commands.executeCommand('piperMarkdown.exportHTML', uri, vscode.Uri.file(htmlPath));
      assert.equal(result?.fsPath, htmlPath, 'HTML command resolves to actual output URI');
    }
    const html = await completeFile(htmlPath, 'html');
    const htmlText = html.toString();
    for (const marker of ['PARITY_OPENING', 'PARITY_IMPORTED_FRAGMENT', 'PARITY_FOOTNOTE', 'PARITY_END']) assert.ok(htmlText.includes(marker), `${marker} in exported HTML`);
    assert.ok(!htmlText.includes('vscode-webview://'), 'HTML does not require VS Code webview URLs');
    assert.ok(!/<(?:span|div)[^>]*class="[^"]*katex-error/.test(htmlText), 'no rendered KaTeX error');
    report.outputs.html = { path: htmlPath, bytes: html.length, sha256: hash(html), dataImages: (htmlText.match(/data:image\//g) || []).length };
    passed('real HTML export with imported text', { browserAssetInspectionRequired: true });
    if (mode === 'mpe') await vscode.commands.executeCommand('_crossnote.chromeExport', uri.toString(), 'pdf');
    else {
      const result = await vscode.commands.executeCommand('piperMarkdown.exportPDF', uri, vscode.Uri.file(pdfPath));
      assert.equal(result?.fsPath, pdfPath, 'PDF command resolves to actual output URI');
    }
    const pdf = await completeFile(pdfPath, 'pdf');
    report.outputs.pdf = { path: pdfPath, bytes: pdf.length, sha256: hash(pdf) };
    passed('real PDF export completed', { visualInspectionRequired: true });
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL'; report.error = String(error.stack || error);
    throw error;
  } finally { report.finishedAt = new Date().toISOString(); saveReport(); }
};
