'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module');
const {Worker}=require('node:worker_threads');
const {validateSVG,checkDimensions}=require('./publishing-svg');
const {ByteCache,digest}=require('./publishing-cache');
const cache=new ByteCache();let session,launching,queue=Promise.resolve(),idle,pending=0;
function runtime(){
 try{return require('../vendor/mpe/out/native/publishing-runtime.cjs');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
 const vendor=createRequire(path.join(__dirname,'../vendor/mpe/package.json')),crossnote=createRequire(vendor.resolve('crossnote'));
 return {puppeteer:crossnote('puppeteer-core')};
}
function abort(signal){signal?.throwIfAborted();}
function waitFor(promise,signal){if(!signal)return promise;abort(signal);return new Promise((resolve,reject)=>{const cancel=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));signal.addEventListener('abort',cancel,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));});}
function enqueue(work,signal){abort(signal);if(pending>=16)throw new Error('图像转换任务过多，请稍后重试');pending++;const job=queue.then(work).finally(()=>pending--);queue=job.catch(()=>{});return waitFor(job,signal);}
async function disposePublishingBrowser(){clearTimeout(idle);const current=session;session=undefined;if(current){await current.browser.close().catch(()=>{});await fs.rm(current.directory,{recursive:true,force:true}).catch(()=>{});}}
async function browserFor(browserPath){
 clearTimeout(idle);
 if(session&&session.path===browserPath&&session.browser.connected)return session.browser;
 if(launching)await launching;
 if(session&&session.path===browserPath&&session.browser.connected)return session.browser;
 launching=(async()=>{
  await disposePublishingBrowser();
  const candidates=browserPath?[browserPath]:['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  let executablePath;for(const candidate of candidates){if(!path.isAbsolute(candidate))continue;try{await fs.access(candidate);executablePath=candidate;break;}catch{}}
  if(!executablePath)throw new Error('没有可用的本地 Chrome/Edge');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'piper-publishing-'));
  try{const browser=await runtime().puppeteer.launch({executablePath,headless:true,pipe:true,userDataDir:directory,timeout:15000,args:['--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--no-first-run','--host-resolver-rules=MAP * ~NOTFOUND','--disable-features=OptimizationHints,MediaRouter']});session={browser,directory,path:browserPath};return browser;}
  catch(error){await fs.rm(directory,{recursive:true,force:true});throw error;}
 })();try{return await launching;}finally{launching=undefined;}
}
function scheduleIdle(){clearTimeout(idle);idle=setTimeout(()=>void disposePublishingBrowser(),1500);idle.unref();}
function fallback(svg,width,signal){return new Promise((resolve,reject)=>{
 abort(signal);const worker=new Worker(path.join(__dirname,'publishing-raster-worker.js'),{workerData:{svg,width}});let finished=false;
 const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);void worker.terminate().catch(()=>{}).then(()=>error?reject(error):resolve(value));};
 const cancel=()=>finish(signal.reason||new DOMException('Aborted','AbortError'));
 const timer=setTimeout(()=>finish(new Error('SVG 转换超时')),30000);
 signal?.addEventListener('abort',cancel,{once:true});
 worker.on('message',value=>value.error?finish(new Error(value.error)):finish(null,{...value,bytes:Buffer.from(value.bytes),mime:'image/png'}));worker.on('error',finish);worker.on('exit',code=>{if(!finished)finish(new Error(`SVG 转换进程退出（${code}）`));});
 });}
