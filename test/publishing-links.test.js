'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('cheerio');
const {render}=require('../src/render');
const {normalizeWechatLinks}=require('../src/publishing-links');
test('WeChat clipboard preserves labels, public URL text and images but only exact approved hrefs',async()=>{
 const source='# Title\n\n[TOC]\n\n## Chapter\n\n[**External**](https://example.com/a?x=1&y=2) [WeChat](https://mp.weixin.qq.com/s/article?x=1&y=2) [Local](../private.md) [jump](#chapter) [mail](mailto:reader@example.com)\n\n[![Image](https://images.example/p.png)](https://example.com)\n\nText[^n].\n\n[^n]: Footnote content.';
 const out=await render(source,{filename:__filename});const $=load(out.html);
 assert.deepEqual($('a').map((_,a)=>$(a).attr('href')).get(),['https://mp.weixin.qq.com/s/article?x=1&y=2']);
 assert.equal($('img').attr('src'),'https://images.example/p.png');assert.equal($('strong').filter((_,n)=>$(n).text()==='External').length,1);
 for(const text of ['External','https://example.com/a?x=1&y=2','reader@example.com','Footnote content.','Local','Chapter'])assert.ok(out.text.includes(text),text);
 assert.doesNotMatch(out.html,/private\.md|href="#|file:\/\//);assert.ok(out.convertedLinks>0);
 const preview=await render(source,{filename:__filename,preview:true});assert.match(preview.html,/href="#piper-heading-/);assert.doesNotMatch(preview.html,/<a[^>]+href="https:\/\/example/);
});
test('exact domain matching rejects lookalikes, credentials, ports and non-HTTPS links without losing text',()=>{
 const $=load('<div></div>',null,false);const urls=['https://mp.weixin.qq.com.evil.example/s/a','https://evil.example/mp.weixin.qq.com','https://mp.weixin.qq.com@evil.example/s/a','https://user@mp.weixin.qq.com/s/a','https://mp.weixin.qq.com:444/s/a','https://mp.weixin.qq.com./s/a','http://mp.weixin.qq.com/s/a','#note','mailto:a@example.com'];
 for(const href of urls)$('div').append($('<a>').attr('href',href).append('<em>label</em>'));
 normalizeWechatLinks($);assert.equal($('a').length,0);assert.equal($('em').length,urls.length);assert.doesNotMatch($.html(),/user@|href=/);
});
test('enhanced parser output and generated TOC are filtered at the final publishing boundary',async()=>{
 const out=await render('synthetic',{filename:__filename,wechatIncludeTOC:true,parseEnhanced:async()=>({html:'<h1>Heading</h1><p><a href="https://example.com">Example</a> <a href="https://mp.weixin.qq.com/s/a">Allowed</a></p>'})});
 const $=load(out.html);assert.equal($('.article-toc').length,1);assert.deepEqual($('[href]').map((_,n)=>$(n).attr('href')).get(),['https://mp.weixin.qq.com/s/a']);assert.match(out.text,/https:\/\/example.com/);
});
