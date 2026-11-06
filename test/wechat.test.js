'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {render,safeURL}=require('../src/render');
const {inspectWechatCompatibility,assertWechatCompatible}=require('../src/wechat-preflight');
const {verifyClipboard}=require('../src/clipboard');

test('公众号目录支持中文重复标题与MPE目录标记，不执行一般import',async()=>{
 for(const marker of ['[TOC]','[toc]','@import "[TOC]"',"@import '[TOC]'",'<!-- @import "[TOC]" {cmd="toc" depthFrom=1 depthTo=6 orderedList=false} -->']){
  const markdown=`# 主标题\n\n${marker}\n\n## 中文 & 内容\n\n正文\n\n## 中文 & 内容`;
  assert.doesNotThrow(()=>assertWechatCompatible(markdown));
  const out=await render(markdown,{filename:__filename});
  assert.match(out.html,/class="article-toc"/);assert.match(out.html,/href="#piper-heading-1"/);assert.match(out.html,/id="piper-heading-2"/);assert.match(out.html,/中文 &amp; 内容/);
  assert.doesNotMatch(out.html,/@import|\[TOC\]/i);
 }
 const out=await render('```text\n[TOC]\n@import "[TOC]"\n```',{filename:__filename});
 assert.doesNotMatch(out.html,/article-toc/);
});

test('MPE目录注释保留层级与有序选项，并拒绝任意命令或未知参数',async()=>{
 const marker='<!-- @import "[TOC]" {cmd="toc" depthFrom=2 depthTo=3 orderedList=true} -->';
 const markdown='# Outside\n\n'+marker+'\nPlain text\n\n## Included\n\n### Nested\n\n#### Too deep\n\n## Second';
 assert.doesNotThrow(()=>assertWechatCompatible(markdown));
 const out=await render(markdown,{filename:__filename});
 const toc=out.html.match(/<section class="article-toc"[\s\S]*?<\/section>/)[0];
 assert.match(toc,/<ol>/);assert.match(toc,/Included/);assert.match(toc,/Nested/);assert.match(toc,/Second/);
 assert.doesNotMatch(toc,/Outside|Too deep/);assert.equal((toc.match(/<ol>/g)||[]).length,2);
 for(const options of ['cmd="sh"','cmd="toc" run_on_save=true','depthFrom=6 depthTo=2','orderedList="yes"','depthFrom=2 depth_from=3']){
  const invalid='<!-- @import "[TOC]" {'+options+'} -->';
  assert.throws(()=>assertWechatCompatible(invalid),/公众号目录/);
  await assert.rejects(render(invalid,{filename:__filename}),/公众号目录/);
 }
 const ordinary='<!-- @import "private.txt" {cmd="cat"} -->';
 assert.throws(()=>assertWechatCompatible(ordinary),/文件导入/);
 await assert.rejects(render(ordinary,{filename:__filename}),/文件导入/);
 const code=await render('```text\n'+marker+'\n```',{filename:__filename});assert.doesNotMatch(code.html,/class="article-toc"/);
});

test('发布预检明确拦截图表执行和导入，普通代码示例不误拦',()=>{
 const doc='```mermaid\ngraph TD; A-->B\n```\n\n```python {cmd=true}\nprint(1)\n```\n\n@import "secret.txt"\n\n[[另一篇]]';
 const issues=inspectWechatCompatibility(doc);
 assert.deepEqual(issues.map(i=>i.kind),['可执行代码块','文件导入 @import','双链 / 嵌入引用']);
 assert.equal(issues[0].line,5);assert.equal(issues[1].line,9);
 assert.throws(()=>assertWechatCompatible(doc),/公众号排版暂不能转换.*第 5 行/);
 assert.deepEqual(inspectWechatCompatibility('**说明** @import "作为行内文字"\n\n`@import "x"`\n\n```js\nconst cmd = "mermaid";\n```\n\n    @import "example"'),[]);
});

