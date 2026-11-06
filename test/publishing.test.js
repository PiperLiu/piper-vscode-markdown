'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {render,mathImage,disposePublishingBrowser}=require('../src/render');
const {validateSVG}=require('../src/publishing-svg');
const {ByteCache}=require('../src/publishing-cache');
after(()=>disposePublishingBrowser());
test('opaque math pixels retain padding and correct baseline in light/dark clients',()=>{
 const {Resvg}=require('@resvg/resvg-js'),m=mathImage('x^2',false,16);
 const width=m.bytes.readUInt32BE(16),height=m.bytes.readUInt32BE(20);const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="data:image/png;base64,${m.bytes.toString('base64')}" width="${width}" height="${height}"/></svg>`;
 const pixels=new Resvg(svg,{font:{loadSystemFonts:false}}).render().pixels;
 for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],255);
 assert.deepEqual([...pixels.subarray(0,4)],[255,255,255,255]);assert.ok(m.depth<=-2);assert.ok(m.width>4&&m.height>4);
});
test('footnotes become numbered endnotes and task state is static, source stays untouched',async()=>{
 const markdown='# Title\n\nTask list\n\n- [x] Done\n- [ ] Open\n\nText[^one].\n\n[^one]: Endnote content.';
 const result=await render(markdown,{filename:__filename});assert.match(result.text,/☑/);assert.match(result.text,/Endnote content/);assert.match(result.html,/☑/);assert.match(result.html,/☐/);assert.match(result.html,/article-endnotes/);assert.match(result.html,/Endnote content/);assert.doesNotMatch(result.html,/<input|footnote-backref/);
});
test('TOC auto-add never duplicates authored markers and styling is validated',async()=>{
 const source='# Title\n\n## Section\n\nBody';const off=await render(source,{filename:__filename}),on=await render(source,{filename:__filename,wechatIncludeTOC:true,style:{preset:'editorial',fontSize:18,lineHeight:2,accentColor:'#123456',headingStyle:'plain'}});
 assert.doesNotMatch(off.html,/article-toc/);assert.match(on.html,/article-toc/);assert.match(on.html,/font-size: 18px/);assert.match(on.html,/line-height: 2/);
 const explicit=await render('[TOC]\n\n'+source,{filename:__filename,wechatIncludeTOC:true});assert.equal((explicit.html.match(/class="article-toc"/g)||[]).length,1);
 await assert.rejects(render(source,{filename:__filename,style:{accentColor:'red; background:url(file:///x)'}}),/无效/);
});
test('TOC examples in fenced code or prose do not suppress automatic article TOC',async()=>{
 const source='# Title\n\n```md\n[TOC]\n```\n\nUse `[TOC]` to insert a directory.\n\n## Section';
 for(const parseEnhanced of [undefined,async()=>({html:'<h1>Title</h1><pre><code>[TOC]</code></pre><p>Use [TOC] to insert a directory.</p><h2>Section</h2>'})]){
  const result=await render(source,{filename:__filename,wechatIncludeTOC:true,parseEnhanced});
  assert.equal((result.html.match(/class="article-toc"/g)||[]).length,1);assert.match(result.html,/\[TOC\]/);
 }
});
test('enhanced math, Graphviz SVG and footnote HTML pass through the shared safe renderer',async()=>{
 const source='Synthetic enhanced source';const result=await render(source,{filename:__filename,preview:true,parseEnhanced:async()=>({html:'<h1 data-source-line="0">Title</h1><p data-source-line="3"><span class="mathjax-exps">$x^2$</span></p><section class="footnotes"><ol><li>Note</li></ol></section>'})});
 assert.equal(result.assets,1);assert.match(result.html,/math-image/);assert.match(result.html,/data:image\/png/);assert.match(result.html,/article-endnotes/);assert.match(result.text,/x\^2/);assert.doesNotMatch(result.text,/data:image|<span/);assert.equal(result.headings[0].line,0);
 for(const html of ['<iframe src="https://example.com"></iframe>','<script>alert(1)</script>','<img src="file:///etc/passwd">','<p style="background:url(https://example.com)">bad</p>'])await assert.rejects(render('text',{filename:__filename,parseEnhanced:async()=>({html})}));
});
test('SVG checks reject entity-obscured resources, events and CSS escapes before rendering',()=>{
 for(const inside of ['<image href="&#102;ile:///private.png"/>','<rect onclick="bad()"/>','<style>rect{fill:url(https://example.com/x)}</style>','<style>@impor\\74 "x";</style>'])assert.throws(()=>validateSVG('<svg xmlns="http://www.w3.org/2000/svg">'+inside+'</svg>'));
 assert.doesNotThrow(()=>validateSVG('<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="a"/></defs><rect fill="url(\'#a\')"/></svg>'));
});
test('upload concurrency is bounded and conversion failures never start uploads',async()=>{
 let inFlight=0,max=0,uploads=0;const progress=[];
 const result=await render('$a$ $b$ $c$ $d$ $e$',{filename:__filename,onProgress:p=>progress.push(p),resolveAsset:async()=>{uploads++;max=Math.max(max,++inFlight);await new Promise(resolve=>setTimeout(resolve,5));inFlight--;return 'https://images.example/'+uploads;}});
 assert.equal(result.uniqueAssets,5);assert.equal(uploads,5);assert.equal(max,3);assert.ok(progress.some(p=>p.phase==='upload'&&p.completed===5));
 uploads=0;await assert.rejects(render('$a$\n\n![missing](missing.png)',{filename:__filename,resolveAsset:async()=>{uploads++;return 'https://images.example/a';}}));assert.equal(uploads,0);
});
test('cache enforces byte/entry bounds and updates recency',()=>{const cache=new ByteCache(5,2),value=n=>({bytes:Buffer.alloc(n)});cache.set('a',value(2));cache.set('b',value(2));cache.get('a');cache.set('c',value(2));assert.equal(cache.get('b'),undefined);assert.ok(cache.get('a'));assert.equal(cache.bytes,4);cache.set('large',value(6));assert.equal(cache.bytes,4);});
test('SVG browser/fallback pipeline preserves Chinese and caches completed bytes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'piper-svg-tests-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 await fs.writeFile(path.join(dir,'sample.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="white"/><text x="10" y="40" font-size="20">中文图表 Test</text></svg>');
 const source='![diagram](sample.svg)',first=await render(source,{filename:path.join(dir,'a.md'),preview:true}),second=await render(source,{filename:path.join(dir,'a.md'),preview:true});assert.equal(first.html,second.html);assert.equal(first.uniqueAssets,1);assert.match(first.html,/image\/png/);
});
test('offline Mermaid, WaveDrom, Vega and Vega-Lite render actual PNGs; malformed/external specifications fail explicitly',async()=>{
 const diagrams={mermaid:'graph TD\n A[Start] --> B[Finish]',wavedrom:'{"signal":[{"name":"clk","wave":"p...."}]}',vega:'{"width":100,"height":80,"marks":[{"type":"rect","encode":{"enter":{"x":{"value":10},"y":{"value":10},"width":{"value":50},"height":{"value":40},"fill":{"value":"red"}}}}]}','vega-lite':'{"data":{"values":[{"x":"A","y":2},{"x":"B","y":3}]},"mark":"bar","encoding":{"x":{"field":"x","type":"nominal"},"y":{"field":"y","type":"quantitative"}}}'};
 for(const [kind,source]of Object.entries(diagrams)){const result=await render('```'+kind+'\n'+source+'\n```',{filename:__filename});assert.equal(result.uniqueAssets,1,kind);assert.match(result.html,/data:image\/png;base64,/);assert.doesNotMatch(result.html,/<script|<svg|<canvas/);}
 await assert.rejects(render('```wavedrom\n{signal: []}\n```',{filename:__filename}),/JSON.*第 1 行/);
 await assert.rejects(render('```vega\n{"data":[{"url":"https://example.com/private-data"}]}\n```',{filename:__filename}),/外部资源.*第 1 行/);
 await assert.rejects(render('```mermaid\nnot a diagram at all\n```',{filename:__filename}),/转换失败[\s\S]*第 1 行/);
});
test('abort during upload cancels sibling operations and never returns partial HTML',async()=>{
 let observed=false;
 await assert.rejects(render('$a$ $b$ $c$',{filename:__filename,resolveAsset:async(asset,signal)=>{if(!observed){observed=true;await new Promise(r=>setTimeout(r,10));throw new Error('Synthetic upload failure');}await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});return 'https://images.example/unused';}}),/Synthetic upload failure/);
});
test('real enhanced parser preserves TOC options, Graphviz, imports and local link labels without exposing paths',async t=>{
 const Module=require('node:module'),vendor=path.resolve(__dirname,'../vendor/mpe'),v=Module.createRequire(path.join(vendor,'package.json')),crossnote=Module.createRequire(v.resolve('crossnote'));
 const built=await v('esbuild').build({entryPoints:[path.join(vendor,'src/publishing-parser.ts')],bundle:true,platform:'node',format:'cjs',write:false,packages:'external'});
 const moduleName=path.join(vendor,'test/.publishing-runtime-test.cjs'),loaded=new Module(moduleName,module);loaded.filename=moduleName;loaded.paths=Module._nodeModulePaths(path.dirname(moduleName));loaded.require=function(name){return name==='piper-publishing-cheerio'?crossnote('cheerio'):Module.prototype.require.call(this,name);};loaded._compile(built.outputFiles[0].text,moduleName);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'piper-enhanced-tests-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const filename=path.join(dir,'article.md');await fs.writeFile(filename,'Unmodified disk source');await fs.writeFile(path.join(dir,'part.md'),'## Imported\n\nImported paragraph.');
 const markdown='# Root title\n\n<!-- @import "[TOC]" {cmd="toc" depthFrom=2 depthTo=3 orderedList=true} -->\n\n## Main section\n\n[Local](part.md)\n\n@import "part.md"\n\n```dot\ndigraph { A -> B }\n```';
 const result=await render(markdown,{filename,root:dir,preview:true,parseEnhanced:loaded.exports.parseEnhanced});
 assert.equal(result.uniqueAssets,1);assert.equal(result.headings[0].line,0);assert.match(result.html,/Imported paragraph/);assert.match(result.html,/Local/);assert.doesNotMatch(result.html,/file:\/\/|PIPERTOC/);assert.equal(result.warnings[0].kind,'local-link');assert.doesNotMatch(result.text,/file:\/\/|PIPERTOC|part\.md/);assert.match(result.text,/Local/);
 const toc=result.html.match(/<section class="article-toc"[\s\S]*?<\/section>/)[0];assert.match(toc,/<ol/);assert.match(toc,/Main section/);assert.doesNotMatch(toc,/Root title/);assert.equal(await fs.readFile(filename,'utf8'),'Unmodified disk source');
 await fs.writeFile(path.join(dir,'part.md'),'## Imported\n\n<!-- @import "[TOC]" {depthFrom=2 depthTo=3 orderedList=true} -->\n\n### Child');
 const imported=await render('# Root\n\n@import "part.md"',{filename,root:dir,wechatIncludeTOC:true,parseEnhanced:loaded.exports.parseEnhanced});
 assert.equal((imported.html.match(/class="article-toc"/g)||[]).length,1);assert.match(imported.html,/<ol/);assert.doesNotMatch(imported.html,/CROSSNOTETOC|final-line end-of-document|data-piper-toc-options/);

});


test('upload retry progress retains successful image counts and never advances completion during waiting',async()=>{
 const progress=[];
 const out=await render('$x$ $y$',{filename:__filename,onProgress:p=>progress.push(p),resolveAsset:async(_,signal,{onProgress})=>{
  onProgress({state:'retrying',retry:1,maxRetries:3,retryAfterMs:2000,message:'Retry in 2s'});
  await new Promise(resolve=>setTimeout(resolve,5));signal.throwIfAborted();
  onProgress({state:'uploading',attempt:2});return 'https://images.example/ok';
 }});
 assert.equal(out.uniqueAssets,2);
 const waiting=progress.filter(p=>p.state==='retrying');assert.equal(waiting.length,2);
 for(const p of waiting){assert.equal(p.phase,'upload');assert.equal(p.total,2);assert.equal(p.completed,0);assert.match(p.message,/1\/2.*Retry in 2s/);assert.equal(p.retry,1);}
 assert.equal(progress.filter(p=>p.phase==='upload').at(-1).completed,2);
});
