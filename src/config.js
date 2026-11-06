'use strict';
const defaults={uploadUrl:'',ttl:'24h',fileField:'file',urlField:'url',fontSize:16,previewWidth:760,scrollSync:true};
function readConfig(workspace,uri){
 const current=workspace.getConfiguration('piperMarkdown',uri),legacy=workspace.getConfiguration('piperWechat',uri);
 const explicit=(c,k)=>{const i=c.inspect(k);return i&&[i.workspaceFolderValue,i.workspaceValue,i.globalValue].find(v=>v!==undefined);};
 return Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,explicit(current,k)??explicit(legacy,k)??v]));
}
module.exports={readConfig};
