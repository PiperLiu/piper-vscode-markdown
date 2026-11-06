'use strict';
const vscode = require('vscode');
const path = require('node:path');

async function activate(context) {
  const vendorPath = context.asAbsolutePath('vendor/mpe');
  const enhancedContext = new Proxy(context, {
    get(target, property) {
      if (property === 'extensionPath') return vendorPath;
      if (property === 'extensionUri') return vscode.Uri.file(vendorPath);
      if (property === 'asAbsolutePath') return relative => path.join(vendorPath, relative);
      return Reflect.get(target, property, target);
    },
  });
  const enhanced = await require('../vendor/mpe/out/native/extension').activate(enhancedContext);
  if (!enhanced?.exportHTML || !enhanced?.exportPDF) throw new Error('The enhanced engine did not initialize. Reinstall the complete extension package.');
  const resolveDocument = async uri => {
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before opening its Markdown content.');
    const source = uri || enhanced.getActiveSourceUri() || vscode.window.activeTextEditor?.document.uri;
    if (!source || source.scheme !== 'file') throw new Error('Open a local Markdown document or its preview first.');
    const doc = await vscode.workspace.openTextDocument(source);
    if (!['markdown', 'quarto', 'prompt', 'instructions', 'chatagent', 'skill'].includes(doc.languageId)) throw new Error('Select a Markdown document.');
    return doc;
  };
  const openEnhanced = async doc => enhanced.openPreview(doc.uri, { beside: true });
  const wechat = require('./wechat-extension').activate(context, { resolveDocument, openEnhanced, openPublishing: doc => enhanced.openPublishingPreview(doc.uri), parseEnhanced: enhanced.parseEnhanced, getBrowserPath: () => { const current = vscode.workspace.getConfiguration('piperMarkdown.enhanced').inspect('chromePath')?.globalValue; return current ?? vscode.workspace.getConfiguration('markdown-preview-enhanced').inspect('chromePath')?.globalValue ?? ''; } });
  enhanced.setPublishingService(wechat.service);
  const register = (id, action) => context.subscriptions.push(vscode.commands.registerCommand(id, async (...args) => {
    try { return await action(...args); }
    catch (error) { vscode.window.showErrorMessage(error.message || String(error)); throw error; }
  }));
  const preview = async uri => openEnhanced(await resolveDocument(uri));
  register('piperMarkdown.preview', preview);
  register('piperMarkdown.openMPE', preview);
  register('piperMarkdown.insertTOC', async () => {
    const doc = await resolveDocument();
    await vscode.window.showTextDocument(doc, { preview: false });
    return vscode.commands.executeCommand('piperMarkdown.enhanced.createTOC');
  });
  for (const format of ['HTML', 'PDF']) {
    register(`piperMarkdown.export${format}`, async (sourceUri, targetUri) => {
      const doc = await resolveDocument(sourceUri);
      const ext = format.toLowerCase();
      const destination = targetUri || await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(doc.uri.fsPath.replace(/\.[^.]+$/, '') + '.' + ext),
        filters: { [format]: [ext] }, saveLabel: `Export ${format}`,
      });
      if (!destination) return undefined;
      if (destination.scheme !== 'file') throw new Error('Choose a local export destination.');
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Exporting ${format}` },
        () => enhanced[`export${format}`](doc.uri, { offline: true, targetPath: destination.fsPath, openFile: false }));
      vscode.window.showInformationMessage(`${format} exported: ${path.basename(result)}`);
      return vscode.Uri.file(result);
    });
  }
  return { enhanced, wechat };
}
module.exports = { activate };
