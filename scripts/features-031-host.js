// Installed-package regression tests; only a loopback image-host mock is contacted.
// The existing clipboard is held entirely in memory by clipboard-guard.swift.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const runFile=promisify(execFile);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
exports.run=async()=>{
 const vscode=require('vscode');
 const root=process.env.PIPER_PARITY_WORKSPACE,evidence=process.env.PIPER031_EVIDENCE;
 assert.ok(root&&evidence&&path.isAbsolute(root)&&path.isAbsolute(evidence),'explicit temporary paths required');
 assert.notEqual(fs.realpathSync(root),fs.realpathSync(path.join(__dirname,'../examples/parity')));
 fs.mkdirSync(evidence,{recursive:true});
 const report={startedAt:new Date().toISOString(),checks:[]};
 const save=()=>fs.writeFileSync(path.join(evidence,'host-report.json'),JSON.stringify(report,null,2));
 const pass=(name,details={})=>{report.checks.push({name,status:'PASS',...details});save();};
 const checkpoint=async stage=>{
  if(!process.env.PIPER031_INSPECT_UI)return;
  fs.writeFileSync(path.join(evidence,'stage.json'),JSON.stringify({stage}));
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
   try{const ack=JSON.parse(fs.readFileSync(path.join(evidence,`${stage}.json`),'utf8'));assert.equal(ack.status,'PASS',ack.error);pass(`real UI ${stage}`,ack);return;}catch(error){if(error.code!=='ENOENT')throw error;}
   await delay(100);
  }
  throw new Error(`Timed out waiting for ${stage}`);
 };
 let guard,guardClosed,server;
 const requests=[],requestErrors=[];
 const syntheticToken=process.env.PIPER031_TEST_TOKEN;
 assert.ok(syntheticToken?.startsWith('piper-qa-'),'explicit synthetic loopback token required');
 try{
  const extension=vscode.extensions.getExtension('piperliu.piper-markdown-review');
  assert.ok(extension?.extensionPath.startsWith(process.env.PIPER_PARITY_EXPECT_ROOT));
  assert.equal(extension.packageJSON.version,'0.3.1');
  assert.equal(vscode.extensions.getExtension('shd101wyy.markdown-preview-enhanced'),undefined);
  await extension.activate();
  report.extension={path:extension.extensionPath,version:extension.packageJSON.version};
  await require('./parity-host').run();
  pass('existing enhanced preview, TOC, HTML and PDF commands');
  const config=vscode.workspace.getConfiguration('piperMarkdown');
  const update=(key,value)=>config.update(key,value,vscode.ConfigurationTarget.Global);
  assert.equal(config.inspect('wechatSkipLeadingH1').defaultValue,false);
  await update('wechatSkipLeadingH1',false);
  const uri=vscode.Uri.file(path.join(root,'cjk-title.md'));
  const doc=await vscode.workspace.openTextDocument(uri),original=doc.getText();
  let editor=await vscode.window.showTextDocument(doc,{preview:false});
  await vscode.commands.executeCommand('piperMarkdown.preview',uri);
  await checkpoint('enhanced-cjk');
  server=http.createServer(async(req,res)=>{
   try{
    assert.equal(req.method,'POST');assert.equal(new URL(req.url,'http://localhost').search,'');
    assert.equal(req.headers['x-upload-test'],'synthetic');
    assert.equal(req.headers['x-image-key'],'Test '+syntheticToken);
    assert.equal(req.headers.authorization,undefined);assert.equal(req.headers['x-requested-with'],undefined);
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const form=await new Request('http://localhost/upload',{method:'POST',headers:{'content-type':req.headers['content-type']},body:Buffer.concat(chunks)}).formData();
    assert.equal(form.get('album'),'acceptance');assert.equal(form.get('token'),null);
    const file=form.get('asset');assert.ok(file&&file.size>0);assert.equal(file.type,'image/png');
    requests.push({field:'asset',bytes:file.size,mime:file.type,album:form.get('album')});
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:{links:[{url:`https://images.example.com/acceptance/${requests.length}.png`}]}}));
   }catch(error){requestErrors.push(error.message);res.writeHead(500);res.end('Mock assertion failed');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  for(const [key,value]of Object.entries({imageHostProvider:'generic',uploadUrl:`http://127.0.0.1:${server.address().port}/upload`,uploadAuthMode:'header',uploadHeaderName:'X-Image-Key',uploadHeaderPrefix:'Test ',uploadHeaders:{'X-Upload-Test':'synthetic'},uploadFields:{album:'acceptance'},fileField:'asset',urlField:'data.links.0.url'}))await update(key,value);
  const settingToken=vscode.commands.executeCommand('piperMarkdown.setToken');
  await checkpoint('generic-token');await settingToken;
  pass('generic credential entered through real password UI and SecretStorage');
  await vscode.window.showTextDocument(doc,{preview:false});
  await vscode.commands.executeCommand('piperMarkdown.previewWechat');
  await checkpoint('wechat-default');
  assert.equal(requests.length,0,'previews must not upload');
  guard=spawn('swift',[path.join(__dirname,'clipboard-guard.swift')],{stdio:['pipe','pipe','pipe']});
  guardClosed=new Promise((resolve,reject)=>{guard.once('error',reject);guard.once('close',code=>code===0?resolve():reject(new Error(`Clipboard restore guard exited ${code}`)));});
  await new Promise((resolve,reject)=>{
   let output='';const timer=setTimeout(()=>reject(new Error('Clipboard guard did not start')),60000);
   guard.stdout.on('data',data=>{output+=data;if(output.includes('ready\n')){clearTimeout(timer);resolve();}});
   guard.once('error',reject);guard.once('exit',code=>{if(!output.includes('ready\n')){clearTimeout(timer);reject(new Error(`Clipboard guard failed ${code}`));}});
  });
  const read=async()=>JSON.parse((await runFile('swift',[path.join(__dirname,'read-general-clipboard.swift')],{maxBuffer:2*1024*1024})).stdout);
  const copy=async label=>{
   await vscode.commands.executeCommand('piperMarkdown.copy');
   const result=await read();
   assert.ok(result.html.includes('PARITY_031_BODY')||label==='selected'||label==='setext'||label==='h2');
   fs.writeFileSync(path.join(evidence,`${label}-clipboard.json`),JSON.stringify(result,null,2));return result;
  };
  const kept=await copy('default');
  assert.match(kept.html,/<h1[^>]*>PARITY_031_TITLE/);assert.ok(kept.text.includes('PARITY_031_TITLE'));
  assert.match(kept.html,/<strong[^>]*>合法的加粗。<\/strong>/);
  assert.match(kept.html,/<em[^>]*>强调。<\/em>/);
  assert.ok(kept.html.includes('foo**bar.**baz'));
  pass('default preserves H1; CJK punctuation emphasis and literal English');
  if(process.env.PIPER031_INSPECT_UI)await checkpoint('wechat-toggle');else await update('wechatSkipLeadingH1',true);
  assert.equal(vscode.workspace.getConfiguration('piperMarkdown').get('wechatSkipLeadingH1'),true);
  const skipped=await copy('skipped');
  assert.ok(!skipped.html.includes('PARITY_031_TITLE')&&!skipped.text.includes('PARITY_031_TITLE'));
  assert.ok(skipped.html.includes('PARITY_031_LATER_H1')&&skipped.text.includes('PARITY_031_END'));
  assert.equal(doc.getText(),original);
  assert.ok(requests.length>=4);assert.deepEqual(requestErrors,[]);
  pass('omit only leading H1 in HTML/plain text, retain later H1 and source',{mockRequests:requests.length});
  const htmlTarget=vscode.Uri.file(path.join(root,'cjk-title.html')),pdfTarget=vscode.Uri.file(path.join(root,'cjk-title.pdf'));
  await vscode.commands.executeCommand('piperMarkdown.exportHTML',uri,htmlTarget);
  await vscode.commands.executeCommand('piperMarkdown.exportPDF',uri,pdfTarget);
  const html=fs.readFileSync(htmlTarget.fsPath,'utf8');
  assert.match(html,/<h1[^>]*>PARITY_031_TITLE/);assert.match(html,/<strong[^>]*>合法的加粗。<\/strong>/);assert.match(html,/<em[^>]*>强调。<\/em>/);
  assert.equal(doc.getText(),original);pass('standard HTML/PDF preserve H1 and render CJK while WeChat omission is enabled');
  const caseDoc=async(name,text)=>{
   const file=vscode.Uri.file(path.join(root,name+'.md'));fs.writeFileSync(file.fsPath,text);
   const document=await vscode.workspace.openTextDocument(file);editor=await vscode.window.showTextDocument(document,{preview:false});
   await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');return document;
  };
  await caseDoc('setext','\uFEFF\n\nPARITY_SETEXT_TITLE\n===================\n\nPARITY_SETEXT_BODY\n');
  const setext=await copy('setext');assert.ok(!setext.html.includes('PARITY_SETEXT_TITLE')&&!setext.text.includes('PARITY_SETEXT_TITLE'));assert.ok(setext.html.includes('PARITY_SETEXT_BODY'));pass('leading blank lines/BOM and Setext H1');
  await caseDoc('h2','## PARITY_H2_START\n\nPARITY_H2_BODY\n\n# PARITY_H1_LATER\n');
  const h2=await copy('h2');assert.ok(h2.html.includes('PARITY_H2_START')&&h2.html.includes('PARITY_H1_LATER'));pass('H2 start and later H1 remain');
  const selectedDoc=await caseDoc('selected','Unselected preface\n\n# PARITY_SELECTED_TITLE\n\nPARITY_SELECTED_BODY\n\nOutside selection\n');
  const source=selectedDoc.getText(),start=source.indexOf('# PARITY_SELECTED_TITLE'),end=source.indexOf('Outside selection');
  editor.selection=new vscode.Selection(selectedDoc.positionAt(start),selectedDoc.positionAt(end));
  const selected=await copy('selected');assert.ok(!selected.html.includes('PARITY_SELECTED_TITLE')&&!selected.text.includes('PARITY_SELECTED_TITLE'));assert.ok(selected.html.includes('PARITY_SELECTED_BODY'));assert.ok(!selected.html.includes('Unselected preface')&&!selected.html.includes('Outside selection'));pass('selection uses its own leading H1');
  await caseDoc('title-only','# ONLY_A_TITLE\n');const before=await read(),beforeRequests=requests.length;
  await vscode.commands.executeCommand('piperMarkdown.copy');const after=await read();
  assert.equal(after.changeCount,before.changeCount);assert.equal(after.html,before.html);assert.equal(after.text,before.text);assert.equal(requests.length,beforeRequests);
  pass('title-only omission preserves clipboard and does not upload');
  report.mockRequests=requests;report.status='PASS';
 }catch(error){report.status='FAIL';report.error=String(error.stack||error);throw error;}
 finally{
  await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
  await vscode.commands.executeCommand('piperMarkdown.clearToken');
  if(server)await new Promise(resolve=>server.close(resolve));
  if(guard){guard.stdin.end('restore\n');await guardClosed;report.clipboardRestored=true;}
  report.finishedAt=new Date().toISOString();save();
 }
};
