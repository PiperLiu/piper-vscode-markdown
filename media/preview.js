'use strict';
(()=>{
 const api=acquireVsCodeApi(),$=id=>document.getElementById(id);let state=api.getState()||{mode:'reading',outline:matchMedia('(min-width: 541px)').matches,scroll:0};let headings=[],sync=true,ignoreScrollUntil=0;
 const save=()=>api.setState(state),send=type=>api.postMessage({type});
 function mode(value){state.mode=value;document.body.classList.toggle('wechat',value==='wechat');for(const id of ['reading','wechat']){$(id).classList.toggle('active',id===value);$(id).setAttribute('aria-pressed',String(id===value));}save();notice();}
 function notice(){$('notice').textContent=state.mode==='wechat'?'公众号排版 · 本地预览，复制时才上传图片 · 请在有效期内确认微信转存':'公众号排版的阅读视图 · 双击正文定位源文 · 更多中可打开完整增强预览';}
 function outline(){document.body.classList.toggle('no-outline',!state.outline);document.body.classList.toggle('show-outline',state.outline);$('outline-toggle').setAttribute('aria-expanded',String(state.outline));save();}
 for(const id of ['reading','wechat'])$(id).onclick=()=>mode(id);
 $('outline-toggle').onclick=()=>{state.outline=!state.outline;outline();};
 for(const id of ['copy','source','export','mpe','settings'])$(id).onclick=()=>{send(id);$('more-menu').hidden=true;$('more').setAttribute('aria-expanded','false');};
 $('more').onclick=()=>{const bounds=$('more').getBoundingClientRect();$('more-menu').style.top=(bounds.bottom+6)+'px';$('more-menu').hidden=!$('more-menu').hidden;$('more').setAttribute('aria-expanded',String(!$('more-menu').hidden));};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('more-menu').hidden=true;$('more').setAttribute('aria-expanded','false');}});
 document.addEventListener('click',e=>{if(!$('more-menu').contains(e.target)&&e.target!==$('more')){$('more-menu').hidden=true;$('more').setAttribute('aria-expanded','false');}const link=e.target.closest('#content a');if(!link)return;e.preventDefault();const href=link.getAttribute('href');if(href?.startsWith('#')){let fragment;try{fragment=decodeURIComponent(href.slice(1));}catch{return;}const heading=PiperNavigation.fragmentTarget(headings,fragment);if(heading)document.getElementById(heading.id)?.scrollIntoView({block:'start'});}else api.postMessage({type:'link',href});});
 $('content').ondblclick=e=>{const block=e.target.closest('[data-source-line]');if(block)api.postMessage({type:'reveal',line:Number(block.dataset.sourceLine)});};
 let scrollTimer;addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{state.scroll=scrollY;save();const blocks=[...document.querySelectorAll('#content [data-source-line]')];const line=PiperNavigation.sourceAtOffset(blocks.map(el=>({line:Number(el.dataset.sourceLine),top:el.getBoundingClientRect().top})),130);if(line!==null&&sync&&Date.now()>ignoreScrollUntil)api.postMessage({type:'scroll',line});let current;for(const h of headings){const el=document.getElementById(h.id);if(el?.getBoundingClientRect().top<200)current=h.id;}$('headings').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.target===current));},100);},{passive:true});
 addEventListener('message',event=>{const m=event.data;if(m.type==='content'){
  const y=scrollY||state.scroll;$('content').innerHTML=m.html;$('compatibility').textContent=m.compatibility||'';$('compatibility').hidden=!m.compatibility;$('filename').textContent=m.filename;$('stats').textContent=`${m.characters.toLocaleString()} 字符 · 约 ${Math.max(1,Math.ceil(m.characters/500))} 分钟`;headings=m.headings;sync=m.scrollSync;
  document.documentElement.style.setProperty('--reading-width',m.width+'px');$('headings').replaceChildren();
  for(const h of headings){const b=document.createElement('button');b.textContent=h.title;b.style.paddingLeft=(8+(h.level-1)*10)+'px';b.dataset.target=h.id;b.onclick=()=>{ignoreScrollUntil=Date.now()+500;document.getElementById(h.id)?.scrollIntoView({block:'start'});api.postMessage({type:'reveal',line:h.line});};$('headings').append(b);}
  if(!headings.length)$('headings').textContent='添加标题后在此导航';$('error').hidden=true;requestAnimationFrame(()=>scrollTo(0,y));
 }else if(m.type==='error'){$('error').textContent='预览未更新：'+m.message;$('error').hidden=false;}
 else if(m.type==='busy'){$('copy').disabled=m.value;$('copy').textContent=m.value?'正在准备…':'复制到公众号';}
 else if(m.type==='scroll'&&sync){const blocks=[...document.querySelectorAll('#content [data-source-line]')];const block=blocks.filter(el=>Number(el.dataset.sourceLine)<=m.line).pop();if(block){ignoreScrollUntil=Date.now()+500;scrollTo(0,scrollY+block.getBoundingClientRect().top-140);}}
 });mode(state.mode);outline();api.postMessage({type:'ready'});
})();
