'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const MarkdownIt = require('markdown-it');
// The pinned ESM plugin supports Node 18; loading once keeps preview/copy identical.
const cjkFriendlyPlugin = import('markdown-it-cjk-friendly').then(module => module.default);
const {parseTOCMarker,assertWechatCompatible}=require('./wechat-preflight');
const {publishingStyle}=require('./publishing-style');
const {normalizeHTML}=require('./publishing-html');
const {rasterizeSVG,disposePublishingBrowser}=require('./publishing-browser');
const {validateSVG}=require('./publishing-svg');
const footnotes=require('markdown-it-footnote');
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
 validateSVG(svg);
 // Prevent resvg from following local references in untrusted SVGs. Embedded raster data only.
 if (/<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|(?:href|xlink:href)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|webp);base64,)/i.test(svg) || /url\(\s*["']?\s*(?!#)/i.test(svg)) throw new Error('SVG 包含外部资源、脚本或不支持的嵌入内容');
 const cacheKey=crypto.createHash('sha256').update(svg).update(String(width)+':'+loadSystemFonts).digest('hex');
 const cached=rasterCache.get(cacheKey);if(cached){rasterCache.delete(cacheKey);rasterCache.set(cacheKey,cached);return cached;}
 const renderer=new Resvg(svg,{fitTo:{mode:'width',value:width},font:{loadSystemFonts,defaultFontFamily:'PingFang SC'},background:'#ffffff'});
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
 const width=Math.max(1,widthEx*fontSize/2),height=Math.max(1,heightEx*fontSize/2),padding=2;
 const depth=Number(svg.match(/vertical-align:\s*(-?[\d.]+)ex/)?.[1]||0)*fontSize/2-padding;
 svg=svg.replace(/currentColor/g,'#242424').replace(/width="[^"]+"/,`width="${width}"`).replace(/height="[^"]+"/,`height="${height}"`);
 // Make the pixels themselves readable in dark clients; CSS alone does not survive paste.
 svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width+padding*2}" height="${height+padding*2}"><rect width="100%" height="100%" fill="#ffffff"/><g transform="translate(${padding} ${padding})">${svg}</g></svg>`;
 return {bytes:rasterSVG(svg,Math.min(4096,Math.ceil((width+padding*2)*3)),false),mime:'image/png',width:width+padding*2,height:height+padding*2,depth};
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
async function localImage(raw,filename,root,options={}) {
 const decoded=decodeURIComponent(raw);
 if(/^[a-z][a-z0-9+.-]*:/i.test(decoded)||decoded.startsWith('//'))throw new Error('不支持的图片地址：'+raw);
 const realRoot=await fs.realpath(root);const real=await fs.realpath(path.resolve(path.dirname(filename),decoded));
 const relative=path.relative(realRoot,real);if(relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw new Error('图片超出工作区：'+raw);
 const stat=await fs.stat(real);if(stat.size>MAX)throw new Error('图片超过 20 MiB：'+raw);
 let bytes=await fs.readFile(real);let mime;
 if(path.extname(real).toLowerCase()==='.svg'){bytes=(await rasterizeSVG(bytes.toString('utf8'),1600,options)).bytes;mime='image/png';}
 else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
 else if(/^GIF8[79]a/.test(bytes.subarray(0,6).toString()))mime='image/gif';
 else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')mime='image/webp';
 else throw new Error('不支持的图片格式：'+raw);
 return {bytes,mime};
}
function tocPlugin(md){
 md.block.ruler.before('paragraph','piper_toc',(state,start,end,silent)=>{
  if(state.sCount[start]-state.blkIndent>=4)return false;
  const line=state.src.slice(state.bMarks[start]+state.tShift[start],state.eMarks[start]);
  const options=parseTOCMarker(line);if(!options)return false;
  if(!silent){const token=state.push('piper_toc','',0);token.block=true;token.map=[start,start+1];token.meta=options;}
  state.line=start+1;return true;
 },{alt:['paragraph','reference','blockquote']});
}
function plainHTML(markdown,preview,plugin){
 const md=new MarkdownIt({html:false,linkify:false,typographer:false,highlight:(text,lang)=>lang&&hljs.getLanguage(lang)?hljs.highlight(text,{language:lang,ignoreIllegals:true}).value:esc(text)}).use(plugin).use(mathPlugin).use(tocPlugin).use(footnotes);
 const tokens=md.parse(markdown,{}),headings=[];
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i];if(token.map&&token.nesting!==-1)token.attrSet('data-source-line',String(token.map[0]));
  if(token.type==='heading_open'){const id='piper-heading-'+headings.length,inline=tokens[i+1];headings.push({id,title:inline.content,level:Number(token.tag.slice(1)),line:token.map[0]});token.attrSet('id',id);}
  if(token.type==='inline'&&tokens[i-2]?.type==='list_item_open'&&token.children?.[0]?.type==='text'){
   const first=token.children[0],match=first.content.match(/^\[([ xX])\]\s+/);if(match){first.content=first.content.slice(match[0].length);const marker=new token.constructor('html_inline','',0);marker.content=`<span class="task-marker">${match[1]===' '?'☐':'☑'}</span>`;token.children.unshift(marker);}
  }
 }
 md.renderer.rules.piper_math=(items,index)=>`<span data-math="${esc(items[index].content)}" data-display="false"></span>`;
 md.renderer.rules.piper_math_block=(items,index)=>`<p data-source-line="${items[index].map[0]}"><span data-math="${esc(items[index].content)}" data-display="true"></span></p>`;
 const fence=md.renderer.rules.fence;
 md.renderer.rules.fence=(items,index,...args)=>{const token=items[index],kind=token.info.trim().split(/\s/)[0].toLowerCase();if(['mermaid','wavedrom','vega','vega-lite'].includes(kind))return `<div class="${kind}" data-source-line="${token.map[0]}">${esc(token.content)}</div>`;return fence(items,index,...args);};
 md.renderer.rules.piper_toc=(items,index)=>tocHTML(headings,items[index].meta);
 return md.renderer.render(tokens,md.options,{});
}
function tocHTML(headings,options={depthFrom:1,depthTo:6,orderedList:false}){
 const tree={level:0,children:[]},stack=[tree];for(const h of headings.filter(h=>h.level>=options.depthFrom&&h.level<=options.depthTo)){while(stack.length>1&&stack[stack.length-1].level>=h.level)stack.pop();const node={...h,children:[]};stack[stack.length-1].children.push(node);stack.push(node);}const tag=options.orderedList?'ol':'ul';
 const list=nodes=>`<${tag}>${nodes.map(h=>`<li><a href="#${h.id}">${esc(h.title)}</a>${h.children.length?list(h.children):''}</li>`).join('')}</${tag}>`;
 return `<section class="article-toc"><p><strong>目录</strong></p>${list(tree.children)}</section>`;
}
async function render(markdown,{filename,root=path.dirname(filename),fontSize=16,resolveAsset,signal,preview=false,parseEnhanced,browserPath,style={},wechatIncludeTOC=false,onProgress}={}){
 if(markdown.length>1_000_000)throw new Error('文章过长（上限 100 万字符）');signal?.throwIfAborted();
 assertWechatCompatible(markdown,{enhanced:!!parseEnhanced});const theme=publishingStyle(style,fontSize);
 onProgress?.({phase:'parse',completed:0,total:1});
 const explicitTOCs=[];let parseSource=markdown;if(parseEnhanced){const lines=markdown.split('\n'),excluded=new Set();for(const token of new MarkdownIt({html:false}).parse(markdown,{})){if(['fence','code_block'].includes(token.type)&&token.map)for(let i=token.map[0];i<token.map[1];i++)excluded.add(i);}for(let i=0;i<lines.length;i++){if(excluded.has(i))continue;const toc=parseTOCMarker(lines[i]);if(toc){const marker='PIPERTOC'+crypto.randomBytes(16).toString('hex');explicitTOCs.push({marker,options:toc});lines[i]=marker;}}parseSource=lines.join('\n');}const enhanced=parseEnhanced?await parseEnhanced(parseSource,{filename,root,signal}):undefined;
 const raw=enhanced?enhanced.html:plainHTML(markdown,preview,await cjkFriendlyPlugin);signal?.throwIfAborted();onProgress?.({phase:'parse',completed:1,total:1});
 const assets=[],unique=new Map();
 const collect=asset=>{signal?.throwIfAborted();if(asset.bytes.length>MAX)throw new Error('图片超过 20 MiB');assets.push(asset);const key=crypto.createHash('sha256').update(asset.bytes).digest('hex');if(!unique.has(key))unique.set(key,{asset,index:unique.size});return 'piper-asset:'+unique.get(key).index;};
 const result=await normalizeHTML(raw,{filename,root,fontSize:theme.fontSize,signal,preview,browserPath,mathImage,localImage,safeURL,collect,onProgress});
 for(const toc of explicitTOCs){const nodes=result.$('p').filter((_,node)=>result.$(node).text().trim()===toc.marker);if(nodes.length!==1)throw new Error('增强引擎未能保留正文目录位置');nodes.replaceWith(tocHTML(result.headings,toc.options));}
 for(const toc of result.tocMarkers)result.$(toc.element).replaceWith(tocHTML(result.headings,toc.options));
 if(wechatIncludeTOC&&!result.$('.article-toc').length&&result.headings.length)result.$.root().prepend(tocHTML(result.headings));
 const entries=[...unique.values()];let next=0,completed=0;const urls=[];
 if(resolveAsset)onProgress?.({phase:'upload',completed:0,total:entries.length});
 const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 async function consume(){while(next<entries.length){combined.throwIfAborted();const entry=entries[next++];try{const url=resolveAsset?await resolveAsset(entry.asset,combined):`data:${entry.asset.mime};base64,${entry.asset.bytes.toString('base64')}`;combined.throwIfAborted();if(resolveAsset)safeURL(url);urls[entry.index]=url;completed++;if(resolveAsset)onProgress?.({phase:'upload',completed,total:entries.length});}catch(error){controller.abort(error);throw error;}}}
 const jobs=Array.from({length:Math.min(resolveAsset?3:1,entries.length)},()=>consume());const settled=await Promise.allSettled(jobs);const error=settled.find(item=>item.status==='rejected');if(error)throw error.reason;signal?.throwIfAborted();
 result.$('img').each((_,node)=>{const image=result.$(node),src=image.attr('src')||'';if(src.startsWith('piper-asset:'))image.attr('src',urls[Number(src.slice(12))]);});
 if(!preview){result.$('[data-source-line]').removeAttr('data-source-line');const targets=new Set(result.$('a[href^="#"]').toArray().map(a=>result.$(a).attr('href').slice(1)));result.$('h1,h2,h3,h4,h5,h6').each((_,heading)=>{const node=result.$(heading);if(!targets.has(node.attr('id')))node.removeAttr('id');});}
 onProgress?.({phase:'style',completed:0,total:1});const html=juice.inlineContent(`<section class="piper-article">${result.$.html()}</section>`,theme.css,{removeStyleTags:true});signal?.throwIfAborted();onProgress?.({phase:'style',completed:1,total:1});
 const textTree=result.$.root().clone();textTree.find('img').each((_,image)=>{const node=result.$(image);node.replaceWith(result.$('<span>').text(node.attr('alt')||'图片'));});textTree.find('br').replaceWith('\n');textTree.find('li').each((_,item)=>{const node=result.$(item),parent=node.parent();node.prepend(parent.is('ol')?String(parent.children('li').index(item)+Number(parent.attr('start')||1))+'. ':'• ');});textTree.find('th,td').append('\t');textTree.find('p,h1,h2,h3,h4,h5,h6,li,tr,pre,blockquote,section,div').append('\n');const text=textTree.text().replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 return {html,text,assets:assets.length,uniqueAssets:unique.size,headings:result.headings,warnings:result.warnings,characters:Array.from(markdown.replace(/\s/g,'')).length};
}
module.exports={render,safeURL,localImage,mathImage,rasterSVG,disposePublishingBrowser};
