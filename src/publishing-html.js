'use strict';
const cheerio=require('cheerio');
const {fileURLToPath}=require('node:url');
const path=require('node:path');
const {rasterizeSVG,rasterizeDiagram}=require('./publishing-browser');
const allowed=new Set('figure figcaption section div p span br hr h1 h2 h3 h4 h5 h6 strong b em i s del u a blockquote pre code ul ol li table thead tbody tfoot tr th td caption colgroup col sup sub kbd mark dl dt dd img'.split(' '));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sourceLine($,node){const raw=$(node).closest('[data-source-line],[data-source-line-start]').attr('data-source-line')??$(node).closest('[data-source-line-start]').attr('data-source-line-start');return Number.isFinite(Number(raw))?Number(raw)+1:1;}
function failure($,node,message){return new Error(`${message}（第 ${sourceLine($,node)} 行）`);}
async function normalizeHTML(html,options){
 if(typeof html!=='string'||Buffer.byteLength(html)>12*1024*1024)throw new Error('增强渲染结果过大或无效');
 const {signal,filename,root,preview,fontSize,mathImage,localImage,safeURL,collect,onProgress}=options;
 const $=cheerio.load(html,{xmlMode:false},false),warnings=[],tocMarkers=[];
 $('.article-toc[data-piper-toc-options]').each((_,element)=>{
  let options;try{options=JSON.parse($(element).attr('data-piper-toc-options'));}catch{throw failure($,element,'Invalid imported TOC options');}
  if(!options||!Number.isInteger(options.depthFrom)||!Number.isInteger(options.depthTo)||options.depthFrom<1||options.depthTo>6||options.depthFrom>options.depthTo||typeof options.orderedList!=='boolean')throw failure($,element,'Invalid imported TOC options');
  tocMarkers.push({element,options});$(element).removeAttr('data-piper-toc-options');
 });
 $('.mathjax-exps').each((_,element)=>{const node=$(element),text=node.text().trim(),display=text.startsWith('$$')||text.startsWith('\\['),delimiter=text.startsWith('$')&&!display?1:2;node.attr('data-math',text.slice(delimiter,-delimiter));node.attr('data-display',String(display));});
 const progress=()=>onProgress?.({phase:'convert',completed:done,total});
 let done=0;const total=$('svg,img,[data-math],.mermaid,.wavedrom,.vega,.vega-lite').length;progress();
 for(const element of $('.mermaid,.wavedrom,.vega,.vega-lite').toArray()){
  signal?.throwIfAborted();const node=$(element),kind=['mermaid','wavedrom','vega','vega-lite'].find(name=>node.hasClass(name));
  const source=node.find('script').length?node.find('script').text():node.text();
  try{const asset=await rasterizeDiagram(kind,source,options);node.replaceWith(`<img class="article-image" src="${collect(asset)}" alt="${kind} 图表" />`);done++;progress();}catch(error){if(error.name==='AbortError')throw error;throw failure($,element,`${kind} 转换失败：${error.message}`);}
 }
 for(const element of $('[data-math]').toArray()){
  signal?.throwIfAborted();const node=$(element),tex=node.attr('data-math'),display=node.attr('data-display')==='true'||node.attr('data-display')==='block'||node.hasClass('display');
  const asset=mathImage(tex,display,fontSize),src=collect(asset);node.replaceWith(`<img class="math-image" src="${src}" alt="${esc(tex)}" style="width:${asset.width.toFixed(2)}px;max-width:100%;height:auto;vertical-align:${asset.depth.toFixed(2)}px;${display?'display:block;margin:16px auto;':'display:inline-block;margin:0 2px;'}" />`);done++;progress();if(done%8===0)await new Promise(setImmediate);
 }
 for(const element of $('svg').toArray()){
  signal?.throwIfAborted();const node=$(element),asset=await rasterizeSVG($.html(element),1600,options);const src=collect(asset);node.replaceWith(`<img class="article-image" src="${src}" alt="图表" />`);done++;progress();
 }
 for(const element of $('img').toArray()){
  signal?.throwIfAborted();const node=$(element),src=node.attr('src')||'';if(src.startsWith('piper-asset:'))continue;
  if(/^https?:\/\//i.test(src)){safeURL(src);continue;}
  let asset;
  const data=src.match(/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,([a-z\d+/=\s]+)$/i);
  if(data){const bytes=Buffer.from(data[2],'base64');if(bytes.length>20*1024*1024)throw failure($,element,'图片超过 20 MiB');asset=data[1]==='svg+xml'?await rasterizeSVG(bytes.toString('utf8'),1600,options):{bytes,mime:'image/'+data[1].toLowerCase()};}
  else{let ref=src;if(src.startsWith('file:'))ref=path.relative(path.dirname(filename),fileURLToPath(src));asset=await localImage(ref,filename,root,options);}
  node.attr('src',collect(asset));node.addClass('article-image');done++;progress();
 }
 for(const element of $('input').toArray()){
  const node=$(element);if(node.attr('type')!=='checkbox')throw failure($,element,'公众号不支持交互输入');const checked=node.attr('checked')!==undefined;node.replaceWith(`<span class="task-marker">${checked?'☑':'☐'}</span>`);
 }
 $('.footnote-backref,.footnotes-sep').remove();
 $('.footnotes,.footnotes-list').addClass('article-endnotes');
 for(const element of $('details').toArray())$(element).replaceWith(`<section>${$(element).html()}</section>`);
 for(const element of $('summary').toArray())$(element).replaceWith(`<p><strong>${$(element).html()}</strong></p>`);
 for(const element of $('*').toArray()){
  const node=$(element),tag=element.tagName.toLowerCase();
  if(!allowed.has(tag))throw failure($,element,`公众号无法安全转换 ${tag} 内容`);
  if(node.hasClass('mermaid')||node.hasClass('wavedrom')||node.hasClass('vega')||node.hasClass('vega-lite'))throw failure($,element,'图表尚未完成转换');
  for(const [name,value] of Object.entries(element.attribs||{})){
   if(name==='style'){
    if(/[\\]|url\s*\(|expression\s*\(|@import|javascript|behavior\s*:/i.test(value))throw failure($,element,'不安全的内联样式');
    // Only the numeric publishing math styles generated above are retained.
    if(!node.hasClass('math-image'))node.removeAttr(name);
   }else if(name==='href'){
    if(!value.startsWith('#')){if(/^https?:\/\//i.test(value))safeURL(value);else if(/^file:/.test(value)||!/^\w[\w+.-]*:/.test(value)){warnings.push({kind:'local-link',line:sourceLine($,element),message:'本地链接已保留为文字；公众号正文不包含本地文件地址。'});node.removeAttr('href');}else if(!/^mailto:[^\s<>]+$/i.test(value))throw failure($,element,'公众号链接必须是公开 HTTPS 地址或文内锚点');}
   }else if(name==='src'){if(tag!=='img')node.removeAttr(name);}
   else if(name==='class'||name==='alt'||name==='title'||name==='id'){}
   else if(['colspan','rowspan','start'].includes(name)){if(!/^\d{1,3}$/.test(value))node.removeAttr(name);}
   else if(name==='data-source-line'&&/^\d+$/.test(value)){}
   else node.removeAttr(name);
  }
 }
 const headings=[];$('h1,h2,h3,h4,h5,h6').each((index,element)=>{
  const node=$(element),previous=node.attr('id'),id='piper-heading-'+index;const slug=node.text().trim().toLowerCase().replace(/[^\p{L}\p{N} _-]/gu,'').replace(/\s+/g,'-');$('a[href^="#"]').each((_,a)=>{let fragment;try{fragment=decodeURIComponent($(a).attr('href').slice(1));}catch{return;}if(fragment===previous||fragment===slug)$(a).attr('href','#'+id);});
  headings.push({id,title:node.text(),level:Number(element.tagName.slice(1)),line:Math.max(0,sourceLine($,element)-1)});node.attr('id',id);
 });
 return {$,html:$.html(),headings,warnings,tocMarkers};
}
module.exports={normalizeHTML};