function harness({markdown='正文',selection,renderError,cancelled=false,assets=false,exportPathError,config={},selectionMarkdown='选区内容',uploadError=true,missingToken=false,locale='zh-cn',realPipeline=false}={}){
 const commands=new Map(),errors=[],writes=[],renders=[],secretReads=[],messages=[],exports=[],notifications=[];
 const uri={scheme:'file',fsPath:'/workspace/article.md',toString:()=> 'file:///workspace/article.md'};
 const doc={version:1,languageId:'markdown',uri,lineCount:10,getText:s=>s===selection&&selection?selectionMarkdown:markdown};
 const disposal=()=>({dispose(){}});
 const cfg={imageHostProvider:'piper',uploadUrl:'https://upload.example:8617/api/public-images',ttl:'3h',fileField:'file',urlField:'url',fontSize:16,...config};
 const vscode={
  env:{language:locale},
  workspace:{isTrusted:true,getWorkspaceFolder:()=>({uri:{fsPath:'/workspace'}}),onDidChangeTextDocument:disposal,onDidOpenTextDocument:disposal,onDidChangeConfiguration:disposal,fs:{writeFile:async(uri,bytes)=>exports.push({uri,bytes})}},
  window:{activeTextEditor:undefined,onDidChangeTextEditorVisibleRanges:disposal,showErrorMessage:m=>errors.push(m),showInformationMessage:m=>messages.push(m),withProgress:async(o,fn)=>fn({report:value=>notifications.push(value)},{isCancellationRequested:cancelled,onCancellationRequested:disposal}),showInputBox:async()=>undefined,showSaveDialog:async options=>options.defaultUri},
  commands:{registerCommand:(name,fn)=>{commands.set(name,fn);return disposal();}},ProgressLocation:{Notification:1},Uri:{file:fsPath=>({scheme:'file',fsPath})}
 };
 const context={subscriptions:[],secrets:{get:async k=>{secretReads.push(k);return missingToken?undefined:'test-secret';},store:async()=>{},delete:async()=>{}},asAbsolutePath:relative=>'/extension/'+relative};
 const renderStub=async(text,options)=>{renders.push(text);if(renderError)throw new Error(renderError);if(assets)await options.resolveAsset({bytes:Buffer.from('asset'),mime:'image/png'});return {html:'<p>'+text+'</p>',text,uniqueAssets:assets?1:0};};
 const module={exports:{}};
 const customRequire=name=>name==='vscode'?vscode:name==='./render'?{render:realPipeline?render:renderStub,safeURL}:name==='./upload'?{...require('../src/upload'),upload:realPipeline?require('../src/upload').upload:async()=>{if(uploadError)throw new Error('上传失败');return 'https://images.example/asset';}}:name==='./export-path'?{assertSeparateDestination:async()=>{if(exportPathError)throw new Error(exportPathError);}}:name==='./clipboard'?{writeClipboard:async(helper,result)=>writes.push(result)}:name==='./config'?{readConfig:()=>cfg}:name.startsWith('./')?require(path.join(__dirname,'../src',name.slice(2))):require(name);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/wechat-extension.js'),'utf8'),{require:customRequire,module,exports:module.exports,process:{platform:'darwin',arch:'arm64'},Buffer,AbortController,setTimeout,clearTimeout},{filename:'wechat-extension.js'});
 let resolutions=0;
 const api=module.exports.activate(context,{resolveDocument:async()=>{resolutions++;return doc;},openEnhanced:async()=>{}});
 return {commands,api,doc,vscode,errors,writes,renders,secretReads,messages,exports,notifications,cfg,get resolutions(){return resolutions;}};
}

test('微信命令复用预览文档解析，保留旧别名与原SecretStorage键',async()=>{
 const h=harness({markdown:'正文 $x$',assets:true,uploadError:false});
 assert.deepEqual(Object.keys(h.api).sort(),['copy','exportHTML','preview','service']);
 for(const name of ['piperMarkdown.copy','piperMarkdown.setToken','piperMarkdown.clearToken','piperMarkdown.previewWechat','piperMarkdown.exportWechatHTML','piperWechat.copy','piperWechat.preview','piperWechat.setToken','piperWechat.clearToken'])assert.ok(h.commands.has(name),name);
 for(const name of ['piperMarkdown.preview','piperMarkdown.exportHTML','piperMarkdown.openMPE'])assert.equal(h.commands.has(name),false,name);
 await h.commands.get('piperMarkdown.copy')();
 assert.equal(h.resolutions,1);assert.deepEqual(h.renders,['正文 $x$']);assert.equal(h.writes.length,1);
 const expected='upload:'+crypto.createHash('sha256').update(safeURL(h.cfg.uploadUrl).href).digest('hex');
 assert.equal(h.secretReads[0],expected);assert.match(h.messages[0],/已复制.*3h/);
 await h.commands.get('piperWechat.copy')();assert.equal(h.writes.length,2);
});

