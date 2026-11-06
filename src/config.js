'use strict';
const defaults={uploadUrl:'',ttl:'24h',fileField:'file',urlField:'url',fontSize:16,previewWidth:760,scrollSync:true,wechatSkipLeadingH1:false,wechatIncludeTOC:false,wechatPreset:'classic',wechatLineHeight:1.85,wechatAccentColor:'#16856e',wechatHeadingStyle:'border',imageHostProvider:'piper',uploadAuthMode:'header',uploadHeaderName:'Authorization',uploadHeaderPrefix:'Bearer ',uploadTokenField:'token',uploadHeaders:{},uploadFields:{},publicBaseUrl:'',qiniuKeyPrefix:''};
// A repository cannot redirect uploads or change how a stored credential is sent.
const connectionKeys=new Set(['uploadUrl','fileField','urlField','imageHostProvider','uploadAuthMode','uploadHeaderName','uploadHeaderPrefix','uploadTokenField','uploadHeaders','uploadFields','publicBaseUrl','qiniuKeyPrefix']);
function readConfig(workspace,uri){
 const current=workspace.getConfiguration('piperMarkdown',uri),legacy=workspace.getConfiguration('piperWechat',uri);
 const explicit=(c,k)=>{const i=c.inspect(k);return i&&(connectionKeys.has(k)?i.globalValue:[i.workspaceFolderValue,i.workspaceValue,i.globalValue].find(v=>v!==undefined));};
 return Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,explicit(current,k)??explicit(legacy,k)??v]));
}
module.exports={readConfig};
