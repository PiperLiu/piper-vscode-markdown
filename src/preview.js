'use strict';
const crypto=require('node:crypto');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function previewHTML(webview,context){
 const nonce=crypto.randomBytes(18).toString('base64');
 const asset=file=>esc(webview.asWebviewUri(context.extensionUri.with({path:context.extensionUri.path+'/media/'+file})).toString());
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http://localhost:* http://127.0.0.1:*; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${asset('preview.css')}"><title>Piper Markdown</title></head><body>
<header><div class="identity"><span class="mark">P</span><span id="filename">公众号排版</span><span id="stats"></span></div><div class="actions"><div class="modes" aria-label="预览模式"><button id="reading" class="active" aria-pressed="true">阅读视图</button><button id="wechat" aria-pressed="false">公众号</button></div><button id="outline-toggle" aria-expanded="true">目录</button><button id="source">源文</button><button id="more" aria-expanded="false" aria-controls="more-menu">更多 ▾</button><button id="copy" class="primary">复制到公众号</button></div></header>
<div id="more-menu" hidden><label class="option-row" title="Only affects WeChat output / 仅影响公众号排版"><input id="skip-title" type="checkbox"><span>忽略开头一级标题<br><small>Skip leading H1</small></span></label><button id="export">导出公众号 HTML</button><button id="mpe">打开增强预览</button><button id="settings">阅读与图床设置</button></div>
<div class="notice" id="notice" role="status">本地预览 · 未上传图片</div><div id="error" role="alert" hidden></div><div id="compatibility" role="status" hidden></div>
<div class="workspace"><nav id="outline" aria-label="文章目录"><div class="outline-label">文档目录</div><div id="headings"></div></nav><main id="content" tabindex="-1"><div class="placeholder">正在准备预览…</div></main></div>
<script nonce="${nonce}" src="${asset('navigation.js')}"></script><script nonce="${nonce}" src="${asset('preview.js')}"></script></body></html>`;
}
function exportHTML(result,title){return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline';"><title>${esc(title)}</title><style>body{margin:0;background:#f5f5f2;padding:24px}main{max-width:760px;padding:32px;margin:auto;background:white}pre,table{overflow:auto} @media(max-width:600px){body{padding:0}main{padding:20px}}</style></head><body><main>${result.html}</main></body></html>`;}
module.exports={previewHTML,exportHTML};
