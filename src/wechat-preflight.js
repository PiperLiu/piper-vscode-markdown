'use strict';
const MarkdownIt=require('markdown-it');
const parser=new MarkdownIt({html:false});
const diagramNames=new Set(['mermaid','plantuml','puml','dot','graphviz','viz','d2','wavedrom','vega','vega-lite','vegalite','tikz','flow','flowchart','sequence','ditaa','blockdiag','actdiag','nwdiag','packetdiag','rackdiag','seqdiag','nomnoml','pikchr']);
function parseTOCMarker(line){
 let text=line.trim();const defaults={depthFrom:1,depthTo:6,orderedList:false};
 if(/^\[toc\]$/i.test(text))return defaults;
 if(/^<!--\s*@import\s+(["'])\[toc\]\1/i.test(text)){
  if(!text.endsWith('-->'))throw new Error('公众号目录注释必须在同一行完整结束');
  text=text.slice(4,-3).trim();
 }
 if(!/^@import\s+(["'])\[toc\]\1/i.test(text))return undefined;
 const marker=text.match(/^@import\s+(["'])\[toc\]\1(?:\s+\{([^{}]*)\})?\s*$/i);
 if(!marker)throw new Error('不支持的公众号目录标记格式');
 const options={...defaults},seen=new Set();let rest=(marker[2]||'').trim();
 const aliases={cmd:'cmd',depthFrom:'depthFrom',depth_from:'depthFrom',depthTo:'depthTo',depth_to:'depthTo',orderedList:'orderedList',ordered_list:'orderedList'};
 while(rest){
  const part=rest.match(/^([A-Za-z_]\w*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)(?=\s|$)/);
  if(!part)throw new Error('不支持的公众号目录选项格式');
  const key=aliases[part[1]],value=/^["']/.test(part[2])?part[2].slice(1,-1):part[2];
  if(!key||seen.has(key))throw new Error('不支持或重复的公众号目录选项：'+part[1]);
  seen.add(key);
  if(key==='cmd'){if(value!=='toc')throw new Error('公众号目录仅支持 cmd="toc"');}
  else if(key==='orderedList'){if(!/^(true|false)$/.test(value))throw new Error('公众号目录 orderedList 必须为 true 或 false');options[key]=value==='true';}
  else {if(!/^[1-6]$/.test(value))throw new Error('公众号目录层级必须为 1 到 6');options[key]=Number(value);}
  rest=rest.slice(part[0].length).trimStart();
 }
 if(options.depthFrom>options.depthTo)throw new Error('公众号目录 depthFrom 不能大于 depthTo');
 return options;
}
function isTOCMarker(line){return Boolean(parseTOCMarker(line));}

function inspectWechatCompatibility(markdown){
 if(markdown.length>1_000_000)throw new Error('文章过长（上限 100 万字符）');
 const issues=[];
 const add=(kind,line)=>{if(!issues.some(issue=>issue.kind===kind))issues.push({kind,line:line+1});};
 for(const token of parser.parse(markdown,{})){
  const line=token.map?.[0]??0;
  if(token.type==='fence'){
   const info=token.info.trim(),name=info.replace(/^[{.]*/, '').split(/[\s}]/)[0].toLowerCase();
   if(diagramNames.has(name))add(`${name} 图表`,line);
   if(/\b(?:cmd|run_on_save|run_on_start)\b/.test(info))add('可执行代码块',line);
  }
  if(token.type!=='inline')continue;
  const text=(token.children||[]).map(child=>child.type==='text'?child.content:['softbreak','hardbreak'].includes(child.type)?'\n':child.type==='code_inline'?' ':'').join('');
  for(const [offset,row]of text.split('\n').entries()){
   if(isTOCMarker(row))continue;
   if(/^\s*(?:<!--\s*)?@import\s+/.test(row))add('文件导入 @import',line+offset);
   if(/!?\[\[[^\]\n]+\]\]/.test(row))add('双链 / 嵌入引用',line+offset);
   if(/^\s*(?:!!!|:::)\s*\w/.test(row))add('扩展提示块',line+offset);
   if(/\[\^[^\]\n]+\]/.test(row))add('脚注',line+offset);
  }
 }
 return issues;
}
function compatibilityMessage(issues){
 if(!issues.length)return '';
 return '公众号排版暂不能转换：'+issues.map(issue=>`${issue.kind}（第 ${issue.line} 行）`).join('、')+'。请先将图表转为本地 PNG，或将引用展开为普通 Markdown；增强预览与标准导出仍可使用这些功能。';
}
function assertWechatCompatible(markdown){const issues=inspectWechatCompatibility(markdown);if(issues.length)throw new Error(compatibilityMessage(issues));}
module.exports={parseTOCMarker,isTOCMarker,inspectWechatCompatibility,compatibilityMessage,assertWechatCompatible};
