'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {upload,needsCredential,credentialScope}=require('../src/upload');

const asset={bytes:Buffer.from('image bytes'),mime:'image/png'};
async function server(t,handler){
 const received=[];
 const instance=http.createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const body=Buffer.concat(chunks);
   const form=body.length?await new Response(body,{headers:{'content-type':req.headers['content-type']}}).formData():new FormData();
   const request={headers:req.headers,path:req.url,form};received.push(request);
   await handler(request,res);
  }catch(error){res.statusCode=500;res.end('Test request parser failed');received.push({error});}
 });
 await new Promise((resolve,reject)=>{instance.once('error',reject);instance.listen(0,'127.0.0.1',resolve);});
 t.after(()=>new Promise(resolve=>{instance.closeAllConnections();instance.close(resolve);}));
 return {url:`http://127.0.0.1:${instance.address().port}/upload`,received};
}
function json(res,value){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}

test('Piper preserves Bearer, ThemeTodo, TTL and configurable multipart/JSON fields',async t=>{
 const host=await server(t,(_,res)=>json(res,{data:{url:'https://images.example/a'}}));
 const result=await upload(asset,{uploadUrl:host.url,ttl:'3h',fileField:'asset',urlField:'data.url'},'test-token');
 assert.equal(result,'https://images.example/a');
 const request=host.received[0],file=request.form.get('asset');
 assert.equal(request.headers.authorization,'Bearer test-token');
 assert.equal(request.headers['x-requested-with'],'ThemeTodo');
 assert.equal(request.path,'/upload?ttl=3h');
 assert.equal(file.name,'image.png');assert.equal(file.type,'image/png');
 assert.deepEqual(Buffer.from(await file.arrayBuffer()),asset.bytes);
 assert.deepEqual([...request.form.keys()],['asset']);
});

test('generic header authentication sends custom metadata and parses nested URL without Piper fields',async t=>{
 const host=await server(t,(_,res)=>json(res,{data:{links:[{url:'https://cdn.example/image.png'}]}}));
 const result=await upload(asset,{imageHostProvider:'generic',uploadUrl:host.url,fileField:'asset[]',urlField:'data.links.0.url',uploadAuthMode:'header',uploadHeaderName:'X-Upload-Credential',uploadHeaderPrefix:'Token ',uploadHeaders:{Accept:'application/json','X-Project':'example'},uploadFields:{album:'markdown',category:'文章'}},'upload-only');
 assert.equal(result,'https://cdn.example/image.png');
 const request=host.received[0];
 assert.equal(request.path,'/upload');assert.equal(request.headers['x-upload-credential'],'Token upload-only');
 assert.equal(request.headers.authorization,undefined);assert.equal(request.headers['x-requested-with'],undefined);
 assert.equal(request.headers.accept,'application/json');assert.equal(request.headers['x-project'],'example');
 assert.equal(request.form.get('album'),'markdown');assert.equal(request.form.get('category'),'文章');
 assert.equal(request.form.get('asset[]').name,'image.png');assert.equal(request.form.get('ttl'),null);assert.equal(request.form.get('token'),null);
});

test('generic form authentication places the saved token only in the configured field',async t=>{
 const host=await server(t,(_,res)=>json(res,{url:'https://cdn.example/form.png'}));
 await upload(asset,{imageHostProvider:'generic',uploadUrl:host.url,uploadAuthMode:'form',uploadTokenField:'api_token'},'form-secret');
 const request=host.received[0];
 assert.equal(request.headers.authorization,undefined);assert.equal(request.form.get('api_token'),'form-secret');
 assert.deepEqual([...request.form.keys()],['api_token','file']);assert.equal(request.path,'/upload');
});

test('generic none permits no credential and never sends a stale supplied credential',async t=>{
 const host=await server(t,(_,res)=>json(res,{url:'https://cdn.example/public.png'}));
 for(const token of [undefined,'unused-secret'])await upload(asset,{imageHostProvider:'generic',uploadUrl:host.url,uploadAuthMode:'none'},token);
 assert.equal(host.received.length,2);
 for(const request of host.received){assert.equal(request.headers.authorization,undefined);assert.deepEqual([...request.form.keys()],['file']);}
});