test('编辑器选区仅在对应源文匹配时复制，增强预览不会误复制另一文档选区',async()=>{
 const selected={isEmpty:false};const h=harness({selection:selected});
 h.vscode.window.activeTextEditor={document:h.doc,selection:selected};await h.commands.get('piperMarkdown.copy')();assert.equal(h.renders[0],'选区内容');
 h.vscode.window.activeTextEditor={document:{},selection:selected};await h.commands.get('piperMarkdown.copy')();assert.equal(h.renders[1],'正文');
});

test('高级语法、渲染失败、取消、上传失败都不覆盖剪贴板',async()=>{
 for(const options of [{markdown:'```plantuml\nAlice -> Bob\n```'},{renderError:'渲染失败'},{cancelled:true},{assets:true}]){
  const h=harness(options);await h.commands.get('piperMarkdown.copy')();assert.equal(h.writes.length,0);assert.equal(h.errors.length,options.cancelled?0:1);
  if(options.cancelled){assert.match(h.messages[0],/保留策略/);assert.doesNotMatch(h.messages[0],/自动过期/);}
  if(options.markdown){assert.equal(h.renders.length,0);assert.equal(h.secretReads.length,0);}
 }
 const untrusted=harness();untrusted.vscode.workspace.isTrusted=false;await untrusted.commands.get('piperMarkdown.copy')();assert.equal(untrusted.writes.length,0);assert.match(untrusted.errors[0],/信任/);
});

test('公众号HTML导出使用独立名称并在高级语法时停止写文件',async()=>{
 const h=harness();await h.commands.get('piperMarkdown.exportWechatHTML')();assert.equal(h.exports.length,1);assert.equal(h.exports[0].uri.fsPath,'/workspace/article.wechat.html');assert.match(h.exports[0].bytes.toString(),/<main><p>正文<\/p><\/main>/);
 const alias=harness({exportPathError:'Export destination points to the source Markdown document.'});await alias.commands.get('piperMarkdown.exportWechatHTML')();assert.equal(alias.exports.length,0);assert.match(alias.errors[0],/source Markdown/);
 const unsupported=harness({markdown:'@import \"secret.md\"'});await unsupported.commands.get('piperMarkdown.exportWechatHTML')();assert.equal(unsupported.exports.length,0);assert.equal(unsupported.errors.length,1);
});

test('Swift助手在独立命名剪贴板真实验证中文HTML和文本', {skip:process.platform!=='darwin'||process.arch!=='arm64'}, async()=>{
 const output=await render('# 中文验收\n\n[TOC]\n\n## 公式与链接\n\n$x^2$ 与 [链接](https://example.com)',{filename:__filename});
 await verifyClipboard(path.join(__dirname,'../bin/clipboard'),output);
 await assert.rejects(()=>verifyClipboard(path.join(__dirname,'../bin/clipboard'),{html:123,text:'无效payload'}),/剪贴板写入失败/);
});


