const {test}=require('node:test');const assert=require('node:assert/strict');
const {render}=require('../src/render');const {exportHTML}=require('../src/preview');const {readConfig}=require('../src/config');
test('目录保留中文、重复标题独立定位，源文位置仅写入预览',async()=>{
 const markdown='# 标题\n\n## **中文** 标题\n\n正文\n\n## **中文** 标题\n';
 const preview=await render(markdown,{filename:__filename,preview:true});
 assert.deepEqual(preview.headings.map(h=>[h.title,h.line,h.level]),[['标题',0,1],['中文 标题',2,2],['中文 标题',6,2]]);
 assert.equal(new Set(preview.headings.map(h=>h.id)).size,3);assert.match(preview.html,/data-source-line="4"/);
 assert.doesNotMatch((await render(markdown,{filename:__filename})).html,/data-source-line|piper-heading-/);
});
test('导出 HTML 不含交互或原始脚本',async()=>{
 const result=await render('<script>alert(1)</script>',{filename:__filename});const exported=exportHTML(result,'<bad>');assert.doesNotMatch(exported,/<script/);assert.match(exported,/<title>&lt;bad&gt;<\/title>/);
});
test('新配置优先、旧配置兼容、未配置使用默认',()=>{
 const workspace={getConfiguration:namespace=>({inspect:key=>namespace==='piperMarkdown'?({fontSize:{globalValue:18},uploadUrl:{}}[key]):({fontSize:{globalValue:14},uploadUrl:{globalValue:'https://images.example'}}[key])})};
 const c=readConfig(workspace);assert.equal(c.fontSize,18);assert.equal(c.uploadUrl,'https://images.example');assert.equal(c.ttl,'24h');assert.equal(c.scrollSync,true);
});