async function browserRaster(svg,width,{signal,browserPath}={}){
 abort(signal);let browser;
 try{browser=await browserFor(browserPath);}catch(error){abort(signal);return fallback(svg,width,signal);}
 if(signal?.aborted){scheduleIdle();abort(signal);}const page=await browser.newPage();let timer;
 const cancel=()=>void page.close().catch(()=>{});signal?.addEventListener('abort',cancel,{once:true});
 try{
  await page.setRequestInterception(true);page.on('request',request=>{const u=request.url();void (u.startsWith('data:')||u==='about:blank'?request.continue():request.abort()).catch(()=>{});});
  await page.setContent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; object-src \'none\'; connect-src \'none\'"><body></body>');
  const result=await Promise.race([page.evaluate(async({svg,width})=>{
   const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await image.decode();
   const height=Math.ceil(width*image.naturalHeight/image.naturalWidth);
   if(!Number.isFinite(height)||!image.naturalWidth||height>20000||width*height>20_000_000)throw new Error('SVG 输出尺寸过大或无效');
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
   return {width,height,data:canvas.toDataURL('image/png').split(',')[1]};
  },{svg,width}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('SVG 转换超时')),15000);})]);
  abort(signal);return {bytes:Buffer.from(result.data,'base64'),mime:'image/png',width:result.width,height:result.height};
 }catch(error){abort(signal);throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);await page.close().catch(()=>{});scheduleIdle();}
}
async function rasterizeSVG(svg,width,options={}){
 validateSVG(svg);checkDimensions(width,1);abort(options.signal);
 const key=digest(svg,{width,browserPath:options.browserPath||'auto',platform:process.platform,version:2,background:'#ffffff'});const cached=cache.get(key);if(cached)return cached;
 return enqueue(async()=>{abort(options.signal);const current=cache.get(key);if(current)return current;const result=await browserRaster(svg,width,options);abort(options.signal);return cache.set(key,result);},options.signal);
}
async function rasterizeDiagram(kind,source,options={}){
 if(typeof source!=='string'||source.length>100000)throw new Error('图表代码过大');abort(options.signal);
 const scripts={mermaid:['mermaid/mermaid.min.js'],wavedrom:['wavedrom/wavedrom.min.js','wavedrom/skins/default.js'],vega:['vega/vega.min.js'],'vega-lite':['vega/vega.min.js','vega-lite/vega-lite.min.js']}[kind];
 if(!scripts)throw new Error('未支持的图表转换类型');
 let specification;if(kind!=='mermaid'){try{specification=JSON.parse(source);}catch{throw new Error('图表必须使用有效 JSON，不允许 JavaScript 表达式');}}
 if(specification){const inspect=value=>{if(value&&typeof value==='object')for(const [name,item]of Object.entries(value)){if(['url','href','src'].includes(name)&&typeof item==='string'&&!/^data:image\/(?:png|jpeg|webp);base64,/i.test(item))throw new Error('图表不能读取外部资源，请将数据内联到图表 JSON');inspect(item);}};inspect(specification);}
 const key=digest(source,{kind,browserPath:options.browserPath||'auto',version:2});const cached=cache.get(key);if(cached)return cached;
 return enqueue(async()=>{
  abort(options.signal);const found=cache.get(key);if(found)return found;
  const browser=await browserFor(options.browserPath);if(options.signal?.aborted){scheduleIdle();abort(options.signal);}const page=await browser.newPage();let timer;
  const cancel=()=>void page.close().catch(()=>{});options.signal?.addEventListener('abort',cancel,{once:true});
  try{
   await page.setRequestInterception(true);page.on('request',request=>void (request.url().startsWith('data:')||request.url()==='about:blank'?request.continue():request.abort()).catch(()=>{}));
   const nonce=require('node:crypto').randomBytes(18).toString('hex');
   await page.setContent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; font-src 'none'"><body></body>`);
   for(const file of scripts){const code=await fs.readFile(path.join(__dirname,'../vendor/mpe/crossnote/dependencies',file),'utf8');await page.evaluate(({code,nonce})=>{const script=document.createElement('script');script.nonce=nonce;script.textContent=code;document.head.append(script);},{code,nonce});}
   const svg=await Promise.race([page.evaluate(async({kind,source,specification})=>{
    if(kind==='mermaid'){mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'default',fontFamily:'sans-serif',flowchart:{htmlLabels:false},htmlLabels:false,deterministicIds:true});return (await mermaid.render('piper-diagram',source)).svg;}
    if(kind==='wavedrom'){const holder=document.createElement('div');holder.id='WaveDrom_Display_0';document.body.append(holder);WaveDrom.RenderWaveForm(0,specification,'WaveDrom_Display_');const svg=holder.querySelector('svg');if(!svg)throw new Error('WaveDrom did not produce SVG');return svg.outerHTML;}
    const spec=kind==='vega-lite'?vegaLite.compile(specification).spec:specification;const view=new vega.View(vega.parse(spec),{renderer:'none'});try{await view.runAsync();return await view.toSVG();}finally{view.finalize();}
   },{kind,source,specification}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('图表转换超时')),15000);})]);
   abort(options.signal);validateSVG(svg);
   const result=await browserRaster(svg,1600,options);abort(options.signal);return cache.set(key,result);
  }catch(error){abort(options.signal);throw error;}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);await page.close().catch(()=>{});scheduleIdle();}
 },options.signal);
}
module.exports={rasterizeSVG,rasterizeDiagram,disposePublishingBrowser};