test('忽略首标题覆盖复制、选区和公众号HTML；空正文不清空剪贴板',async()=>{
 const source='# 大标题\n\n正文\n\n# 后续标题';
 const regular=harness({markdown:source});await regular.commands.get('piperMarkdown.copy')();assert.equal(regular.renders[0],source);
 const skipped=harness({markdown:source,config:{wechatSkipLeadingH1:true}});await skipped.commands.get('piperMarkdown.copy')();assert.doesNotMatch(skipped.renders[0],/大标题/);assert.match(skipped.renders[0],/# 后续标题/);assert.match(skipped.messages[0],/已忽略/);assert.equal(skipped.doc.getText(),source);
 await skipped.commands.get('piperMarkdown.exportWechatHTML')();assert.doesNotMatch(skipped.exports[0].bytes.toString(),/大标题/);
 const selection={isEmpty:false},selected=harness({selection,selectionMarkdown:'# 选区标题\n\n选区正文',config:{wechatSkipLeadingH1:true}});selected.vscode.window.activeTextEditor={document:selected.doc,selection};await selected.commands.get('piperMarkdown.copy')();assert.doesNotMatch(selected.writes[0].text,/选区标题/);assert.match(selected.writes[0].text,/选区正文/);
 const empty=harness({markdown:'# 唯一标题',config:{wechatSkipLeadingH1:true}});await empty.commands.get('piperMarkdown.copy')();assert.equal(empty.writes.length,0);assert.match(empty.errors[0],/没有正文/);
});

test('无需鉴权的通用图床不读取凭据，第三方图床不显示Piper TTL承诺',async()=>{
 const h=harness({assets:true,uploadError:false,config:{imageHostProvider:'generic',uploadAuthMode:'none'}});await h.commands.get('piperMarkdown.copy')();assert.equal(h.errors.length,0);assert.equal(h.secretReads.length,0);assert.match(h.messages[0],/保留期限由图床管理/);assert.doesNotMatch(h.messages[0],/3h/);
});


test('missing credentials are actionable before expensive render and pure text needs no credential',async()=>{
 const missing=harness({markdown:'Formula $x^2$',missingToken:true,locale:'en'});
 await missing.commands.get('piperMarkdown.copy')();
 assert.equal(missing.renders.length,0);assert.equal(missing.writes.length,0);assert.match(missing.errors[0],/upload credential/i);
 const plain=harness({markdown:'Plain text',missingToken:true,locale:'en'});await plain.commands.get('piperMarkdown.copy')();
 assert.equal(plain.secretReads.length,0);assert.equal(plain.writes.length,1);
 const host=harness({markdown:'![local](image.png)',config:{uploadUrl:''},locale:'en'});await host.commands.get('piperMarkdown.copy')();
 assert.equal(host.renders.length,0);assert.match(host.errors[0],/image host/);
});


async function uploadHost(t,handler){
 const http=require('node:http'),requests=[];let active=0,maxActive=0;
 const server=http.createServer(async(req,res)=>{
  active++;maxActive=Math.max(maxActive,active);const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const form=await new Response(Buffer.concat(chunks),{headers:{'content-type':req.headers['content-type']}}).formData();
  const received={headers:req.headers,path:req.url,form};requests.push(received);
  try{await handler(received,res,requests.length);}finally{active--;}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 return {url:'http://127.0.0.1:'+server.address().port+'/upload',requests,get maxActive(){return maxActive;}};
}

test('Piper copy uses real renderer/uploads, displays retry detail and only writes a complete clipboard result',async t=>{
 const host=await uploadHost(t,async(request,res,index)=>{
  assert.equal(request.headers.authorization,'Bearer test-secret');assert.equal(request.path,'/upload?ttl=3h');
  assert.ok((await request.form.get('file').arrayBuffer()).byteLength>0);
  if(index===1){res.writeHead(429,{'Retry-After':'0'});res.end('private-limit');}
  else {await new Promise(resolve=>setTimeout(resolve,20));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({url:'https://images.example/'+index}));}
 });
 const h=harness({markdown:'$a$ $b$ $c$',realPipeline:true,config:{uploadUrl:host.url}});
 const result=await h.api.copy(h.doc);
 assert.equal(result.uniqueAssets,3);assert.equal(host.requests.length,4);assert.equal(host.maxActive,1);assert.equal(h.writes.length,1);assert.equal(h.errors.length,0);
 assert.equal((h.writes[0].html.match(/https:\/\/images.example\//g)||[]).length,3);
 assert.ok(h.notifications.some(p=>/第 1\/3 张.*第 1\/3 次重试/.test(p.message)));
 assert.ok(h.notifications.some(p=>/第 3\/3 张/.test(p.message)));
 assert.doesNotMatch(JSON.stringify(h.notifications),/private-limit|test-secret/);
});

test('retry exhaustion and cancellation preserve the clipboard and successful-image progress',async t=>{
 for(const cancel of [false,true]){
  const host=await uploadHost(t,async(_,res)=>{res.writeHead(429,{'Retry-After':cancel?'10':'0'});res.end();});
  const h=harness({markdown:'$a$ $b$ $c$',realPipeline:true,config:{uploadUrl:host.url}}),controller=new AbortController(),progress=[];
  await assert.rejects(h.api.copy(h.doc,undefined,{signal:controller.signal,onProgress:p=>{progress.push(p);if(cancel&&p.state==='retrying')controller.abort();}}),error=>cancel?error.name==='AbortError':error.code==='UPLOAD_RATE_LIMITED');
  assert.equal(h.writes.length,0);assert.equal(host.requests.length,cancel?1:4);assert.equal(progress.filter(p=>p.phase==='clipboard').length,0);
  const waits=progress.filter(p=>p.state==='retrying');assert.ok(waits.length);for(const p of waits){assert.equal(p.completed,0);assert.equal(p.total,3);}
  assert.equal(h.errors.length,cancel?0:1);
  if(!cancel){assert.match(h.errors[0],/429/);assert.doesNotMatch(h.errors[0],/Token|credential|图床设置/);}
 }
});
