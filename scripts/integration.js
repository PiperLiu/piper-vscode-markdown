// Disposable real-server test; no production or general clipboard state is touched.
const {spawn}=require('node:child_process');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const net=require('node:net');const assert=require('node:assert/strict');
const {render}=require('../src/render');const {upload}=require('../src/upload');
(async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'piper-e2e-'));
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const base=`http://127.0.0.1:${port}`,token=crypto.randomBytes(32).toString('hex');
 await fs.writeFile(path.join(dir,'config.json'),JSON.stringify({addr:`127.0.0.1:${port}`,database:path.join(dir,'test.db'),password:crypto.randomBytes(32).toString('hex'),session_days:1,public_images:{enabled:true,token,base_url:base,default_ttl:'3h',max_ttl:'24h',limit_mib:256}}),{mode:0o600});
 const proc=spawn(process.env.TODO_TEST_BINARY,['-config',path.join(dir,'config.json')],{stdio:['ignore','ignore','pipe']});proc.stderr.resume();
 try{
  let ready=false;for(let i=0;i<100;i++){try{await fetch(base);ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert.ok(ready,'test server started');
  const filename=path.resolve(__dirname,'../examples/demo.md');const urls=[];
  const output=await render(await fs.readFile(filename,'utf8'),{filename,resolveAsset:async asset=>{const u=await upload(asset,{uploadUrl:base+'/api/public-images',ttl:'3h'},token);urls.push(u);const response=await fetch(u);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(asset.bytes));return u;}});
  assert.equal(urls.length,3);assert.doesNotMatch(output.html,/data:image/);assert.equal((await fetch(base+'/api/state',{headers:{Authorization:`Bearer ${token}`}})).status,401);
  const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');const gifURL=await upload({bytes:gif,mime:'image/gif'},{uploadUrl:base+'/api/public-images',ttl:'3h'},token);assert.deepEqual(Buffer.from(await(await fetch(gifURL)).arrayBuffer()),gif);
  const del=await fetch(gifURL.replace('/public-images/','/api/public-images/'),{method:'DELETE',headers:{Authorization:`Bearer ${token}`,'X-Requested-With':'ThemeTodo'}});assert.equal(del.status,204);assert.equal((await fetch(gifURL)).status,404);
  const preview=await render(await fs.readFile(filename,'utf8'),{filename});await fs.writeFile(path.join(dir,'preview.html'),`<!doctype html><meta charset="utf-8"><body style="background:#eef1ef;padding:20px"><main style="max-width:680px;margin:auto;background:white;padding:24px">${preview.html}</main>`);
  console.log('PASS: real Go upload → public GET byte equality → rendering; GIF preserved; token isolation; deletion.');
 }finally{proc.kill('SIGTERM');await new Promise(r=>proc.once('exit',r));await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
