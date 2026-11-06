'use strict';
(function(root){
 const slug=title=>title.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/\s+/g,'-');
 function sourceAtOffset(blocks,offset){
  let before=null,after=null;
  for(const block of blocks){if(block.top<=offset){if(!before||block.top>=before.top)before=block;}else if(!after||block.top<after.top)after=block;}
  return (before||after)?.line??null;
 }
 function fragmentTarget(headings,fragment){return headings.find(h=>h.id===fragment||slug(h.title)===fragment||h.title===fragment);}
 const api={sourceAtOffset,fragmentTarget};if(typeof module==='object'&&module.exports)module.exports=api;else root.PiperNavigation=api;
})(globalThis);