test('Qiniu uses direct form token/key/file and returns the canonical response key under the HTTPS domain',async t=>{
 const host=await server(t,(_,res)=>json(res,{hash:'mock-content-hash',key:'canonical/示例 图.png'}));
 const result=await upload(asset,{imageHostProvider:'qiniu',uploadUrl:host.url,publicBaseUrl:'https://cdn.example/assets',qiniuKeyPrefix:'markdown/2026/',ttl:'3h',fileField:'ignored',urlField:'ignored'},'scoped-upload-token');
 assert.equal(result,'https://cdn.example/assets/canonical/%E7%A4%BA%E4%BE%8B%20%E5%9B%BE.png');
 const request=host.received[0];
 assert.equal(request.path,'/upload');assert.equal(request.headers.authorization,undefined);assert.equal(request.headers['x-requested-with'],undefined);
 assert.equal(request.form.get('token'),'scoped-upload-token');
 assert.match(request.form.get('key'),/^markdown\/2026\/[a-f0-9-]{36}\.png$/);
 assert.equal(request.form.get('file').type,'image/png');
 assert.deepEqual([...request.form.keys()],['key','token','file']);
 assert.deepEqual(Buffer.from(await request.form.get('file').arrayBuffer()),asset.bytes);
});

test('Qiniu generates distinct keys and correctly escapes literal percent signs',async t=>{
 const host=await server(t,(request,res)=>json(res,{key:request.form.get('key')}));
 const config={imageHostProvider:'qiniu',uploadUrl:host.url,publicBaseUrl:'https://cdn.example/',qiniuKeyPrefix:'中文/%prefix'};
 const first=await upload(asset,config,'token'),second=await upload(asset,config,'token');
 assert.notEqual(first,second);assert.match(first,/^https:\/\/cdn\.example\/%E4%B8%AD%E6%96%87\/%25prefix\/[a-f0-9-]{36}\.png$/);
});

test('credential scopes preserve Piper and isolate providers, auth placement and Qiniu public domains',()=>{
 const base={uploadUrl:'https://upload.example/api'};
 assert.equal(credentialScope(base),'https://upload.example/api');assert.equal(needsCredential(base),true);
 assert.equal(credentialScope({...base,imageHostProvider:'piper'}),credentialScope(base));
 const generic={...base,imageHostProvider:'generic'};
 assert.notEqual(credentialScope(generic),credentialScope(base));
 assert.equal(credentialScope({...generic,uploadHeaderName:'X-Credential'}),credentialScope({...generic,uploadHeaderName:'x-credential'}));
 assert.notEqual(credentialScope(generic),credentialScope({...generic,uploadHeaderPrefix:''}));
 assert.notEqual(credentialScope(generic),credentialScope({...generic,uploadAuthMode:'form'}));
 assert.notEqual(credentialScope({...generic,uploadAuthMode:'form'}),credentialScope({...generic,uploadAuthMode:'form',uploadTokenField:'credential'}));
 assert.equal(needsCredential({...generic,uploadAuthMode:'none'}),false);assert.equal(needsCredential({...generic,uploadAuthMode:'form'}),true);
 const qiniu={...base,imageHostProvider:'qiniu',publicBaseUrl:'https://cdn.example/'};
 assert.equal(needsCredential(qiniu),true);assert.notEqual(credentialScope(qiniu),credentialScope({...qiniu,publicBaseUrl:'https://other.example/'}));
});

