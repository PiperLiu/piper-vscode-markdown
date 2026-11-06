'use strict';
const MarkdownIt=require('markdown-it');
const parser=new MarkdownIt({html:false});
// Keep original line endings and line positions for source navigation. Only a
// first, top-level H1 is a title; headings inside quotes/code are content.
function prepareWechatMarkdown(markdown,skipLeadingH1=false){
 if(markdown.length>1_000_000)throw new Error('文章过长（上限 100 万字符）');
 if(!skipLeadingH1)return {markdown,omittedTitle:false};
 const source=markdown.replace(/^\uFEFF/,'');
 const first=parser.parse(source,{}).find(t=>t.type!=='space');
 if(first?.type!=='heading_open'||first.tag!=='h1'||first.level!==0||!first.map)return {markdown,omittedTitle:false};
 const lines=source.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)||[];
 const [from,to]=first.map;
 for(let line=from;line<to;line++)lines[line]=(lines[line]||'').match(/(?:\r\n|\n|\r)$/)?.[0]||'';
 return {markdown:lines.join(''),omittedTitle:true};
}
module.exports={prepareWechatMarkdown};
