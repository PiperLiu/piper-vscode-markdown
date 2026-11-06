// Real installed-extension WeChat acceptance in an isolated VS Code profile.
// Credentials are loaded only from an explicit private temporary file, never reported.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
exports.run = async () => {
  const vscode = require('vscode');
  const root = process.env.PIPER_WECHAT_WORKSPACE;
  const evidence = process.env.PIPER_WECHAT_EVIDENCE;
  const privateConfig = process.env.PIPER_WECHAT_PRIVATE_CONFIG;
  assert.ok([root,evidence,privateConfig].every(item => item && path.isAbsolute(item)), 'explicit isolated paths required');
  assert.equal(fs.statSync(privateConfig).mode & 0o077, 0, 'private config must not be group/world readable');
  const { uploadUrl, ttl } = JSON.parse(fs.readFileSync(privateConfig, 'utf8'));
  fs.mkdirSync(evidence, { recursive: true });
  const report = { startedAt:new Date().toISOString(), checks:[] };
  const save = () => fs.writeFileSync(path.join(evidence,'host-report.json'),JSON.stringify(report,null,2));
  let tokenSaved = false;
  try {
    const extension = vscode.extensions.getExtension('piperliu.piper-markdown-review');
    assert.ok(extension?.extensionPath.startsWith(process.env.PIPER_PARITY_EXPECT_ROOT), 'isolated installed package required');
    await extension.activate();
    const config = vscode.workspace.getConfiguration('piperMarkdown');
    await config.update('uploadUrl',uploadUrl,vscode.ConfigurationTarget.Global);
    await config.update('ttl',ttl,vscode.ConfigurationTarget.Global);
    const uri = vscode.Uri.file(path.join(root,'wechat.md'));
    const doc = await vscode.workspace.openTextDocument(uri);
    let editor=await vscode.window.showTextDocument(doc,{preview:false});
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
    if(process.env.PIPER_WECHAT_TEST_INSERTED_TOC==='1'){
      const offset=doc.getText().indexOf('[TOC]');assert.ok(offset>=0);
      const position=doc.positionAt(offset);
      await editor.edit(edit=>edit.delete(new vscode.Range(position,doc.positionAt(offset+5))));
      editor.selection=new vscode.Selection(position,position);
      await vscode.commands.executeCommand('piperMarkdown.insertTOC');
      const deadline=Date.now()+10000;
      while(!doc.getText().includes('<!-- @import "[TOC]"')&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
      assert.ok(doc.getText().includes('<!-- @import "[TOC]"'));await doc.save();
      await vscode.commands.executeCommand('piperMarkdown.preview',vscode.Uri.file(path.join(root,'review.md')));
      editor=await vscode.window.showTextDocument(doc,{preview:false});
      await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      report.checks.push({name:'TOC inserted by actual command; editor chosen over another preview',status:'PASS'});
    }
    report.extension = { id:extension.id,version:extension.packageJSON.version,path:extension.extensionPath };
    const expected=[];
    const { render } = require(path.join(extension.extensionPath,'src/render.js'));
    await render(doc.getText(),{filename:uri.fsPath,root,fontSize:16,resolveAsset:async asset=>{
      const index=expected.length, filename=`expected-${index}.${asset.mime==='image/gif'?'gif':'png'}`;
      fs.writeFileSync(path.join(evidence,filename),asset.bytes);
      expected.push({file:filename,mime:asset.mime,bytes:asset.bytes.length,sha256:crypto.createHash('sha256').update(asset.bytes).digest('hex')});
      return `https://example.com/parity/${index}`;
    }});
    report.expectedAssets=expected;save();
    await vscode.env.clipboard.writeText('PIPER_PARITY_CLIPBOARD_SENTINEL');
    fs.writeFileSync(path.join(evidence,'stage.json'),JSON.stringify({stage:'token-input'}));
    await vscode.commands.executeCommand('piperMarkdown.setToken');
    tokenSaved=true;
    assert.equal(JSON.parse(fs.readFileSync(path.join(evidence,'token-ui.json'),'utf8')).status,'PASS');
    report.checks.push({name:'real password UI and SecretStorage command',status:'PASS'});save();
    await vscode.commands.executeCommand('piperMarkdown.copy');
    const text=await vscode.env.clipboard.readText();
    assert.ok(text.includes('PARITY_WECHAT_COPY')&&text.includes('PARITY_WECHAT_END'),'real system clipboard contains the complete synthetic article');
    report.checks.push({name:'production upload and system clipboard command',status:'PASS'});
    report.status='PASS';
  } catch(error) {
    report.status='FAIL';report.error=String(error.stack||error);throw error;
  } finally {
    if(tokenSaved) await vscode.commands.executeCommand('piperMarkdown.clearToken');
    report.finishedAt=new Date().toISOString();save();
  }
};
