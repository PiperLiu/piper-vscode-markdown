'use strict';
const vscode=require('vscode');
const path=require('node:path');
const crypto=require('node:crypto');
const {render,safeURL}=require('./render');
const {upload,needsCredential,credentialScope}=require('./upload');
const {prepareWechatMarkdown}=require('./wechat-markdown');
const {writeClipboard}=require('./clipboard');
const {readConfig}=require('./config');
const {assertSeparateDestination}=require('./export-path');
const {previewHTML,exportHTML}=require('./preview');
const {inspectWechatCompatibility,compatibilityMessage,assertWechatCompatible}=require('./wechat-preflight');
function activate(context,integrations={}){
 const previews=new Map();let copying=false;
 const cfg=uri=>readConfig(vscode.workspace,uri);
 const key=c=>'upload:'+crypto.createHash('sha256').update(credentialScope(c)).digest('hex');
 const report=e=>vscode.window.showErrorMessage(e.name==='AbortError'?'已取消，剪贴板未修改；已上传图片的保留与清理由图床设置决定。':e.message);
 const guarded=fn=>async(...args)=>{try{return await fn(...args);}catch(e){report(e);}};
 function check(doc){if(!vscode.workspace.isTrusted)throw new Error('请先信任此工作区');if(!doc||doc.languageId!=='markdown'||doc.uri.scheme!=='file')throw new Error('请先打开本地 Markdown 文件');return doc;}
 async function active(){
  const ownPreview=[...previews.values()].find(state=>state.panel.active);
  return check(ownPreview?.doc||await integrations.resolveDocument?.()||vscode.window.activeTextEditor?.document);
 }
 const root=doc=>vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath||path.dirname(doc.uri.fsPath);
 const options=doc=>({filename:doc.uri.fsPath,root:root(doc),fontSize:cfg(doc.uri).fontSize});
 async function copy(doc,selection){
  doc=doc||await active();check(doc);if(copying)throw new Error('正在准备另一份内容，请完成或取消后重试');
  if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('此安装包的富文本复制支持 macOS Apple Silicon');
  copying=true;for(const p of previews.values())p.panel.webview.postMessage({type:'busy',value:true});
  try{
   const c=cfg(doc.uri),prepared=prepareWechatMarkdown(selection&&!selection.isEmpty?doc.getText(selection):doc.getText(),c.wechatSkipLeadingH1),markdown=prepared.markdown;
   if(prepared.omittedTitle&&!markdown.trim())throw new Error('忽略标题后没有可复制的正文；剪贴板未修改。');
   assertWechatCompatible(markdown);
   const token=c.uploadUrl&&needsCredential(c)?await context.secrets.get(key(c)):undefined;
   const result=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'准备公众号内容',cancellable:true},async(progress,cancellation)=>{
    const controller=new AbortController(),sub=cancellation.onCancellationRequested(()=>controller.abort());if(cancellation.isCancellationRequested)controller.abort();let count=0;
    try{const output=await render(markdown,{...options(doc),signal:controller.signal,resolveAsset:async asset=>{
     if(!c.uploadUrl)throw new Error('内容包含本地图片或公式，请先设置 piperMarkdown.uploadUrl 和图床 Token');
     progress.report({message:`上传图片 / 公式 ${++count}`});return upload(asset,c,token,controller.signal);
    }});controller.signal.throwIfAborted();return output;}finally{sub.dispose();}
   });
   await writeClipboard(context.asAbsolutePath('bin/clipboard'),result);
   const retention=(!c.imageHostProvider||c.imageHostProvider==='piper')?`请在 ${c.ttl} 内粘贴、保存并重新打开微信草稿检查图片。`:'请保存并重新打开微信草稿检查图片；存储期限由图床设置决定。';
   vscode.window.showInformationMessage(`已复制${selection&&!selection.isEmpty?'选区':'全文'}。${prepared.omittedTitle?'已忽略开头的一级标题。':''}${result.uniqueAssets} 张图片/公式已上传；${retention}`);
  }finally{copying=false;for(const p of previews.values())p.panel.webview.postMessage({type:'busy',value:false});}
 }
 async function enhanced(doc){
  check(doc);
  if(!integrations.openEnhanced)throw new Error('增强预览尚未初始化，请重新载入窗口');
  return integrations.openEnhanced(doc);
 }
 async function exportDocument(doc){
  doc=doc||await active();check(doc);
  const prepared=prepareWechatMarkdown(doc.getText(),cfg(doc.uri).wechatSkipLeadingH1),markdown=prepared.markdown;if(prepared.omittedTitle&&!markdown.trim())throw new Error('忽略标题后没有可导出的正文。');assertWechatCompatible(markdown);
  const result=await render(markdown,options(doc));
  const uri=await vscode.window.showSaveDialog({defaultUri:vscode.Uri.file(doc.uri.fsPath.replace(/\.[^.]+$/, '')+'.wechat.html'),filters:{HTML:['html']},saveLabel:'导出公众号 HTML'});
  if(uri){if(uri.scheme!=='file')throw new Error('Choose a local export destination.');await assertSeparateDestination(doc.uri.fsPath,uri.fsPath);await vscode.workspace.fs.writeFile(uri,Buffer.from(exportHTML(result,path.basename(doc.uri.fsPath))));}
 }
 async function reveal(doc,line,focus){
  if(!Number.isSafeInteger(line)||line<0||line>=doc.lineCount)return;
  const editor=vscode.window.visibleTextEditors.find(e=>e.document===doc)||(focus?await vscode.window.showTextDocument(doc,{viewColumn:vscode.ViewColumn.One,preserveFocus:!focus}):null);
  if(!editor)return;const position=new vscode.Position(line,0);editor.revealRange(new vscode.Range(position,position),vscode.TextEditorRevealType.AtTop);
  if(focus){editor.selection=new vscode.Selection(position,position);await vscode.window.showTextDocument(doc,{viewColumn:editor.viewColumn,preserveFocus:false});}
 }
 async function preview(doc){
  doc=doc||await active();check(doc);const id=doc.uri.toString();if(previews.has(id)){const existing=previews.get(id);existing.doc=doc;existing.schedule();existing.panel.reveal(vscode.ViewColumn.Beside);return;}
  const panel=vscode.window.createWebviewPanel('piperMarkdown.wechatReview',`公众号 · ${path.basename(doc.uri.fsPath)}`,vscode.ViewColumn.Beside,{enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')],retainContextWhenHidden:true});
  const state={panel,doc,timer:undefined,controller:undefined,generation:0,ignoreScrollUntil:0,disposed:false};previews.set(id,state);
  async function refresh(){
   const doc=state.doc;
   const generation=++state.generation;state.controller?.abort();state.controller=new AbortController();
   try{const c=cfg(doc.uri),prepared=prepareWechatMarkdown(doc.getText(),c.wechatSkipLeadingH1),result=await render(prepared.markdown,{...options(doc),preview:true,signal:state.controller.signal});if(state.disposed||generation!==state.generation||state.controller.signal.aborted)return;
    await panel.webview.postMessage({type:'content',html:result.html,headings:result.headings,characters:result.characters,filename:path.basename(doc.uri.fsPath),width:c.previewWidth,scrollSync:c.scrollSync,skipLeadingH1:c.wechatSkipLeadingH1,omittedTitle:prepared.omittedTitle,compatibility:compatibilityMessage(inspectWechatCompatibility(prepared.markdown))});
   }catch(e){if(!state.disposed&&generation===state.generation&&e.name!=='AbortError')panel.webview.postMessage({type:'error',message:e.message});}
  }
  state.schedule=()=>{clearTimeout(state.timer);state.controller?.abort();state.timer=setTimeout(refresh,220);};
  panel.webview.onDidReceiveMessage(guarded(async m=>{
   if(!m||typeof m.type!=='string')return;
   const doc=state.doc;
   switch(m.type){
    case 'ready':return refresh();
    case 'copy':return copy(doc);
    case 'skipTitle':{if(typeof m.value!=='boolean')return;const configuration=vscode.workspace.getConfiguration('piperMarkdown',doc.uri),current=configuration.inspect('wechatSkipLeadingH1');const target=current?.workspaceFolderValue!==undefined?vscode.ConfigurationTarget.WorkspaceFolder:current?.workspaceValue!==undefined?vscode.ConfigurationTarget.Workspace:vscode.ConfigurationTarget.Global;try{await configuration.update('wechatSkipLeadingH1',m.value,target);}finally{state.schedule();}return;}
    case 'source':return vscode.window.showTextDocument(doc,{viewColumn:vscode.ViewColumn.One});
    case 'export':return exportDocument(doc);
    case 'mpe':return enhanced(doc);
    case 'settings':return vscode.commands.executeCommand('workbench.action.openSettings','@ext:piperliu.piper-markdown-review');
    case 'reveal':state.ignoreScrollUntil=Date.now()+600;return reveal(doc,m.line,true);
    case 'scroll':if(cfg(doc.uri).scrollSync){state.ignoreScrollUntil=Date.now()+600;return reveal(doc,m.line,false);}break;
    case 'link':if(typeof m.href==='string'&&/^https?:\/\//i.test(m.href)){const u=safeURL(m.href);await vscode.env.openExternal(vscode.Uri.parse(u.href));}break;
   }
  }),null,context.subscriptions);
  panel.onDidDispose(()=>{state.disposed=true;clearTimeout(state.timer);state.controller?.abort();previews.delete(id);},null,context.subscriptions);
  panel.webview.html=previewHTML(panel.webview,context);context.subscriptions.push(panel);
 }
 context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e=>{const s=previews.get(e.document.uri.toString());if(s){s.doc=e.document;s.schedule();}}));
 context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc=>{const s=previews.get(doc.uri.toString());if(s){s.doc=doc;s.schedule();}}));
 context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e=>{if(e.affectsConfiguration('piperMarkdown')||e.affectsConfiguration('piperWechat'))for(const s of previews.values())s.schedule();}));
 context.subscriptions.push(vscode.window.onDidChangeTextEditorVisibleRanges(e=>{const s=previews.get(e.textEditor.document.uri.toString());if(s&&Date.now()>s.ignoreScrollUntil&&cfg(s.doc.uri).scrollSync&&e.visibleRanges.length)s.panel.webview.postMessage({type:'scroll',line:e.visibleRanges[0].start.line});}));
 const register=(name,fn)=>context.subscriptions.push(vscode.commands.registerCommand(name,guarded(fn)));
 const actions={
  preview:()=>preview(),
  copy:async()=>{const doc=await active();const editor=vscode.window.activeTextEditor;return copy(doc,editor?.document===doc?editor.selection:undefined);},
  exportHTML:()=>exportDocument(),
  setToken:async()=>{const c=cfg();if(!c.uploadUrl)throw new Error('先在设置中填写 piperMarkdown.uploadUrl');if(!needsCredential(c)){vscode.window.showInformationMessage('当前图床无需上传凭据。');return;}const secretKey=key(c);const token=await vscode.window.showInputBox({title:`图床上传凭据 / Upload credential · ${safeURL(c.uploadUrl).host}`,password:true,ignoreFocusOut:true,prompt:'保存在 VS Code SecretStorage，不写入 settings.json'});if(token){await context.secrets.store(secretKey,token);vscode.window.showInformationMessage('图床 Token 已保存');}},
  clearToken:async()=>{const c=cfg();if(!c.uploadUrl)throw new Error('先配置当前图床地址');await context.secrets.delete(key(c));vscode.window.showInformationMessage('当前图床 Token 已删除');}
 };
 for(const name of ['copy','setToken','clearToken'])register('piperMarkdown.'+name,actions[name]);
 register('piperMarkdown.previewWechat',actions.preview);
 register('piperMarkdown.exportWechatHTML',actions.exportHTML);
 for(const name of ['preview','copy','setToken','clearToken'])register('piperWechat.'+name,actions[name]);
 return {copy,preview,exportHTML:exportDocument};
}

module.exports={activate};
