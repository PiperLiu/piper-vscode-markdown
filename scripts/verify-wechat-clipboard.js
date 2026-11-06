// Verify synthetic clipboard evidence and public image responses; never uses upload credentials.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function dimensions(bytes,mime){
 if(mime==='image/png')return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),pages:1};
 assert.equal(mime,'image/gif','fixture expects PNG or GIF');
 let offset=13+(bytes[10]&128?3*2**((bytes[10]&7)+1):0),pages=0;
 const skipBlocks=()=>{while(offset<bytes.length){const size=bytes[offset++];if(!size)return;offset+=size;}throw new Error('incomplete GIF blocks');};
 while(offset<bytes.length){
  const type=bytes[offset++];if(type===0x3b)break;
  if(type===0x21){offset++;skipBlocks();continue;}
  assert.equal(type,0x2c,'valid GIF image descriptor');
  const packed=bytes[offset+8];offset+=9;if(packed&128)offset+=3*2**((packed&7)+1);
  offset++;skipBlocks();pages++;
 }
 return {width:bytes.readUInt16LE(6),height:bytes.readUInt16LE(8),pages};
}
const dir=process.argv[2];if(!dir||!path.isAbsolute(dir))throw new Error('absolute evidence path required');
(async()=>{
 const clipboard=JSON.parse(fs.readFileSync(path.join(dir,'clipboard.json'),'utf8'));
 const host=JSON.parse(fs.readFileSync(path.join(dir,'host-report.json'),'utf8'));
 assert.equal(host.status,'PASS');assert.ok(clipboard.types.includes('public.html'));assert.ok(clipboard.types.includes('public.utf8-plain-text'));
 for(const marker of ['PARITY_WECHAT_COPY','PARITY_WECHAT_END','PARITY_WECHAT_CODE']){assert.ok(clipboard.html.includes(marker));assert.ok(clipboard.text.includes(marker));}
 assert.ok(clipboard.html.includes('article-toc'),'real rendered table of contents');
 assert.ok(!clipboard.html.includes('@import')&&!clipboard.html.includes('[TOC]'),'TOC directives must not leak into output');
 const urls=[...clipboard.html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(urls.length,host.expectedAssets.length);assert.equal(new Set(urls).size,urls.length);
 const expected=new Map(host.expectedAssets.map(asset=>[asset.sha256,asset]));
 const results=[];
 for(const url of urls){
  assert.ok(url.startsWith('https://'),'public HTTPS assets required');
  const response=await fetch(url,{headers:{Origin:'https://mp.weixin.qq.com'},redirect:'error'});
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'*');
  const bytes=Buffer.from(await response.arrayBuffer()),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const original=expected.get(sha256);assert.ok(original,'public image bytes must equal rendered upload bytes');expected.delete(sha256);
  const info=dimensions(bytes,original.mime);
  if(original.mime==='image/gif')assert.ok(info.pages>=2,'GIF animation retains multiple frames');
  results.push({url,bytes:bytes.length,mime:response.headers.get('content-type'),sha256,width:info.width,height:info.height,pages:info.pages||1,publicWithoutCredentials:true,cors:'*',matchesUploadedBytes:true});
 }
 assert.equal(expected.size,0);
 const report={status:'PASS',types:clipboard.types,htmlBytes:Buffer.byteLength(clipboard.html),textCharacters:clipboard.text.length,images:results,manualWechatPasteRequired:true};
 fs.writeFileSync(path.join(dir,'clipboard-verification.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({status:report.status,types:report.types,htmlBytes:report.htmlBytes,textCharacters:report.textCharacters,imageCount:results.length,animatedGifFrames:results.find(x=>x.mime?.startsWith('image/gif'))?.pages}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
