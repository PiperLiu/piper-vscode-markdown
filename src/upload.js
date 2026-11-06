'use strict';
const {safeURL}=require('./render');
async function upload(asset,config,token,signal){
 const endpoint=safeURL(config.uploadUrl);endpoint.searchParams.set('ttl',config.ttl||'24h');
 if(!token)throw new Error('先运行「Piper Markdown：设置图床上传 Token」');
 const form=new FormData();const ext={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'}[asset.mime];
 form.append(config.fileField||'file',new Blob([asset.bytes],{type:asset.mime}),`image.${ext}`);
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Requested-With':'ThemeTodo'},body:form,redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(120000),...(signal?[signal]:[])])});
 if(!response.ok){await response.body?.cancel();throw new Error(`图床上传失败（HTTP ${response.status}）${response.status===507?'：容量已满':response.status===401?'：请检查 token':''}`);}
 const reader=response.body?.getReader();if(!reader)throw new Error('图床返回空响应');
 const chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new Error('图床响应过大');}chunks.push(value);}}finally{reader.releaseLock();}
 const body=Buffer.concat(chunks).toString('utf8');
 let value=JSON.parse(body);for(const part of (config.urlField||'url').split('.'))value=value?.[part];
 if(typeof value!=='string')throw new Error('图床响应缺少图片 URL 字段');safeURL(value);return value;
}
module.exports={upload};
