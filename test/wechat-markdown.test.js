'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {prepareWechatMarkdown}=require('../src/wechat-markdown');
const {render}=require('../src/render');
const {readConfig}=require('../src/config');
test('leading H1 omission handles ATX, Setext, BOM, blank lines and CRLF without changing source line mappings',async()=>{
 for(const source of ['# 标题\n\n正文\n\n## 小节','\uFEFF\r\n\r\n# 标题 ###\r\n\r\n正文\r\n\r\n## 小节','标题\n====\n\n正文\n\n## 小节']){
  const output=prepareWechatMarkdown(source,true);assert.equal(output.omittedTitle,true);assert.doesNotMatch(output.markdown,/标题/);assert.match(output.markdown,/正文/);
  assert.equal(output.markdown.split(/\r\n|\n|\r/).length,source.split(/\r\n|\n|\r/).length);
  const full=await render(source,{filename:__filename,preview:true}),omitted=await render(output.markdown,{filename:__filename,preview:true});
  assert.equal(omitted.headings[0].line,full.headings[1].line);
 }
});
test('body headings, quotations, code and escaped markers are retained, and default remains unchanged',()=>{
 for(const source of ['正文\n\n# 标题','## 小标题\n\n# 正文标题','> # 引用标题','```md\n# 代码\n```','    # 缩进代码','\\# 转义标题'])assert.deepEqual(prepareWechatMarkdown(source,true),{markdown:source,omittedTitle:false});
 assert.deepEqual(prepareWechatMarkdown('# 标题\n正文'),{markdown:'# 标题\n正文',omittedTitle:false});
 assert.throws(()=>prepareWechatMarkdown('x'.repeat(1_000_001),true),/文章过长/);
});
test('omitted heading is absent from both rendered TOC and plain-text fallback',async()=>{
 const output=prepareWechatMarkdown('# 不要复制的标题\n\n[TOC]\n\n## 保留章节\n\n正文\n\n# 后续一级标题',true);
 const rendered=await render(output.markdown,{filename:__filename,preview:true});
 assert.doesNotMatch(rendered.html,/不要复制的标题/);assert.doesNotMatch(rendered.text,/不要复制的标题/);assert.match(rendered.html,/article-toc/);assert.equal(rendered.headings.length,2);assert.match(rendered.html,/后续一级标题/);
});
test('host credential routing is user-only while the title preference remains resource-configurable',()=>{
 const current={uploadUrl:{globalValue:'https://user.example/upload',workspaceValue:'https://repository.example/upload'},imageHostProvider:{globalValue:'qiniu',workspaceValue:'generic'},uploadHeaderName:{globalValue:'Authorization',workspaceValue:'X-Leak'},uploadFields:{globalValue:{folder:'public'},workspaceValue:{token:'bad'}},wechatSkipLeadingH1:{globalValue:false,workspaceValue:true}};
 const config=readConfig({getConfiguration:ns=>({inspect:k=>ns==='piperMarkdown'?current[k]:undefined})});
 assert.equal(config.uploadUrl,'https://user.example/upload');assert.equal(config.imageHostProvider,'qiniu');assert.equal(config.uploadHeaderName,'Authorization');assert.deepEqual(config.uploadFields,{folder:'public'});assert.equal(config.wechatSkipLeadingH1,true);
});