test('invalid configuration and credentials are rejected before any network request',async t=>{
 const host=await server(t,(_,res)=>json(res,{url:'https://cdn.example/a',key:'a.png'}));
 const generic={imageHostProvider:'generic',uploadUrl:host.url};
 const cases=[
  [{...generic,uploadAuthMode:'header'},undefined,/Token/],
  [{...generic,uploadAuthMode:'form'},'',/Token/],
  [{uploadUrl:host.url},undefined,/Token/],
  [{...generic,imageHostProvider:'unknown'},'secret',/图床类型/],
  [{...generic,uploadAuthMode:'query'},'secret',/认证方式/],
  [{...generic,uploadHeaderName:'X-Token\r\nX-Injected'},'secret',/控制字符/],
  [{...generic,uploadHeaderName:'Content-Type'},'secret',/请求头名称/],
  [{...generic,uploadHeaderPrefix:'Bearer\n'},'secret',/控制字符/],
  [{...generic},'secret\r\nInjected',/控制字符/],
  [{...generic},'🔑',/HTTP/],
  [{uploadUrl:host.url},'🔑',/HTTP/],
  [{...generic,uploadHeaders:{Authorization:'insecure-secret'}},'secret',/不能保存认证/],
  [{...generic,uploadHeaders:{'Content-Type':'invalid'}},'secret',/请求头名称/],
  [{...generic,uploadHeaders:{Host:'other.example'}},'secret',/请求头名称/],
  [{...generic,uploadHeaders:{Cookie:'a=b'}},'secret',/请求头名称/],
  [{...generic,uploadHeaders:{'X-Meta':'a\nb'}},'secret',/控制字符/],
  [{...generic,uploadHeaders:{Accept:'a',accept:'b'}},'secret',/不能重复/],
  [{...generic,uploadHeaderName:'X-Upload-Id',uploadHeaders:{'x-upload-id':'not-allowed'}},'secret',/认证请求头冲突/],
  [{...generic,uploadFields:{api_key:'insecure-secret'}},'secret',/不能保存认证/],
  [{...generic,uploadFields:{file:'collision'}},'secret',/字段冲突/],
  [{...generic,uploadFields:{count:3}},'secret',/字符串/],
  [{...generic,uploadFields:[]},'secret',/键值对象/],
  [{...generic,uploadFields:JSON.parse('{"__proto__":"invalid"}')},'secret',/名称.*无效/],
  [{...generic,uploadFields:{constructor:'invalid'}},'secret',/名称.*无效/],
  [{...generic,uploadAuthMode:'form',uploadTokenField:'file'},'secret',/字段冲突/],
  [{...generic,fileField:'file"bad'},'secret',/字段.*无效/],
  [{...generic,urlField:'data..url'},'secret',/JSON 路径/],
  [{...generic,urlField:'constructor.url'},'secret',/JSON 路径/],
  [{...generic,urlField:'data.\nurl'},'secret',/控制字符/],
  [{...generic,uploadUrl:host.url+'?token=secret'},'secret',/凭据不能放在 URL/],
  [{...generic,uploadUrl:'https://user:secret@example.com/upload'},'secret',/不得含凭据/],
  [{...generic,uploadUrl:'http://upload.example/upload'},'secret',/HTTPS/],
  [{...generic,uploadUrl:host.url+'#fragment'},'secret',/片段/],
  [{...generic,imageHostProvider:'qiniu',publicBaseUrl:'http://127.0.0.1/images'},'secret',/HTTPS/],
  [{...generic,imageHostProvider:'qiniu',publicBaseUrl:'https://cdn.example/?query=x'},'secret',/HTTPS/],
  [{...generic,imageHostProvider:'qiniu',publicBaseUrl:'https://cdn.example/',qiniuKeyPrefix:'../escape'},'secret',/路径跳转/],
  [{...generic,imageHostProvider:'qiniu',publicBaseUrl:'https://cdn.example/',uploadFields:{key:'collision'}},'secret',/字段冲突/]
 ];
 for(const [config,token,pattern] of cases)await assert.rejects(upload(asset,config,token),pattern);
 assert.equal(host.received.length,0);
});

