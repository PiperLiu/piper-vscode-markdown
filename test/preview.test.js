const {test}=require('node:test');const assert=require('node:assert/strict');
const {render}=require('../src/render');const {previewHTML,exportHTML}=require('../src/preview');const {readConfig}=require('../src/config');
test('目录保留中文、重复标题独立定位，源文位置仅写入预览',async()=>{
 const markdown='# 标题\n\n## **中文** 标题\n\n正文\n\n## **中文** 标题\n';
 const preview=await render(markdown,{filename:__filename,preview:true});
 assert.deepEqual(preview.headings.map(h=>[h.title,h.line,h.level]),[['标题',0,1],['中文 标题',2,2],['中文 标题',6,2]]);
 assert.equal(new Set(preview.headings.map(h=>h.id)).size,3);assert.match(preview.html,/data-source-line="4"/);
 assert.doesNotMatch((await render(markdown,{filename:__filename})).html,/data-source-line|piper-heading-/);
});
test('Webview 只允许带随机 nonce 的脚本；导出 HTML 不含交互或原始脚本',async()=>{
 const webview={cspSource:'vscode-webview:',asWebviewUri:uri=>'https://asset.invalid'+uri.path};
 const context={extensionUri:{path:'/test',with:o=>o}};
 const html=previewHTML(webview,context);assert.match(html,/default-src 'none'/);assert.match(html,/script-src 'nonce-[^']+'/);assert.doesNotMatch(html,/script-src[^;]*unsafe-inline/);
 const result=await render('<script>alert(1)</script>',{filename:__filename});const exported=exportHTML(result,'<bad>');assert.doesNotMatch(exported,/<script/);assert.match(exported,/<title>&lt;bad&gt;<\/title>/);
});
test('新配置优先、旧配置兼容、未配置使用默认',()=>{
 const workspace={getConfiguration:namespace=>({inspect:key=>namespace==='piperMarkdown'?({fontSize:{globalValue:18},uploadUrl:{}}[key]):({fontSize:{globalValue:14},uploadUrl:{globalValue:'https://images.example'}}[key])})};
 const c=readConfig(workspace);assert.equal(c.fontSize,18);assert.equal(c.uploadUrl,'https://images.example');assert.equal(c.ttl,'24h');assert.equal(c.scrollSync,true);
});
const {sourceAtOffset,fragmentTarget}=require('../media/navigation');
test('长列表和引用的源文联动定位临近正文，避免跳到父块起点',()=>{
 const blocks=[{line:2,top:-800},{line:4,top:-700},{line:20,top:90},{line:20,top:90},{line:23,top:160}];
 assert.equal(sourceAtOffset(blocks,130),20);assert.equal(sourceAtOffset([{line:5,top:220}],130),5);assert.equal(sourceAtOffset([],130),null);
 const headings=[{id:'piper-heading-0',title:'中文 Heading!',line:0},{id:'piper-heading-1',title:'中文 Heading!',line:5}];
 assert.equal(fragmentTarget(headings,'中文-heading').line,0);assert.equal(fragmentTarget(headings,'piper-heading-1').line,5);
});
