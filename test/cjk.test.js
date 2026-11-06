// Chinese delimiter behavior is shared by publishing and the embedded engine.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');
const {pathToFileURL}=require('node:url');
const MarkdownIt=require('markdown-it');
const {render}=require('../src/render');
const vendor=path.resolve(__dirname,'../vendor/mpe');
const vendorRequire=Module.createRequire(path.join(vendor,'package.json'));
const esbuild=vendorRequire('esbuild');
const cjkBuildPlugin=require('../vendor/mpe/src/markdown-it-cjk-build.cjs');
let directory,baseline,enhanced,PatchedMarkdownIt;
const options={isForPreview:true,useRelativeFilePath:false,hideFrontMatter:true};
function paragraph(html){return html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1].replace(/\s(?:style|data-source-line)="[^"]*"/g,'');}
async function engineFor(exports){
 const notebook=await exports.Notebook.init({notebookPath:pathToFileURL(directory).href,config:{enableScriptExecution:false}});
 return new exports.MarkdownEngine({notebook,filePath:path.join(directory,'article.md')});
}
before(async()=>{
 directory=await fs.mkdtemp(path.join(os.tmpdir(),'piper-cjk-regression-'));
 const bundle=await esbuild.build({stdin:{contents:'module.exports = require("markdown-it");',resolveDir:vendor},bundle:true,platform:'node',format:'cjs',target:'node18',write:false,plugins:[cjkBuildPlugin]});
 const adapter=new Module(path.join(directory,'parser.cjs'),module);adapter.filename=path.join(directory,'parser.cjs');
 adapter._compile(bundle.outputFiles[0].text,adapter.filename);
 PatchedMarkdownIt=adapter.exports.default||adapter.exports;
 // Exercise the actual pinned engine with the same constructor its build receives.
 const filename=vendorRequire.resolve('crossnote');
 const patched=new Module(filename,module);patched.filename=filename;patched.paths=Module._nodeModulePaths(path.dirname(filename));
 patched.require=function(request){return request==='markdown-it'?PatchedMarkdownIt:Module.prototype.require.call(this,request);};
 patched._compile(fsSync.readFileSync(filename,'utf8'),filename);
 baseline=await engineFor(vendorRequire('crossnote'));
 enhanced=await engineFor(patched.exports);
});
after(async()=>{if(directory)await fs.rm(directory,{recursive:true,force:true});});
const cases=[
 ['这是**合法的加粗。**后文','这是<strong>合法的加粗。</strong>后文'],
 ['这是**加粗**。','这是<strong>加粗</strong>。'],
 ['**中文。**','<strong>中文。</strong>'],
 ['前文*强调。*后文','前文<em>强调。</em>后文'],
 ['前文***粗斜体。***后文','前文<em><strong>粗斜体。</strong></em>后文'],
 ['前文**《书名》**后文','前文<strong>《书名》</strong>后文'],
 ['中文**bold.**后文','中文<strong>bold.</strong>后文'],
 ['foo**bar.**baz','foo**bar.**baz'],
 ['foo**bar**baz','foo<strong>bar</strong>baz'],
 ['前文__中文。__后文','前文__中文。__后文'],
 ['`这是**原样。**后文`','<code>这是**原样。**后文</code>'],
 [String.raw`这是\*\*原样。\*\*后文`,'这是**原样。**后文'],
 ['这是**含 `code` 和 *强调*。**后文','这是<strong>含 <code>code</code> 和 <em>强调</em>。</strong>后文'],
 ['这是**[链接](https://example.com)。**后文','这是<strong><a href="https://example.com">链接</a>。</strong>后文'],
 ['𠮷**补充汉字。**𠮷','𠮷<strong>补充汉字。</strong>𠮷'],
];
for(const [source,expected]of cases)test(`CJK parity: ${source}`,async()=>{
 const result=await render(source,{filename:path.join(directory,'article.md')});
 assert.equal(paragraph(result.html),expected,'WeChat output');
 const preview=await enhanced.parseMD(source,options);
 assert.equal(paragraph(preview.html),expected,'actual enhanced engine output');
});
test('records the actual upstream limitation instead of claiming existing MPE support',async()=>{
 assert.equal(JSON.parse(fsSync.readFileSync(path.resolve(path.dirname(vendorRequire.resolve('crossnote')),'../../package.json'),'utf8')).version,'0.9.42');
 const source='这是**合法的加粗。**后文';
 assert.equal(paragraph((await baseline.parseMD(source,options)).html),source);
});
test('plain Latin/underscore/escape behavior remains CommonMark-compatible',()=>{
 const ordinary=new MarkdownIt(),patched=new PatchedMarkdownIt();
 for(const source of ['foo**bar.**baz','foo__bar__baz','** bold **','a*b*c',String.raw`\*escaped\*`,'😀**bold.**😀'])assert.equal(patched.render(source),ordinary.render(source),source);
});
test('math still renders inside Chinese strong emphasis without altering its source',async()=>{
 const source='这是**公式$x^2$。**后文';
 const result=await render(source,{filename:path.join(directory,'article.md')});
 assert.match(result.html,/<strong\b[^>]*>公式<img\b[^>]*class="math-image"[\s\S]*?。<\/strong>后文/);
 assert.equal(result.assets,1);assert.equal(result.text,source);
 const preview=await enhanced.parseMD(source,options);
 assert.match(preview.html,/<strong>公式[\s\S]*?katex[\s\S]*?。<\/strong>后文/);
});
test('code fences remain literal and publishing continues to escape raw HTML',async()=>{
 const result=await render('```text\n这是**原样。**后文\n```\n\n<script>bad()</script>',{filename:path.join(directory,'article.md')});
 assert.match(result.html,/这是\*\*原样。\*\*后文/);assert.doesNotMatch(result.html,/<strong|<script/);
});
