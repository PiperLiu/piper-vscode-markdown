'use strict';
// Apply after TOC generation: fragment links can be rebased by the destination
// editor, so they must not enter the clipboard or WeChat HTML export.
function normalizeWechatLinks($, {preview = false} = {}) {
 let converted = 0;
 $('a').each((_, element) => {
  const node = $(element), href = node.attr('href') || '';
  if (preview && href.startsWith('#')) return;
  let url;
  try { url = new URL(href); } catch { /* Local labels have no public target. */ }
  if (url && url.protocol === 'https:' && url.hostname === 'mp.weixin.qq.com' && !url.port && !url.username && !url.password) return;
  const replacement = $('<span>').append(node.contents());
  if (node.attr('title')) replacement.attr('title', node.attr('title'));
  if (url && ['https:', 'mailto:'].includes(url.protocol) && !url.username && !url.password) {
   const visible = url.protocol === 'mailto:' ? href.slice(7) : href;
   if (replacement.text().trim() !== visible) replacement.append($('<span>').text(' (' + visible + ')'));
  }
  node.replaceWith(replacement); converted++;
 });
 return converted;
}
module.exports = {normalizeWechatLinks};
