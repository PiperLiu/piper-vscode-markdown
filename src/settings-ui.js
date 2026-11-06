'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { safeURL } = require('./render');
const { needsCredential, validateConfig } = require('./upload');

function createSettingsUI(vscode, context, cfg, secretKey) {
  const t = (en, zh) => /^zh/i.test(vscode.env.language) ? zh : en;
  const input = (title, value = '', validateInput) => vscode.window.showInputBox({ title, value, ignoreFocusOut: true, validateInput });
  const choose = (title, choices) => vscode.window.showQuickPick(choices, { title, ignoreFocusOut: true });
  const validURL = value => { try { safeURL(value); return undefined; } catch { return t('Enter an HTTPS URL (HTTP is allowed for loopback only).', '请输入 HTTPS 地址（仅本机回环地址允许 HTTP）。'); } };
  const settingsKeys = new Set(['wechatSkipLeadingH1', 'wechatIncludeTOC', 'wechatPreset', 'fontSize', 'wechatLineHeight', 'wechatAccentColor', 'wechatHeadingStyle', 'scrollSync']);
  const bounds = { fontSize: [12, 24], wechatLineHeight: [1.2, 2.5] };
  const enums = { wechatPreset: ['classic', 'minimal', 'editorial'], wechatHeadingStyle: ['border', 'plain'] };
  let hostOpen = false;
  async function updateSetting(doc, key, value) {
    key = ({ skipLeadingH1: 'wechatSkipLeadingH1', includeTOC: 'wechatIncludeTOC' })[key] || key;
    if (!settingsKeys.has(key)) throw new Error(t('Unknown publication setting.', '未知的公众号设置。'));
    if (bounds[key] && (typeof value !== 'number' || !Number.isFinite(value) || value < bounds[key][0] || value > bounds[key][1])) throw new Error(t('Setting value is out of range.', '设置值超出范围。'));
    if (enums[key] && !enums[key].includes(value)) throw new Error(t('Unknown setting choice.', '不支持的设置选项。'));
    if (['wechatSkipLeadingH1', 'wechatIncludeTOC', 'scrollSync'].includes(key) && typeof value !== 'boolean') throw new Error('Expected a boolean');
    if (key === 'wechatAccentColor' && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) throw new Error(t('Use a six-digit hex color, for example #16856e.', '请输入六位十六进制颜色，例如 #16856e。'));
    const configuration = vscode.workspace.getConfiguration('piperMarkdown', doc?.uri);
    const current = configuration.inspect(key);
    const target = current?.workspaceFolderValue !== undefined ? vscode.ConfigurationTarget.WorkspaceFolder : current?.workspaceValue !== undefined ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
    await configuration.update(key, value, target);
    if (key === 'wechatPreset') { const preset = { classic: ['#16856e', 'border', 1.85], minimal: ['#374151', 'plain', 1.75], editorial: ['#9b4f32', 'border', 1.9] }[value]; await updateSetting(doc, 'wechatAccentColor', preset[0]); await updateSetting(doc, 'wechatHeadingStyle', preset[1]); await updateSetting(doc, 'wechatLineHeight', preset[2]); }
  }
  async function promptToken(c) {
    const instruction = c.imageHostProvider === 'qiniu'
      ? t('Enter a Qiniu upload token, not an AccessKey or SecretKey.', '请输入七牛上传 Token，不要填写 AccessKey 或 SecretKey。')
      : c.imageHostProvider === 'generic'
        ? t('Enter the upload credential issued by your image host.', '请输入图床服务提供的上传凭据。')
        : t('Enter the upload token configured by your Piper host administrator, without the Bearer prefix.', '请输入 Piper 图床管理员配置的上传 Token，不要加 Bearer 前缀。');
    return await vscode.window.showInputBox({ title: t('Image host upload credential', '图床上传凭据') + ' · ' + safeURL(c.uploadUrl).host, password: true, ignoreFocusOut: true, prompt: instruction + ' ' + t('Saved in VS Code SecretStorage, never in settings or Markdown.', '保存在 VS Code SecretStorage，不写入设置或 Markdown。'), validateInput: value => /[\x00-\x1f\x7f]/.test(value) || value.length > 16384 ? t('Invalid credential.', '凭据包含无效字符或过长。') : undefined });
  }
  async function setToken(doc) {
    const c = cfg(doc?.uri);
    if (!c.uploadUrl) return configureHost(doc, true);
    if (!needsCredential(c)) { void vscode.window.showInformationMessage(t('This image host does not require an upload credential.', '当前图床无需上传凭据。')); return; }
    const token = await promptToken(c);
    if (token) { await context.secrets.store(secretKey(c), token); void vscode.window.showInformationMessage(t('Upload credential saved.', '上传凭据已保存。')); }
  }
  async function clearToken(doc) {
    const c = cfg(doc?.uri); if (!c.uploadUrl) return;
    await context.secrets.delete(secretKey(c));
    void vscode.window.showInformationMessage(t('Upload credential cleared for this host.', '当前图床的上传凭据已清除。'));
  }
  async function connection(doc) {
    const current = cfg(doc?.uri), draft = { ...current };
    const provider = await choose(t('Image host · provider', '图床 · 服务类型'), [
      { label: 'Piper', description: t('Temporary public images with private uploads', '私有上传、限时公开图片'), value: 'piper' },
      { label: 'Generic HTTP', description: t('Configurable multipart upload API', '可配置的 multipart 上传接口'), value: 'generic' },
      { label: 'Qiniu / 七牛云', description: t('Direct upload using a scoped upload token', '使用受限上传 Token 直传'), value: 'qiniu' },
    ]); if (!provider) return false;
    draft.imageHostProvider = provider.value;
    const endpoint = await input(t('Full upload endpoint URL', '完整上传接口地址'), current.imageHostProvider === provider.value ? current.uploadUrl : '', validURL); if (endpoint === undefined) return false;
    draft.uploadUrl = endpoint.trim();
    const patch = { imageHostProvider: draft.imageHostProvider, uploadUrl: draft.uploadUrl };
    if (provider.value === 'piper') {
      const ttl = await choose(t('Temporary image lifetime', '临时图片有效期'), [{ label: t('24 hours', '24 小时'), value: '24h' }, { label: t('3 hours', '3 小时'), value: '3h' }]); if (!ttl) return false;
      Object.assign(patch, { ttl: ttl.value, fileField: 'file', urlField: 'url' });
    } else if (provider.value === 'qiniu') {
      const base = await input(t('Qiniu public HTTPS image domain', '七牛公开 HTTPS 图片域名'), current.publicBaseUrl, value => { try { const u = safeURL(value); if (u.protocol !== 'https:' || u.search || u.hash) throw new Error(); } catch { return t('Use an HTTPS base URL without query or fragment.', '请输入不含查询参数或片段的 HTTPS 图片域名。'); } }); if (base === undefined) return false;
      const prefix = await input(t('Object key prefix (optional)', '对象名称前缀（可选）'), current.qiniuKeyPrefix); if (prefix === undefined) return false;
      Object.assign(patch, { publicBaseUrl: base, qiniuKeyPrefix: prefix, uploadHeaders: {}, uploadFields: {} });
    } else {
      const mode = await choose(t('Upload authentication', '上传鉴权方式'), [{ label: t('HTTP header', 'HTTP 请求头'), value: 'header' }, { label: t('Multipart form field', 'Multipart 表单字段'), value: 'form' }, { label: t('No authentication', '无需鉴权'), value: 'none' }]); if (!mode) return false;
      patch.uploadAuthMode = mode.value;
      if (mode.value === 'header') {
        const name = await input(t('Credential header name', '凭据请求头名称'), current.uploadHeaderName); if (name === undefined) return false;
        const prefix = await input(t('Credential prefix (leave empty for a raw token)', '凭据前缀（原始 Token 可留空）'), current.uploadHeaderPrefix); if (prefix === undefined) return false;
        Object.assign(patch, { uploadHeaderName: name, uploadHeaderPrefix: prefix });
      } else if (mode.value === 'form') {
        const field = await input(t('Credential form field', '凭据表单字段'), current.uploadTokenField); if (field === undefined) return false; patch.uploadTokenField = field;
      }
      const field = await input(t('Multipart file field', 'Multipart 文件字段'), current.fileField); if (field === undefined) return false;
      const response = await input(t('Response URL path (for example data.url)', '响应 URL 路径（例如 data.url）'), current.urlField); if (response === undefined) return false;
      Object.assign(patch, { fileField: field, urlField: response });
      for (const [key, title] of [['uploadHeaders', t('Extra non-secret headers as JSON (optional)', '额外非敏感请求头 JSON（可选）')], ['uploadFields', t('Extra non-secret form fields as JSON (optional)', '额外非敏感表单字段 JSON（可选）')]]) {
        const raw = await input(title, JSON.stringify(current[key] || {}), value => { try { const obj = JSON.parse(value || '{}'); if (!obj || Array.isArray(obj) || typeof obj !== 'object' || Object.values(obj).some(v => typeof v !== 'string')) throw new Error(); } catch { return t('Enter a JSON object containing string values.', '请输入值为字符串的 JSON 对象。'); } });
        if (raw === undefined) return false; patch[key] = JSON.parse(raw || '{}');
      }
    }
    Object.assign(draft, patch); validateConfig(draft);
    let newToken;
    if (needsCredential(draft) && !await context.secrets.get(secretKey(draft))) { newToken = await promptToken(draft); if (!newToken) return false; }
    const configuration = vscode.workspace.getConfiguration('piperMarkdown');
    const previous = Object.fromEntries(Object.keys(patch).map(k => [k, configuration.inspect(k)?.globalValue]));
    const changed = [];
    try { for (const [k, v] of Object.entries(patch)) { await configuration.update(k, v, vscode.ConfigurationTarget.Global); changed.push(k); } if (newToken) await context.secrets.store(secretKey(draft), newToken); }
    catch (error) { for (const k of changed.reverse()) await configuration.update(k, previous[k], vscode.ConfigurationTarget.Global).catch(() => {}); throw error; }
    void vscode.window.showInformationMessage(t('Image host connection saved.', '图床连接已保存。'));
    return true;
  }
  async function configureHost(doc, newConnection = false) {
    if (hostOpen) return;
    hostOpen = true;
    try {
      if (newConnection || !cfg(doc?.uri).uploadUrl) { await connection(doc); return; }
      const c = cfg(doc?.uri);
      let host; try { host = safeURL(c.uploadUrl).host; } catch { host = t('Invalid endpoint', '接口地址无效'); }
      let hasToken = false; try { hasToken = !!await context.secrets.get(secretKey(c)); } catch { /* Allow repairing invalid config. */ }
      let requiresToken = true; try { requiresToken = needsCredential(c); } catch { /* Repair invalid configuration. */ }
      const choice = await choose(t('Image host', '图床') + ' · ' + c.imageHostProvider + ' · ' + host, [
        { label: t('Configure connection…', '配置连接…'), description: t('Provider, endpoint and upload fields', '服务类型、接口地址与上传字段'), value: 'connection' },
        ...(requiresToken ? [{ label: t('Set upload credential…', '设置上传凭据…'), description: hasToken ? t('Credential is set; its value is hidden', '已设置凭据，值不会显示') : t('No credential saved', '尚未设置凭据'), value: 'token' },
        { label: t('Clear upload credential', '清除上传凭据'), value: 'clear' }] : [{ label: t('No upload credential required', '无需上传凭据'), description: t('Anonymous upload is configured', '已配置匿名上传'), value: 'none' }]),
        { label: t('Advanced settings', '高级设置'), description: c.imageHostProvider === 'piper' ? t('Lifetime: ', '有效期：') + c.ttl : t('Image lifetime is managed by your provider', '图片有效期由服务商管理'), value: 'settings' },
      ]);
      if (choice?.value === 'connection') await connection(doc);
      if (choice?.value === 'token') await setToken(doc);
      if (choice?.value === 'clear') await clearToken(doc);
      if (choice?.value === 'settings') await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:piperliu.piper-markdown-review @id:piperMarkdown.imageHostProvider,piperMarkdown.uploadUrl,piperMarkdown.ttl,piperMarkdown.fileField,piperMarkdown.urlField,piperMarkdown.uploadAuthMode,piperMarkdown.uploadHeaderName,piperMarkdown.uploadHeaderPrefix,piperMarkdown.uploadTokenField,piperMarkdown.uploadHeaders,piperMarkdown.uploadFields,piperMarkdown.publicBaseUrl,piperMarkdown.qiniuKeyPrefix');
    } finally { hostOpen = false; }
  }
  async function configureStyle(doc) {
    while (true) {
      const c = cfg(doc?.uri);
      const choice = await choose(t('WeChat style · changes preview immediately', '公众号样式 · 修改后即时预览'), [
        { label: t('Preset', '预设'), description: c.wechatPreset, value: 'wechatPreset' },
        { label: t('Body font size', '正文字号'), description: c.fontSize + ' px', value: 'fontSize' },
        { label: t('Line height', '行距'), description: String(c.wechatLineHeight), value: 'wechatLineHeight' },
        { label: t('Accent color', '主题色'), description: c.wechatAccentColor, value: 'wechatAccentColor' },
        { label: t('Heading decoration', '标题装饰'), description: c.wechatHeadingStyle, value: 'wechatHeadingStyle' },
        { label: t('Done', '完成'), value: 'done' },
      ]); if (!choice || choice.value === 'done') return;
      const key = choice.value; let value;
      if (key === 'wechatPreset') value = (await choose(t('Choose a publication preset', '选择公众号样式预设'), [ { label: t('Classic · green headings', '经典 · 绿色标题'), value: 'classic' }, { label: t('Minimal · quiet typography', '简洁 · 克制排版'), value: 'minimal' }, { label: t('Editorial · reading focus', '专栏 · 阅读优先'), value: 'editorial' } ]))?.value;
      else if (key === 'wechatHeadingStyle') value = (await choose(t('Heading decoration', '标题装饰'), [{ label: t('Underline', '底线'), value: 'border' }, { label: t('Plain', '无装饰'), value: 'plain' }]))?.value;
      else if (bounds[key]) { const raw = await input(choice.label, String(c[key]), value => !Number.isFinite(Number(value)) || !value.trim() || Number(value) < bounds[key][0] || Number(value) > bounds[key][1] ? bounds[key].join(' – ') : undefined); if (raw !== undefined) value = Number(raw); }
      else value = await input(choice.label, c[key], value => /^#[0-9a-f]{6}$/i.test(value) ? undefined : '#RRGGBB');
      if (value !== undefined) await updateSetting(doc, key, value);
    }
  }
  async function insertImage(doc, kind) {
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === doc.uri.toString()) || await vscode.window.showTextDocument(doc, { preserveFocus: false });
    let markdown, copied;
    if (kind === 'link') {
      const url = await input(t('Public image URL', '公开图片链接'), '', validURL); if (url === undefined) return;
      markdown = '![](' + url.replace(/[()\s<>]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) + ')';
    } else {
      const selected = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Images: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }, openLabel: t('Insert local image', '插入本地图片') }); if (!selected?.[0]) return;
      if (selected[0].scheme !== 'file') throw new Error(t('Choose a local image.', '请选择本地图片。'));
      const source = selected[0].fsPath, stat = await fs.stat(source); if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw new Error(t('Choose an image smaller than 20 MiB.', '请选择小于 20 MiB 的图片。'));
      const root = await fs.realpath(vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath || path.dirname(doc.uri.fsPath));
      const documentDirectory = await fs.realpath(path.dirname(doc.uri.fsPath));
      const documentRelative = path.relative(root, documentDirectory);
      if (documentRelative === '..' || documentRelative.startsWith('..' + path.sep) || path.isAbsolute(documentRelative)) throw new Error(t('The document must stay inside this workspace.', '文档必须位于当前工作区内。'));
      const directory = path.join(documentDirectory, 'images'); await fs.mkdir(directory, { recursive: true });
      const realDirectory = await fs.realpath(directory), relative = path.relative(root, realDirectory);
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error(t('The image directory must stay inside this workspace.', '图片目录必须位于当前工作区内。'));
      const ext = path.extname(source).toLowerCase(); if (!['.png','.jpg','.jpeg','.webp','.gif','.svg'].includes(ext)) throw new Error(t('Unsupported image file.', '不支持的图片文件。'));
      const name = path.basename(source, path.extname(source)).replace(/[\x00-\x1f\x7f]/g, '_') + '-' + crypto.randomUUID().slice(0,8) + ext;
      copied = path.join(realDirectory, name); await fs.copyFile(source, copied, 1);
      const url = path.relative(documentDirectory, copied).split(path.sep).map(segment => encodeURIComponent(segment).replace(/[()]/g, c => '%' + c.charCodeAt(0).toString(16))).join('/'); markdown = '![](' + url + ')';
    }
    try {
      const success = await editor.edit(edit => edit.insert(editor.selection.active, markdown));
      if (!success) throw new Error(t('The image could not be inserted into the document.', '无法将图片插入文档。'));
    } catch (error) { if (copied) await fs.unlink(copied).catch(() => {}); throw error; }
  }
  return { configureHost, configureStyle, setToken, clearToken, updateSetting, insertImage };
}
module.exports = { createSettingsUI };
