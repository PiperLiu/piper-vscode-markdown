const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {render,mathImage,safeURL,localImage,rasterSVG}=require('../src/render');
test('中文、代码、矩阵公式都渲染成内联样式 HTML',async()=>{
 const result=await render('# 中文标题\n\n**加粗** 与 $x^2$\n\n$$A=\\begin{pmatrix}2&1\\\\0&1\\end{pmatrix}$$\n\n```js\nconst x = 1;\n```',{filename:__filename});
 assert.match(result.html,/<h1 style=/);assert.match(result.html,/data:image\/png;base64,/);assert.equal(result.uniqueAssets,2);assert.match(result.html,/font-size: 16px/);assert.doesNotMatch(result.html,/<script/);
 const m=mathImage('x^2',false,16);assert.ok(m.bytes.length>100);assert.ok(m.width>0&&m.height>0);
});
test('HTML 注入不执行；不允许不安全 URL',async()=>{
 const r=await render('<script>alert(1)</script>\n\n[a](javascript:alert(1))',{filename:__filename});assert.doesNotMatch(r.html,/<script/);
 for(const url of ['file:///tmp/a','http://example.com','https://u:p@example.com'])assert.throws(()=>safeURL(url));
 assert.equal(safeURL('http://127.0.0.1:8617').protocol,'http:');
});
test('SVG 转换、GIF 保留、同图去重与目录边界',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'piper-render-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'图.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><rect width="60" height="40" fill="red"/></svg>');
 const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');await fs.writeFile(path.join(root,'a.gif'),gif);
 const asset=await localImage('a.gif',path.join(root,'a.md'),root);assert.equal(asset.mime,'image/gif');assert.deepEqual(asset.bytes,gif);
 let calls=0;const r=await render('![图](图.svg)\n\n![重复](图.svg)',{filename:path.join(root,'a.md'),root,resolveAsset:async()=>{calls++;return 'https://example.com/image';}});assert.equal(calls,1);assert.equal(r.uniqueAssets,1);assert.doesNotMatch(r.html,/data:image/);
 await fs.symlink(__filename,path.join(root,'escape.png'));await assert.rejects(()=>localImage('escape.png',path.join(root,'a.md'),root),/超出工作区/);
 assert.throws(()=>rasterSVG('<svg><image href="file:///etc/passwd"/></svg>',100),/外部资源/);
});
test('未闭合公式与取消不产生完成结果',async()=>{await assert.rejects(()=>render('$$x',{filename:__filename}),/缺少/);const c=new AbortController();c.abort();await assert.rejects(()=>render('text',{filename:__filename,signal:c.signal}),{name:'AbortError'});});
