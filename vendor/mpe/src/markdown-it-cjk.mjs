// Piper integration, MIT. The upstream CJK plugin retains its MIT license.
import MarkdownIt from 'piper-markdown-it-original';
import cjkFriendly from 'markdown-it-cjk-friendly';

// Each engine gets its own parser state; never mutate a shared global prototype.
export default function PiperMarkdownIt(...args) {
  return new MarkdownIt(...args).use(cjkFriendly);
}
PiperMarkdownIt.prototype = MarkdownIt.prototype;
Object.setPrototypeOf(PiperMarkdownIt, MarkdownIt);
