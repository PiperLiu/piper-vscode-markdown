const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const {upload}=require('../src/upload');
test('multipart、Bearer、TTL 与自定义 JSON 字段',async t=>{
 let received='';const server=http.createServer(async(req,res)=>{assert.equal(req.headers.authorization,'Bearer test-token');assert.equal(req.headers['x-requested-with'],'ThemeTodo');assert.match(req.url,/ttl=3h/);for await(const b of req)received+=b;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:{url:'https://images.example/a'}}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const url=await upload({bytes:Buffer.from('image'),mime:'image/png'},{uploadUrl:`http://127.0.0.1:${server.address().port}/upload`,ttl:'3h',fileField:'asset',urlField:'data.url'},'test-token');
 assert.equal(url,'https://images.example/a');assert.match(received,/name="asset"/);assert.match(received,/image.png/);
});
test('不跟随重定向泄露 token',async t=>{
 let leaked=false;const server=http.createServer((req,res)=>{if(req.url==='/target')leaked=true;res.writeHead(302,{Location:'/target'});res.end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 await assert.rejects(()=>upload({bytes:Buffer.from('a'),mime:'image/png'},{uploadUrl:`http://127.0.0.1:${server.address().port}/`,ttl:'3h'},'secret'));assert.equal(leaked,false);
});
test('图床响应在流读取时限制为 64 KiB',async t=>{
 const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end('x'.repeat(70000));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 await assert.rejects(()=>upload({bytes:Buffer.from('a'),mime:'image/png'},{uploadUrl:`http://127.0.0.1:${server.address().port}/`,ttl:'3h'},'secret'),/图床响应过大/);
});
