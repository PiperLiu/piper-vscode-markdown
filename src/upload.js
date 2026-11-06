'use strict';
const {randomUUID}=require('node:crypto');
const {requestWithRateLimitRetry,withPiperUploadSlot}=require('./upload-policy');
const {safeURL}=require('./render');

const EXTENSIONS={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp'};
const CONTROL=/[\x00-\x1f\x7f]/;
const SECRET_NAME=/auth|token|secret|password|credential|signature|(?:^|[-_])sig(?:$|[-_])|api[-_]?key|access[-_]?key/i;
const UNSAFE_PROPERTIES=new Set(['__proto__','prototype','constructor']);
const UNSAFE_HEADERS=new Set(['host','content-type','content-length','connection','cookie','set-cookie','transfer-encoding','upgrade','trailer','te','origin','referer','proxy-authorization','proxy-connection']);

function text(value,fallback,label,max=256){
 const result=value===undefined?fallback:value;
 if(typeof result!=='string'||result.length>max||CONTROL.test(result))throw new Error(`${label}: use text without control characters (max ${max}). / 必须是不含控制字符的字符串（最多 ${max} 字符）`);
 return result;
}

function provider(config){
 const value=config.imageHostProvider===undefined?'piper':config.imageHostProvider;
 if(!['piper','generic','qiniu'].includes(value))throw new Error('Unsupported image host provider. / 不支持的图床类型');
 return value;
}

function endpoint(config){
 const url=safeURL(text(config.uploadUrl,'','图床上传地址',8192));
 if(url.hash)throw new Error('Upload endpoint cannot contain a URL fragment. / 图床上传地址不能包含片段');
 for(const name of url.searchParams.keys())if(SECRET_NAME.test(name))throw new Error('Do not put credentials in URLs. Use Publish → Image host → Set upload credential. / 上传凭据不能放在 URL 中，请使用“发布 → 图床设置 → 设置上传凭据”');
 return url;
}

function headerName(value){
 const name=text(value,'Authorization','上传认证请求头名称',128);
 if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)||UNSAFE_HEADERS.has(name.toLowerCase())||/^(sec-|proxy-)/i.test(name))throw new Error('Invalid or restricted upload header name. / 上传请求头名称无效或不允许配置');
 return name;
}

