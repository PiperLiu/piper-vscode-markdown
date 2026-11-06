// Attach only to an explicitly launched, isolated VS Code --remote-debugging-port.
// node scripts/inspect-031-preview.js http://127.0.0.1:PORT /absolute/evidence-dir
const fs = require('node:fs');
const path = require('node:path');
const [endpoint, evidence] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint || '') || !path.isAbsolute(evidence || '')) throw new Error('loopback endpoint and absolute evidence path required');
fs.mkdirSync(evidence, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const limit = Date.now() + 300000;
let socket, sequence = 0;
const pending = new Map(), sessions = new Map(), contexts = new Map();
function command(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function evaluate(context, expression) {
  const result = await command('Runtime.evaluate', { expression, contextId: context.id, returnByValue: true }, context.sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function attachTargets() {
  const { targetInfos } = await command('Target.getTargets');
  for (const target of targetInfos.filter(item => ['page', 'iframe'].includes(item.type))) {
    if (sessions.has(target.targetId)) continue;
    const { sessionId } = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    sessions.set(target.targetId, { sessionId, target });
    await command('Runtime.enable', {}, sessionId);
    await command('Page.enable', {}, sessionId).catch(() => {});
  }
}
async function findPreview(stage) {
  await attachTargets();
  for (const context of contexts.values()) {
    try {
      const selector = stage === 'enhanced-cjk' ? '.markdown-preview[data-for="preview"]' : '#content';
      const matches = await evaluate(context, `!!document.querySelector(${JSON.stringify(selector)}) && document.querySelector(${JSON.stringify(selector)}).textContent.includes('PARITY_031_BODY')`);
      if (matches) return context;
    } catch {}
  }
  return null;
}
async function screenshot(name) {
  const main = [...sessions.values()].find(item => item.target.url.includes('workbench.html')) || [...sessions.values()].find(item => item.target.type === 'page');
  const { data } = await command('Page.captureScreenshot', { format: 'png' }, main.sessionId);
  fs.writeFileSync(path.join(evidence, `${name}.png`), Buffer.from(data, 'base64'));
}
(async () => {
  let version;
  while (!version && Date.now() < limit) {
    try { version = await (await fetch(`${endpoint}/json/version`)).json(); } catch { await sleep(200); }
  }
  if (!version) throw new Error('isolated Code debugger did not start');
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.executionContextCreated') {
      const c = msg.params.context;
      if (c.auxData?.isDefault !== false) contexts.set(`${msg.sessionId}:${c.id}`, { id: c.id, sessionId: msg.sessionId, origin: c.origin });
    } else if (msg.method === 'Runtime.executionContextDestroyed') contexts.delete(`${msg.sessionId}:${msg.params.executionContextId}`);
    else if (msg.method === 'Runtime.executionContextsCleared') for (const [key, c] of contexts) { if (c.sessionId === msg.sessionId) contexts.delete(key); }
    if (!msg.id) return;
    const p = pending.get(msg.id); if (!p) return; pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  });
  const completed = new Set();
  while (Date.now() < limit && completed.size < 4) {
    let state;
    try { state = JSON.parse(fs.readFileSync(path.join(evidence, 'stage.json'), 'utf8')); } catch { await sleep(150); continue; }
    if (completed.has(state.stage)) { await sleep(100); continue; }
    if(state.stage==='generic-token'){
      await attachTargets();
      const main=[...sessions.values()].find(item=>item.target.url.includes('workbench.html'));
      let inputContext;
      for(const context of contexts.values()){
        if(context.sessionId!==main?.sessionId)continue;
        try{if(await evaluate(context,`(()=>{const e=document.querySelector('.quick-input-widget input[type=password]');return !!e&&e.getBoundingClientRect().width>0&&e.closest('.quick-input-widget').innerText.includes('127.0.0.1')})()`)){inputContext=context;break;}}catch{}
      }
      if(!inputContext){await sleep(100);continue;}
      const token=process.env.PIPER031_TEST_TOKEN;if(!token?.startsWith('piper-qa-'))throw new Error('synthetic token required');
      await evaluate(inputContext,`(()=>{const e=document.querySelector('.quick-input-widget input[type=password]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(token)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},main.sessionId);
      await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},main.sessionId);
      fs.writeFileSync(path.join(evidence,`${state.stage}.json`),JSON.stringify({status:'PASS',passwordInput:true,syntheticCredential:true,credentialsLogged:false}));
      completed.add(state.stage);continue;
    }
    const preview = await findPreview(state.stage);
    if (!preview) { await sleep(150); continue; }
    const selector = state.stage === 'enhanced-cjk' ? '.markdown-preview[data-for="preview"]' : '#content';
    const data = JSON.parse(await evaluate(preview, `JSON.stringify((()=>{const root=document.querySelector(${JSON.stringify(selector)});return {h1:[...root.querySelectorAll('h1')].map(x=>x.textContent.trim()),toc:[...root.querySelectorAll('a[href^="#"]')].map(x=>x.textContent),strong:[...root.querySelectorAll('strong')].map(x=>x.textContent),em:[...root.querySelectorAll('em')].map(x=>x.textContent),literalEnglish:root.textContent.includes('foo**bar.**baz'),literalCode:[...root.querySelectorAll('code')].some(x=>x.textContent==='这是**原样。**后文'),images:[...root.querySelectorAll('img')].map(i=>({loaded:i.complete&&i.naturalWidth>0,scheme:i.getAttribute('src')?.split(':')[0]})),skipTitle:document.querySelector('#skip-title')?.checked}})())`));
    if (state.stage === 'wechat-toggle' && !data.skipTitle) {
      await evaluate(preview, `document.querySelector('#more').click();document.querySelector('#skip-title').click()`);
      await sleep(250); continue;
    }
    const cjk=data.strong.includes('合法的加粗。')&&data.strong.includes('《书名》')&&data.em.includes('强调。')&&data.literalEnglish&&data.literalCode;
    const omitted=state.stage==='wechat-toggle';
    const title=data.h1.some(x=>x.includes('PARITY_031_TITLE'));
    const pass=cjk&&data.h1.some(x=>x.includes('PARITY_031_LATER_H1'))&&title===!omitted&&data.toc.some(x=>x.includes('PARITY_031_TITLE'))===!omitted&&data.images.length>0&&data.images.every(x=>x.loaded)&&(state.stage==='enhanced-cjk'||data.skipTitle===omitted);
    if(!pass){fs.writeFileSync(path.join(evidence,'pending-dom.json'),JSON.stringify({stage:state.stage,...data},null,2));await sleep(150);continue;}
    await screenshot(state.stage);
    fs.writeFileSync(path.join(evidence,`${state.stage}.json`),JSON.stringify({status:'PASS',...data},null,2));
    console.log(`UI 0.3.1 PASS: ${state.stage}`);completed.add(state.stage);
  }
  if(completed.size!==4)throw new Error('0.3.1 preview inspection deadline reached');
})().catch(error=>{
  console.error(error);
  let stage;try{stage=JSON.parse(fs.readFileSync(path.join(evidence,'stage.json'),'utf8')).stage;}catch{}
  if(stage)fs.writeFileSync(path.join(evidence,`${stage}.json`),JSON.stringify({status:'FAIL',error:String(error.stack||error)},null,2));
  process.exitCode=1;
}).finally(()=>{socket?.close();});
