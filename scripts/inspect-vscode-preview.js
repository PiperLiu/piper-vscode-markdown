// Attach only to an explicitly launched, isolated VS Code --remote-debugging-port.
// node scripts/inspect-vscode-preview.js http://127.0.0.1:PORT /absolute/evidence-dir
const fs = require('node:fs');
const path = require('node:path');
const [endpoint, evidence] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint || '') || !path.isAbsolute(evidence || '')) throw new Error('loopback endpoint and absolute evidence path required');
fs.mkdirSync(evidence, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const limit = Date.now() + 180000;
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
async function findPreview() {
  await attachTargets();
  for (const context of contexts.values()) {
    try {
      const matches = await evaluate(context, '!!document.querySelector(".markdown-preview") && document.body.innerText.includes("PARITY_OPENING")');
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
    try { state = JSON.parse(fs.readFileSync(path.join(evidence, 'stage.json'), 'utf8')); } catch { await sleep(200); continue; }
    if (completed.has(state.stage)) { await sleep(100); continue; }
    const preview = await findPreview();
    if (!preview) { await sleep(200); continue; }
    const observation = await evaluate(preview, `JSON.stringify({url:location.href,mermaid:document.querySelectorAll('.mermaid svg').length,math:document.querySelectorAll('.katex').length,mathErrors:document.querySelectorAll('.katex-error').length,images:[...document.querySelectorAll('.markdown-preview img')].map(i=>({src:i.getAttribute('src')?.slice(0,100),loaded:i.complete&&i.naturalWidth>0})),live:document.body.innerText.includes('PARITY_LIVE_EDIT'),scrollTop:document.scrollingElement.scrollTop,scrollHeight:document.scrollingElement.scrollHeight,viewport:innerHeight,background:getComputedStyle(document.querySelector('.markdown-preview')).backgroundColor})`);
    const data = JSON.parse(observation);
    let pass = false;
    if (state.stage === 'initial') pass = data.mermaid >= 2 && data.math >= 3 && data.mathErrors === 0 && data.images.length >= 3 && data.images.every(image => image.loaded);
    if (state.stage === 'live-edit') pass = data.live;
    if (state.stage === 'source-scroll') pass = data.scrollTop > 100 && data.scrollTop + data.viewport >= data.scrollHeight - 250;
    if (state.stage === 'preview-scroll') { await evaluate(preview, 'window.scrollTo(0,0)'); await sleep(750); data.afterScrollTop = await evaluate(preview, 'document.scrollingElement.scrollTop'); pass = data.afterScrollTop < 5; }
    if (!pass) {
      fs.writeFileSync(path.join(evidence, 'pending-dom.json'), JSON.stringify({ stage: state.stage, ...data }, null, 2));
      await sleep(150); continue;
    }
    if (state.stage === 'live-edit') {
      await evaluate(preview, 'window.scrollTo(0,document.scrollingElement.scrollHeight)'); await sleep(250);
    }
    await screenshot(state.stage);
    if (state.stage === 'initial') {
      for (const [label, selector] of [['math', '.katex'], ['assets', '.markdown-preview img'], ['diagrams', '.mermaid']]) {
        await evaluate(preview, `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
        await sleep(350); await screenshot(label);
      }
    }
    if (['initial','live-edit'].includes(state.stage)) { await evaluate(preview, 'window.scrollTo(0,0)'); await sleep(500); }
    fs.writeFileSync(path.join(evidence, `${state.stage}.json`), JSON.stringify({ status: 'PASS', ...data }, null, 2));
    console.log(`WEBVIEW PASS: ${state.stage}`);
    completed.add(state.stage);
  }
  if (completed.size !== 4) throw new Error('Webview inspection deadline reached; see pending-dom.json');
})().catch(error => {
  console.error(error);
  let stage; try { stage = JSON.parse(fs.readFileSync(path.join(evidence, 'stage.json'), 'utf8')).stage; } catch {}
  if (stage) fs.writeFileSync(path.join(evidence, `${stage}.json`), JSON.stringify({ status: 'FAIL', error: String(error.stack || error) }, null, 2));
  process.exitCode = 1;
}).finally(() => { socket?.close(); });