test('invalid Qiniu response keys cannot escape or inject a public URL',async t=>{
 let key;
 const host=await server(t,(_,res)=>json(res,{key}));
 const config={imageHostProvider:'qiniu',uploadUrl:host.url,publicBaseUrl:'https://cdn.example/root/'};
 for(key of [undefined,null,42,'','/absolute.png','../escape.png','a/./b.png','a//b.png','a/%2e%2e/b.png','a?query=1','a#fragment','a\\b.png','a\nb.png','\ud800','界'.repeat(400)]){
  await assert.rejects(upload(asset,config,'token'),/七牛/);
 }
});

test('generic response validation prevents invalid, credentialed, non-HTTPS and inherited URL fields',async t=>{
 let body;
 const host=await server(t,(_,res)=>{res.end(body);});
 const config={imageHostProvider:'generic',uploadUrl:host.url};
 for(const value of [null,{other:'missing'}, {url:42},{url:'http://external.example/a'},{url:'https://user:secret@cdn.example/a'},{url:'https://cdn.example/a\nsecret'}]){
  body=JSON.stringify(value);await assert.rejects(upload(asset,config,'token'));
 }
 body='secret-sentinel non-json';
 await assert.rejects(upload(asset,config,'token'),error=>{assert.match(error.message,/有效的 JSON/);assert.doesNotMatch(error.message,/secret-sentinel/);return true;});
 body=JSON.stringify({url:'http://127.0.0.1/local-test.png'});
 assert.equal(await upload(asset,config,'token'),'http://127.0.0.1/local-test.png');
});

for(const type of ['piper','generic','qiniu']){
 test(`${type} never follows upload redirects with credentials`,async t=>{
  const host=await server(t,(_,res)=>{res.writeHead(302,{Location:'/target'});res.end();});
  await assert.rejects(upload(asset,{imageHostProvider:type,uploadUrl:host.url,publicBaseUrl:'https://cdn.example/'},'secret'));
  assert.equal(host.received.length,1);assert.doesNotMatch(host.received[0].path,/target/);
 });
}

test('response streaming is bounded at 64 KiB and HTTP error bodies never expose credentials',async t=>{
 let status=200;
 const host=await server(t,(_,res)=>{res.statusCode=status;res.end(status===200?'x'.repeat(70000):'secret-sentinel');});
 const config={uploadUrl:host.url};
 await assert.rejects(upload(asset,config,'secret'),/响应过大/);
 for(status of [401,403,507])await assert.rejects(upload(asset,config,'secret'),error=>{assert.match(error.message,new RegExp(`HTTP ${status}`));assert.doesNotMatch(error.message,/secret-sentinel/);return true;});
});

test('cancellation before a request sends nothing; in-flight cancellation aborts the upload',async t=>{
 let requestStarted;
 const started=new Promise(resolve=>{requestStarted=resolve;});
 const host=await server(t,()=>{requestStarted();});
 const before=new AbortController();before.abort();
 await assert.rejects(upload(asset,{uploadUrl:host.url},'secret',before.signal),{name:'AbortError'});
 assert.equal(host.received.length,0);
 const during=new AbortController();const pending=upload(asset,{uploadUrl:host.url},'secret',during.signal);
 await started;during.abort();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(host.received.length,1);
});

test('unsupported or oversized assets are rejected before upload',async t=>{
 const host=await server(t,(_,res)=>json(res,{url:'https://cdn.example/a'}));
 await assert.rejects(upload({...asset,mime:'image/svg+xml'},{uploadUrl:host.url},'token'),/PNG/);
 await assert.rejects(upload({bytes:Buffer.alloc(20*1024*1024+1),mime:'image/png'},{uploadUrl:host.url},'token'),/20 MiB/);
 assert.equal(host.received.length,0);
});


test('signed URL credentials cannot be persisted as upload endpoint query settings',()=>{
 for(const query of ['X-Amz-Signature=private','sig=private','credential=private'])assert.throws(()=>credentialScope({imageHostProvider:'generic',uploadUrl:'https://upload.example/?'+query}),/凭据不能放在 URL/);
});
