'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const MarkdownIt = require('markdown-it');
// The pinned ESM plugin supports Node 18; loading once keeps preview/copy identical.
const cjkFriendlyPlugin = import('markdown-it-cjk-friendly').then(module => module.default);
const {parseTOCMarker}=require('./wechat-preflight');
const hljs = require('highlight.js');
const juice = require('juice');
const { Resvg } = require('@resvg/resvg-js');
const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
require('mathjax-full/js/input/tex/ams/AmsConfiguration.js');
require('mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js');
const { SVG } = require('mathjax-full/js/output/svg.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const adaptor = liteAdaptor(); RegisterHTMLHandler(adaptor);
const math = mathjax.document('', { InputJax: new TeX({ packages: ['base', 'ams', 'newcommand'], maxBuffer: 20000 }), OutputJax: new SVG({ fontCache: 'none' }) });
const MAX = 20 * 1024 * 1024;
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeURL(raw) {
 const u=new URL(raw);
 if (u.username || u.password || !((u.protocol==='https:') || (u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)))) throw new Error('URL 必须是 HTTPS（本地回环测试可用 HTTP），且不得含凭据');
 return u;
}
const rasterCache=new Map();let rasterCacheBytes=0;
function rasterSVG(svg, width, loadSystemFonts=true) {
 // Prevent resvg from following local references in untrusted SVGs. Embedded raster data only.
 if (/<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|(?:href|xlink:href)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|webp);base64,)/i.test(svg) || /url\(\s*["']?\s*(?!#)/i.test(svg)) throw new Error('SVG 包含外部资源、脚本或不支持的嵌入内容');
 const cacheKey=crypto.createHash('sha256').update(svg).update(String(width)+':'+loadSystemFonts).digest('hex');
 const cached=rasterCache.get(cacheKey);if(cached){rasterCache.delete(cacheKey);rasterCache.set(cacheKey,cached);return cached;}
 const renderer=new Resvg(svg,{fitTo:{mode:'width',value:width},font:{loadSystemFonts,defaultFontFamily:'PingFang SC'}});
 if (renderer.width * renderer.height > 20_000_000 || renderer.height > 20000) throw new Error('SVG 输出尺寸过大');
 const png=renderer.render().asPng();
 // Cache bytes only, never temporary URLs or credentials. Cap total retained raster data.
 if(png.length<=32*1024*1024){while(rasterCache.size&&(rasterCacheBytes+png.length>32*1024*1024||rasterCache.size>=128)){const first=rasterCache.keys().next().value;rasterCacheBytes-=rasterCache.get(first).length;rasterCache.delete(first);}rasterCache.set(cacheKey,png);rasterCacheBytes+=png.length;}
 return png;
}
function mathImage(tex, display, fontSize) {
 const node=math.convert(tex,{display,em:fontSize,ex:fontSize/2,containerWidth:680});
 let svg=adaptor.outerHTML(adaptor.firstChild(node));
 if (svg.includes('data-mjx-error')) throw new Error('数学公式解析失败：'+tex.slice(0,80));
 const widthEx=Number(svg.match(/\bwidth="([\d.]+)ex"/)?.[1]);
 const heightEx=Number(svg.match(/\bheight="([\d.]+)ex"/)?.[1]);
 if (!widthEx || !heightEx) throw new Error('无法确定公式尺寸');
 const width=Math.max(1,widthEx*fontSize/2),height=Math.max(1,heightEx*fontSize/2);
 const depth=Number(svg.match(/vertical-align:\s*(-?[\d.]+)ex/)?.[1]||0)*fontSize/2;
 svg=svg.replace(/currentColor/g,'#242424').replace(/width="[^"]+"/,`width="${width}"`).replace(/height="[^"]+"/,`height="${height}"`);
 return {bytes:rasterSVG(svg,Math.min(4096,Math.ceil(width*3)),false),mime:'image/png',width,height,depth};
}
function mathPlugin(md) {
 md.inline.ruler.before('escape','piper_math',(state,silent)=>{
  const start=state.pos;if(state.src[start]!=='$' || state.src[start+1]==='$' || /\s/.test(state.src[start+1]||' ')) return false;
  let end=start+1;while((end=state.src.indexOf('$',end))>=0){if(state.src[end-1]!=='\\')break;end++;}
  if(end<0 || /\s/.test(state.src[end-1]) || /\d/.test(state.src[end+1]||''))return false;
  if(!silent){const t=state.push('piper_math','',0);t.content=state.src.slice(start+1,end);}
  state.pos=end+1;return true;
 });
 md.block.ruler.before('fence','piper_math_block',(state,start,end,silent)=>{
  const line=state.src.slice(state.bMarks[start]+state.tShift[start],state.eMarks[start]);if(!line.startsWith('$$'))return false;
  const from=state.bMarks[start]+state.tShift[start]+2;const close=state.src.indexOf('$$',from);if(close<0)throw new Error('块级公式缺少结束 $$');
  let next=start;while(next<end && state.eMarks[next]<close+2)next++;
  if(next>=end || state.src.slice(close+2,state.eMarks[next]).trim()) return false;
  if(!silent){const t=state.push('piper_math_block','',0);t.content=state.src.slice(from,close).trim();t.block=true;t.map=[start,next+1];}
  state.line=next+1;return true;
 });
}
async function localImage(raw,filename,root) {
 const decoded=decodeURIComponent(raw);
 if(/^[a-z][a-z0-9+.-]*:/i.test(decoded)||decoded.startsWith('//'))throw new Error('不支持的图片地址：'+raw);
 const realRoot=await fs.realpath(root);const real=await fs.realpath(path.resolve(path.dirname(filename),decoded));
 const relative=path.relative(realRoot,real);if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw new Error('图片超出工作区：'+raw);
 const stat=await fs.stat(real);if(stat.size>MAX)throw new Error('图片超过 20 MiB：'+raw);
 let bytes=await fs.readFile(real);let mime;
 if(path.extname(real).toLowerCase()==='.svg'){bytes=rasterSVG(bytes.toString('utf8'),1600);mime='image/png';}
 else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
 else if(/^GIF8[79]a/.test(bytes.subarray(0,6).toString()))mime='image/gif';
 else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')mime='image/webp';
 else throw new Error('不支持的图片格式：'+raw);
 return {bytes,mime};
}
const css=`section{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#242424;line-height:1.85;word-wrap:break-word;background:#fff;}p{margin:16px 0;}h1{font-size:26px;line-height:1.5;margin:28px 0 18px;}h2{font-size:22px;margin:26px 0 14px;border-bottom:2px solid #16856e;padding-bottom:8px;}h3{font-size:18px;margin:22px 0 12px;}strong{font-weight:700;color:#155f51;}blockquote{margin:18px 0;padding:8px 16px;background:#f2f6f5;border-left:3px solid #16856e;color:#53615d;}img{max-width:100%;height:auto;}img.article-image{display:block;margin:16px auto;}pre{padding:16px;background:#f5f6f8;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.6;}code{font-family:Menlo,Consolas,monospace;}a{color:#16856e;text-decoration:underline;}table{border-collapse:collapse;width:100%;font-size:14px;}th,td{border:1px solid #d6dedb;padding:8px;text-align:left;}th{background:#edf4f1;}li{margin:6px 0;}.hljs-keyword,.hljs-selector-tag{color:#8354a3;}.hljs-string,.hljs-attr{color:#35724c;}.hljs-number,.hljs-literal{color:#9a5729;}.hljs-comment{color:#777;}hr{border:0;border-top:1px solid #ddd;margin:24px 0;}`;
function tocPlugin(md){
 md.block.ruler.before('paragraph','piper_toc',(state,start,end,silent)=>{
  if(state.sCount[start]-state.blkIndent>=4)return false;
  const line=state.src.slice(state.bMarks[start]+state.tShift[start],state.eMarks[start]);
  const options=parseTOCMarker(line);if(!options)return false;
  if(!silent){const token=state.push('piper_toc','',0);token.block=true;token.map=[start,start+1];token.meta=options;}
  state.line=start+1;return true;
 },{alt:['paragraph','reference','blockquote']});
}
async function render(markdown,{filename,root=path.dirname(filename),fontSize=16,resolveAsset,signal,preview=false}={}) {
 if(markdown.length>1_000_000)throw new Error('文章过长（上限 100 万字符）');
 const assets=[];const md=new MarkdownIt({html:false,linkify:false,typographer:false,highlight:(s,lang)=>lang&&hljs.getLanguage(lang)?hljs.highlight(s,{language:lang,ignoreIllegals:true}).value:esc(s)}).use(await cjkFriendlyPlugin).use(mathPlugin).use(tocPlugin);
 const tokens=md.parse(markdown,{});
 const headings=[];const hasTOC=tokens.some(t=>t.type==='piper_toc');
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];
  if(preview&&t.map&&t.nesting!==-1)t.attrSet('data-source-line',String(t.map[0]));
  if(t.type==='heading_open'){
   const id='piper-heading-'+headings.length;
   const inline=tokens[i+1];
   const title=inline.children?.map(c=>c.type==='image'?c.content:c.type.endsWith('_open')||c.type.endsWith('_close')?'':c.content).join('')||inline.content;
   headings.push({id,title,level:Number(t.tag.slice(1)),line:t.map[0]});
   if(preview||hasTOC)t.attrSet('id',id);
  }
 }

 async function walk(list){for(const t of list){signal?.throwIfAborted();if(t.children)await walk(t.children);
  if(t.type==='image'){
   const src=t.attrGet('src');if(/^https?:\/\//i.test(src)){safeURL(src);continue;}
   const asset=await localImage(src,filename,root);assets.push(asset);t.attrSet('src',await resolve(asset));t.attrSet('class','article-image');
  }
  if(t.type==='piper_math'||t.type==='piper_math_block'){
   const display=t.type==='piper_math_block';const asset=mathImage(t.content,display,fontSize);assets.push(asset);const src=await resolve(asset);
   const img=`<img class="math-image" src="${esc(src)}" alt="${esc(t.content)}" style="width:${asset.width.toFixed(2)}px;max-width:100%;height:auto;vertical-align:${asset.depth.toFixed(2)}px;${display?'display:block;margin:16px auto;':'display:inline-block;margin:0 2px;'}" />`;
   t.meta=display?`<p>${img}</p>`:img;
  }
 }}
 const memo=new Map();async function resolve(asset){const key=crypto.createHash('sha256').update(asset.bytes).digest('hex');if(!memo.has(key)){memo.set(key,resolveAsset?await resolveAsset(asset):`data:${asset.mime};base64,${asset.bytes.toString('base64')}`);}return memo.get(key);}
 md.renderer.rules.piper_toc=(tokens,index)=>{
  const options=tokens[index].meta,tree={level:0,children:[]},stack=[tree];
  for(const heading of headings.filter(h=>h.level>=options.depthFrom&&h.level<=options.depthTo)){
   while(stack.length>1&&stack[stack.length-1].level>=heading.level)stack.pop();
   const node={...heading,children:[]};stack[stack.length-1].children.push(node);stack.push(node);
  }
  const tag=options.orderedList?'ol':'ul';
  const list=nodes=>`<${tag}>${nodes.map(h=>`<li><a href="#${h.id}">${esc(h.title)}</a>${h.children.length?list(h.children):''}</li>`).join('')}</${tag}>`;
  return `<section class="article-toc"><p><strong>目录</strong></p>${list(tree.children)}</section>`;
 };
 await walk(tokens);md.renderer.rules.piper_math=(ts,i)=>ts[i].meta;md.renderer.rules.piper_math_block=(ts,i)=>ts[i].meta;
 const html=juice.inlineContent(`<section style="font-size:${fontSize}px">${md.renderer.render(tokens,md.options,{})}</section>`,css,{removeStyleTags:true});
 return {html,text:markdown,assets:assets.length,uniqueAssets:memo.size,headings,characters:Array.from(markdown.replace(/\s/g,'')).length};
}
module.exports={render,safeURL,localImage,mathImage,rasterSVG};
