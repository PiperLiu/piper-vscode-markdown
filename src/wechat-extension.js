'use strict';
const vscode = require('vscode');
const path = require('node:path');
const crypto = require('node:crypto');
const { render, disposePublishingBrowser } = require('./render');
const { upload, needsCredential, credentialScope, validateConfig } = require('./upload');
const { prepareWechatMarkdown } = require('./wechat-markdown');
const { writeClipboard } = require('./clipboard');
const { readConfig } = require('./config');
const { assertSeparateDestination } = require('./export-path');
const { exportHTML } = require('./preview');
const { assertWechatCompatible, inspectResources } = require('./wechat-preflight');
const { createSettingsUI } = require('./settings-ui');

function activate(context, integrations = {}) {
  const t = (en, zh) => /^zh/i.test(vscode.env.language) ? zh : en;
  const cfg = uri => readConfig(vscode.workspace, uri);
  const secretKey = c => 'upload:' + crypto.createHash('sha256').update(credentialScope(c)).digest('hex');
  const ui = createSettingsUI(vscode, context, cfg, secretKey);
  context.subscriptions.push({ dispose: () => { void disposePublishingBrowser?.(); } });
  const getState = doc => { const c = cfg(doc?.uri); return { settings: { skipLeadingH1: c.wechatSkipLeadingH1, includeTOC: c.wechatIncludeTOC, preset: c.wechatPreset, fontSize: c.fontSize, lineHeight: c.wechatLineHeight, accentColor: c.wechatAccentColor, headingStyle: c.wechatHeadingStyle, previewWidth: c.previewWidth, scrollSync: c.scrollSync } }; };
  let copying = false;
  function check(doc) {
    if (!vscode.workspace.isTrusted) throw new Error(t('Trust this workspace before publishing Markdown.', '发布 Markdown 前请先信任工作区。'));
    if (!doc || doc.uri.scheme !== 'file' || !['markdown','quarto','prompt','instructions','chatagent','skill'].includes(doc.languageId)) throw new Error(t('Open a local Markdown document or its preview first.', '请先打开本地 Markdown 文档或其预览。'));
    return doc;
  }
  const active = async () => check(await integrations.resolveDocument?.() || vscode.window.activeTextEditor?.document);
  const root = doc => vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath || path.dirname(doc.uri.fsPath);
  const options = (doc, c) => ({
    filename: doc.uri.fsPath, root: root(doc), fontSize: c.fontSize,
    style: { preset: c.wechatPreset, fontSize: c.fontSize, lineHeight: c.wechatLineHeight, accentColor: c.wechatAccentColor, headingStyle: c.wechatHeadingStyle, previewWidth: c.previewWidth, scrollSync: c.scrollSync },
    wechatIncludeTOC: c.wechatIncludeTOC,
    parseEnhanced: integrations.parseEnhanced,
    browserPath: integrations.getBrowserPath?.(),
  });
  function preparedDocument(doc, selection) {
    check(doc); const c = cfg(doc.uri);
    const prepared = prepareWechatMarkdown(selection && !selection.isEmpty ? doc.getText(selection) : doc.getText(), c.wechatSkipLeadingH1);
    if (!prepared.markdown.trim() && prepared.omittedTitle) throw new Error(t('There is no body after skipping the title. The clipboard was not changed.', '忽略标题后没有正文，剪贴板未修改。'));
    assertWechatCompatible(prepared.markdown, { enhanced: !!integrations.parseEnhanced });
    return { c, prepared };
  }
  function missing(code, message) { const error = new Error(message); error.code = code; return error; }
  async function report(error, doc) {
    if (error?.name === 'AbortError') { await vscode.window.showInformationMessage(t('Cancelled. The clipboard was not changed. Uploaded images follow your host retention policy.', '已取消，剪贴板未修改；已上传图片按图床的保留策略处理。')); return; }
    if (error?.code === 'MISSING_UPLOAD_URL' || error?.code === 'MISSING_UPLOAD_TOKEN') {
      const token = error.code === 'MISSING_UPLOAD_TOKEN';
      const action = token ? t('Set upload credential…', '设置上传凭据…') : t('Configure image host…', '配置图床…');
      const message = token ? t('An upload credential is required for images and formulas.', '上传图片和公式需要图床凭据。') : t('Choose an image host to publish local images, diagrams and formulas.', '发布本地图片、图表和公式前，请先配置图床。');
      if (await vscode.window.showErrorMessage(message, action) === action) await (token ? ui.setToken(doc) : ui.configureHost(doc, true));
      return;
    }
    await vscode.window.showErrorMessage(error?.message || String(error));
  }
  async function withProgress(title, work, external = {}) {
    const run = async (notification, cancellation) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const parent = external.signal;
      parent?.addEventListener('abort', abort, { once: true });
      const subscription = cancellation?.onCancellationRequested(abort);
      if (parent?.aborted || cancellation?.isCancellationRequested) controller.abort();
      let last = 0;
      const onProgress = progress => {
        external.onProgress?.(progress);
        if (notification) {
          const names = { parse: t('Reading Markdown', '解析 Markdown'), convert: t('Preparing images and diagrams', '处理图片与图表'), upload: t('Uploading images', '上传图片'), style: t('Applying publication styles', '应用公众号样式'), clipboard: t('Writing clipboard', '写入剪贴板') };
          const ratio = progress.total > 0 ? Math.min(1, progress.completed / progress.total) : 0;
          const band = ({ parse: [0, 5], convert: [5, 50], upload: [55, 35], style: [90, 5], clipboard: [95, 5] })[progress.phase] || [0, 0];
          const current = Math.max(last, band[0] + ratio * band[1]);
          notification.report({ message: progress.message || (names[progress.phase] || title) + (progress.total ? ' ' + progress.completed + '/' + progress.total : ''), increment: current - last }); last = current;
        }
      };
      try { controller.signal.throwIfAborted(); return await work(controller.signal, onProgress); }
      finally { parent?.removeEventListener('abort', abort); subscription?.dispose(); }
    };
    if (external.onProgress) return run();
    return vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, run);
  }
  async function renderDocument(doc, external = {}) {
    doc = doc || await active(); const { c, prepared } = preparedDocument(doc);
    const result = await render(prepared.markdown, { ...options(doc, c), preview: true, signal: external.signal, onProgress: external.onProgress });
    return { ...result, diagnostics: result.warnings || [], omittedTitle: prepared.omittedTitle, settings: { skipLeadingH1: c.wechatSkipLeadingH1, includeTOC: c.wechatIncludeTOC, preset: c.wechatPreset, fontSize: c.fontSize, lineHeight: c.wechatLineHeight, accentColor: c.wechatAccentColor, headingStyle: c.wechatHeadingStyle, previewWidth: c.previewWidth, scrollSync: c.scrollSync } };
  }
  async function copy(doc, selection, external = {}) {
    doc = doc || await active(); check(doc);
    if (copying) throw new Error(t('Another copy is in progress. Finish or cancel it first.', '另一份内容正在复制，请先完成或取消。'));
    if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error(t('This package supports rich-text clipboard on macOS Apple Silicon.', '此安装包的富文本剪贴板支持 macOS Apple Silicon。'));
    copying = true;
    try {
      const { c, prepared } = preparedDocument(doc, selection);
      let token;
      async function readyForUpload() {
        if (!c.uploadUrl) throw missing('MISSING_UPLOAD_URL', 'Image host is not configured');
        validateConfig(c);
        if (needsCredential(c)) { token = await context.secrets.get(secretKey(c)); if (!token) throw missing('MISSING_UPLOAD_TOKEN', 'Upload credential is not configured'); }
      }
      if (inspectResources?.(prepared.markdown).requiresUpload) await readyForUpload();
      const output = await withProgress(t('Copying for WeChat', '复制到公众号'), async (signal, onProgress) => {
        let connection;
        const result = await render(prepared.markdown, { ...options(doc, c), signal, onProgress, resolveAsset: async (asset, assetSignal, uploadProgress) => {
          if (!connection) connection = readyForUpload(); await connection;
          return upload(asset, c, token, assetSignal || signal, uploadProgress);
        } });
        signal.throwIfAborted(); onProgress({ phase: 'clipboard', completed: 0, total: 1 });
        await writeClipboard(context.asAbsolutePath('bin/clipboard'), result);
        onProgress({ phase: 'clipboard', completed: 1, total: 1 });
        return result;
      }, external);
      const retention = c.imageHostProvider === 'piper' ? t('Paste and save before the ' + c.ttl + ' image lifetime expires.', '请在图片 ' + c.ttl + ' 有效期内粘贴并保存。') : t('Image retention is managed by your host.', '图片保留期限由图床管理。');
      const message = t('Copied for WeChat. ', '已复制到公众号。') + (output.convertedLinks ? t('Unsupported links converted to text. ', '不支持的链接已转为文字。') : '') + (prepared.omittedTitle ? t('Leading H1 omitted. ', '已忽略开头的一级标题。') : '') + (output.uniqueAssets ? output.uniqueAssets + t(' images/formulas uploaded. ', ' 张图片或公式已上传。') + retention : '') + t('Save and reopen the WeChat draft to confirm its images.', '请保存并重新打开微信草稿，确认图片已转存。');
      void vscode.window.showInformationMessage(message);
      return { ...output, omittedTitle: prepared.omittedTitle, message };
    } catch (error) { error.piperReported = true; void report(error, doc).catch(() => {}); throw error; }
    finally { copying = false; }
  }
  async function preview(doc) {
    doc = doc || await active(); check(doc);
    if (!integrations.openPublishing) throw new Error(t('Reload VS Code to initialize the publishing preview.', '请重新载入 VS Code 以初始化发布预览。'));
    return integrations.openPublishing(doc);
  }
  async function exportDocument(doc, external = {}) {
    doc = doc || await active(); check(doc);
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(doc.uri.fsPath.replace(/\.[^.]+$/, '') + '.wechat.html'), filters: { HTML: ['html'] }, saveLabel: t('Export WeChat HTML', '导出公众号 HTML') });
    if (!target) return;
    if (target.scheme !== 'file') throw new Error(t('Choose a local export destination.', '请选择本地导出位置。'));
    await assertSeparateDestination(doc.uri.fsPath, target.fsPath);
    const { c, prepared } = preparedDocument(doc);
    const result = await withProgress(t('Exporting WeChat HTML', '导出公众号 HTML'), (signal, onProgress) => render(prepared.markdown, { ...options(doc, c), signal, onProgress }), external);
    await vscode.workspace.fs.writeFile(target, Buffer.from(exportHTML(result, path.basename(doc.uri.fsPath))));
    void vscode.window.showInformationMessage(t('WeChat HTML exported.', '公众号 HTML 已导出。')); return target;
  }
  const exportStandard = (doc, format) => { if (!['html', 'pdf'].includes(format)) throw new Error('Unsupported export format'); return vscode.commands.executeCommand(format === 'html' ? 'piperMarkdown.exportHTML' : 'piperMarkdown.exportPDF', doc.uri); };
  const service = { getState, exportStandard, render: renderDocument, copy: (doc, options) => copy(doc, undefined, options), exportHTML: exportDocument, configureHost: ui.configureHost, configureStyle: ui.configureStyle, updateSetting: ui.updateSetting, insertImage: ui.insertImage };
  const commands = {
    previewWechat: preview, exportWechatHTML: exportDocument,
    copy: async () => { const doc = await active(); const editor = vscode.window.activeTextEditor; return copy(doc, editor?.document === doc ? editor.selection : undefined); },
    setToken: async () => ui.setToken(await active().catch(() => undefined)),
    clearToken: async () => ui.clearToken(await active().catch(() => undefined)),
    configureImageHost: async () => ui.configureHost(await active().catch(() => undefined)),
    configureWechatStyle: async () => ui.configureStyle(await active()),
  };
  for (const [name, action] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand('piperMarkdown.' + name, async (...args) => { try { return await action(...args); } catch (error) { if (!error.piperReported) await report(error); } }));
  for (const name of ['preview','copy','setToken','clearToken']) context.subscriptions.push(vscode.commands.registerCommand('piperWechat.' + name, async () => { try { return await (name === 'preview' ? preview : commands[name])(); } catch (error) { if (!error.piperReported) await report(error); } }));
  return { copy, preview, exportHTML: exportDocument, service };
}
module.exports = { activate };