function formName(value,fallback,label){
 const name=text(value,fallback,label,128);
 if(!name||/["\\]/.test(name)||UNSAFE_PROPERTIES.has(name))throw new Error(`Invalid ${label} / ${label} 无效`);
 return name;
}

function auth(config){
 const mode=config.uploadAuthMode===undefined?'header':config.uploadAuthMode;
 if(mode==='header')return {mode,name:headerName(config.uploadHeaderName),prefix:text(config.uploadHeaderPrefix,'Bearer ','上传认证前缀',128)};
 if(mode==='form')return {mode,field:formName(config.uploadTokenField,'token','上传认证表单字段')};
 if(mode==='none')return {mode};
 throw new Error('Upload authentication must be header, form or none. / 上传认证方式必须是 header、form 或 none');
}

function publicBase(config){
 const url=safeURL(text(config.publicBaseUrl,'','七牛公开访问域名',8192));
 if(url.protocol!=='https:'||url.search||url.hash)throw new Error('Qiniu public base URL must use HTTPS without a query or fragment. / 七牛公开访问地址必须是无查询参数和片段的 HTTPS 地址');
 return url;
}

function needsCredential(config){return provider(config)!=='generic'||auth(config).mode!=='none';}

// Preserve the exact Piper scope used by released versions. New providers isolate
// credentials by endpoint and destination/auth placement without storing secrets here.
function credentialScope(config){
 const type=provider(config),url=endpoint(config).href;
 if(type==='piper')return url;
 if(type==='qiniu')return JSON.stringify({provider:type,endpoint:url,publicBaseUrl:publicBase(config).href});
 const placement=auth(config);
 if(placement.name)placement.name=placement.name.toLowerCase();
 return JSON.stringify({provider:type,endpoint:url,auth:placement});
}

function staticValues(value,label){
 if(value===undefined)return [];
 if(value===null||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error(`${label}: expected an object of string values. / 必须是字符串键值对象`);
 const entries=Object.entries(value);
 if(entries.length>32)throw new Error(`${label}: at most 32 entries. / 最多允许 32 项`);
 let bytes=0;
 for(const [name,raw] of entries){
  formName(name,'',`${label}名称`);
  text(raw,'',`${label}值`,8192);
  if(SECRET_NAME.test(name))throw new Error(`${label}: credentials belong in Publish → Image host → Set upload credential. / 不能保存认证凭据，请在图床设置中设置上传凭据`);
  bytes+=Buffer.byteLength(name)+Buffer.byteLength(raw);
 }
 if(bytes>32768)throw new Error(`${label}: total size must not exceed 32 KiB. / 总长度不能超过 32 KiB`);
 return entries;
}

function jsonPath(config){
 const parts=text(config.urlField,'url','图片 URL 响应字段',256).split('.');
 if(parts.length>16||parts.some(part=>!part||UNSAFE_PROPERTIES.has(part)))throw new Error('Image URL response field must be a valid dot-separated JSON path. / 图片 URL 响应字段必须是有效的点分隔 JSON 路径');
 return parts;
}

function qiniuKey(value,isPrefix=false){
 let key=text(value,isPrefix?'':undefined,isPrefix?'七牛对象名称前缀':'七牛响应对象名称',1024);
 if(isPrefix)key=key.replace(/\/+$/,'');
 if((!isPrefix&&!key)||Buffer.byteLength(key)>1024||/[\\?#]/.test(key)||key.startsWith('/'))throw new Error('Qiniu object key must be a relative path without a query or fragment. / 七牛对象名称必须是有效的相对路径，不能含查询参数或片段');
 const segments=key?key.split('/'):[];
 if(segments.some(part=>!part||/^(?:\.|%2e){1,2}$/i.test(part)))throw new Error('Qiniu object key cannot contain empty or traversal segments. / 七牛对象名称不能包含空目录或路径跳转');
 try{return segments.map(part=>encodeURIComponent(part));}catch{throw new Error('Qiniu object key is not valid UTF-8. / 七牛对象名称不是有效的 UTF-8 文本');}
}

async function responseJSON(response){
 const reader=response.body?.getReader();
 if(!reader)throw new Error('Image host returned an empty response. / 图床返回空响应');
 const chunks=[];let size=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>65536){await reader.cancel();throw new Error('Image host response is too large. / 图床响应过大');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch{throw new Error('Image host response is not valid JSON. / 图床响应不是有效的 JSON');}
}

function httpHeaderValue(value){
 if(/[^\x20-\xff]/.test(value)||CONTROL.test(value))throw new Error('Upload credential or header contains invalid HTTP characters. / 上传认证或请求头值包含不能通过 HTTP 请求头发送的字符');
 return value;
}

async function upload(asset,config,token,signal,{onProgress}={}){
 signal?.throwIfAborted();
 const type=provider(config),url=endpoint(config),ext=EXTENSIONS[asset.mime];
 if(!ext||!asset.bytes||asset.bytes.byteLength>20*1024*1024)throw new Error('Use PNG, JPEG, GIF or WebP images up to 20 MiB. / 仅支持不超过 20 MiB 的 PNG、JPEG、GIF 或 WebP 图片');
 const requiresToken=needsCredential(config);
 if(requiresToken&&!token){const error=new Error('Set an upload credential using Piper Markdown: Set Image Upload Token. / 请设置图床上传凭据。');error.code='MISSING_UPLOAD_TOKEN';throw error;}
 if(requiresToken)text(token,'','上传 Token',16384);
 const form=new FormData(),headers=new Headers();
 const fileField=type==='qiniu'?'file':formName(config.fileField,'file','上传文件表单字段');
 const responsePath=type==='qiniu'?null:jsonPath(config);
 const placement=type==='generic'?auth(config):null;
 let base;

 if(type==='piper'){
  url.searchParams.set('ttl',text(config.ttl,'24h','图片有效期',64));
  headers.set('Authorization',httpHeaderValue(`Bearer ${token}`));
  headers.set('X-Requested-With','ThemeTodo');
 }else{
  for(const [name,value] of staticValues(config.uploadHeaders,'自定义请求头')){
   const key=headerName(name);
   if(headers.has(key))throw new Error('Extra headers cannot duplicate names (case insensitive). / 自定义请求头不能重复（名称不区分大小写）');
   headers.set(key,httpHeaderValue(value));
  }
  for(const [name,value] of staticValues(config.uploadFields,'自定义表单字段')){
   if(name===fileField||name===placement?.field||(type==='qiniu'&&['key','token'].includes(name)))throw new Error('Extra form field conflicts with file or credential field. / 自定义表单字段与文件或认证字段冲突');
   form.append(name,value);
  }
  if(type==='generic'){
   if(placement.mode==='header'){
    if(headers.has(placement.name))throw new Error('Extra header conflicts with credential header. / 自定义请求头与认证请求头冲突');
    headers.set(placement.name,httpHeaderValue(placement.prefix+token));
   }else if(placement.mode==='form'){
    if(placement.field===fileField)throw new Error('Credential form field conflicts with file field. / 认证表单字段与文件字段冲突');
    form.append(placement.field,token);
   }
  }else{
   base=publicBase(config);
   const prefix=qiniuKey(config.qiniuKeyPrefix,true).map(decodeURIComponent).join('/');
   const key=`${prefix?prefix+'/':''}${randomUUID()}.${ext}`;
   qiniuKey(key);
   form.append('key',key);
   form.append('token',token);
  }
 }
 form.append(fileField,new Blob([asset.bytes],{type:asset.mime}),`image.${ext}`);
 // One deadline covers queueing, every retry, and response parsing. FormData
 // and Qiniu's object key are created once and reused only after explicit 429.
 const uploadSignal=AbortSignal.any([AbortSignal.timeout(120000),...(signal?[signal]:[])]);
 const send=async()=>{
  const response=await requestWithRateLimitRetry(()=>fetch(url,{method:'POST',headers,body:form,redirect:'error',signal:uploadSignal}),uploadSignal,onProgress);
  if(!response.ok){
   await response.body?.cancel();
   const hint=[401,403].includes(response.status)?' Check the upload credential and permissions in Publish → Image host. / 请在“发布 → 图床设置”检查上传凭据及权限。':response.status===507?' Image storage is full. / 图床容量已满。':' Check the image host service and try again. / 请检查图床服务后重试。';
   const error=new Error(`Image upload failed (HTTP ${response.status}). / 图床上传失败（HTTP ${response.status}）。${hint}`);
   error.status=response.status;throw error;
  }
  return responseJSON(response);
 };
 let value=await(type==='piper'?withPiperUploadSlot(url.origin,uploadSignal,send,onProgress):send());
 uploadSignal.throwIfAborted();
 if(type==='qiniu'){
  const key=value&&Object.hasOwn(value,'key')?value.key:undefined;
  const encoded=qiniuKey(key).join('/');
  base.pathname=base.pathname.replace(/\/?$/,'/')+encoded;
  return base.href;
 }
 for(const part of responsePath)value=value&&typeof value==='object'&&Object.hasOwn(value,part)?value[part]:undefined;
 if(typeof value!=='string')throw new Error('Image host response is missing the image URL field. / 图床响应缺少图片 URL 字段');
 text(value,'','图床返回的图片 URL',8192);
 safeURL(value);
 return value;
}

function validateConfig(config){
 const type=provider(config);endpoint(config);credentialScope(config);
 if(type==='piper'){if(!['3h','24h'].includes(config.ttl||'24h'))throw new Error('Piper lifetime must be 3h or 24h');}
 else {
  const placement=type==='generic'?auth(config):null;
  const fileField=type==='qiniu'?'file':formName(config.fileField,'file','File field');
  const headerNames=new Set();
  for(const [name,value]of staticValues(config.uploadHeaders,'Extra headers')){const header=headerName(name).toLowerCase();if(headerNames.has(header)||header===placement?.name?.toLowerCase())throw new Error('Duplicate or credential header');headerNames.add(header);httpHeaderValue(value);}
  for(const [name]of staticValues(config.uploadFields,'Extra fields'))if(name===fileField||name===placement?.field||(type==='qiniu'&&['key','token'].includes(name)))throw new Error('Extra field conflicts with file or credential field');
  if(type==='qiniu'){publicBase(config);qiniuKey(config.qiniuKeyPrefix,true);}
  else {jsonPath(config);if(placement.mode==='form'&&placement.field===fileField)throw new Error('File and credential fields must differ');}
 }
 return true;
}

module.exports={upload,needsCredential,credentialScope,validateConfig};
