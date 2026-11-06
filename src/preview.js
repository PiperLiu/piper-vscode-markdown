'use strict';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function exportHTML(result,title){return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline';"><title>${esc(title)}</title><style>body{margin:0;background:#f5f5f2;padding:24px}main{max-width:760px;padding:32px;margin:auto;background:white}pre,table{overflow:auto} @media(max-width:600px){body{padding:0}main{padding:20px}}</style></head><body><main>${result.html}</main></body></html>`;}
module.exports={exportHTML};
