'use strict';
const MAX_SVG=5*1024*1024;
function validateSVG(svg){
 if(typeof svg!=='string'||Buffer.byteLength(svg)>MAX_SVG)throw new Error('SVG 过大（上限 5 MiB）');
 if(/<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\bon\w+\s*=|<\s*(?:iframe|object|embed|audio|video)\b|@import|(?:href|xlink:href)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|webp);base64,)/i.test(svg))throw new Error('SVG 包含外部资源、脚本或不支持的嵌入内容');
 if(!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg))throw new Error('无效的 SVG 文档');
 const $=require('cheerio').load(svg,{xmlMode:true,decodeEntities:true});
 $('*').each((_,node)=>{
  if(['script','foreignobject','iframe','object','embed','audio','video'].includes(node.name.toLowerCase()))throw new Error('SVG 包含外部资源、脚本或不支持的嵌入内容');
  for(const [name,value]of Object.entries(node.attribs||{})){
   if(/^on/i.test(name)||name.toLowerCase()==='src')throw new Error('SVG 包含外部资源、脚本或不支持的嵌入内容');
   if(/^(?:xlink:)?href$/i.test(name)&&!/^#|^data:image\/(?:png|jpeg|webp);base64,/i.test(value))throw new Error('SVG 包含外部资源、脚本或不支持的嵌入内容');
   for(const match of value.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi))if(!match[2].trim().startsWith('#'))throw new Error('SVG 包含外部资源、脚本或不支持的嵌入内容');
   if(name==='style'&&/[\\]|@import|expression\s*\(/i.test(value))throw new Error('SVG 包含不安全的样式');
  }
  if(node.name.toLowerCase()==='style'){const css=$(node).text();if(/[\\]|@import/i.test(css))throw new Error('SVG 包含不安全的样式');for(const match of css.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi))if(!match[2].trim().startsWith('#'))throw new Error('SVG 包含不安全的样式');}
 });
}
function checkDimensions(width,height){if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>20000||height>20000||width*height>20_000_000)throw new Error('SVG 输出尺寸过大或无效');}
module.exports={validateSVG,checkDimensions};
