// Inspect a standalone exported HTML in a fresh headless Chromium with remote HTTP blocked.
// node scripts/inspect-export-html.js /absolute/export.html /absolute/evidence-dir [chrome-executable]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const wechat = process.env.PIPER_HTML_MODE === 'wechat';
const [source, evidence, executable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] = process.argv.slice(2);
if (!source || !evidence || !path.isAbsolute(source) || !path.isAbsolute(evidence)) throw new Error('absolute source and evidence paths required');
fs.mkdirSync(evidence, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'piper-html-inspect-'));
const chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const deadline = setTimeout(() => { console.error('HTML inspection timed out'); chrome.kill(); process.exitCode = 1; }, 60000);
let socket, sequence = 0;
const pending = new Map();
async function command(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
}
(async () => {
  const endpoint = await new Promise((resolve, reject) => {
    let buffer = '';
    chrome.stderr.on('data', data => { buffer += data; const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    chrome.on('error', reject); chrome.on('exit', code => reject(new Error(`Chrome exited ${code}`)));
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (!message.id) return; const listener = pending.get(message.id); if (!listener) return; pending.delete(message.id); message.error ? listener.reject(new Error(message.error.message)) : listener.resolve(message.result); });
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  await command('Page.enable', {}, sessionId);
  await command('Network.enable', {}, sessionId);
  if (!wechat) await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] }, sessionId);
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Page.navigate', { url: pathToFileURL(source).href }, sessionId);
  let observation;
  for (let n = 0; n < 120; n++) {
    await new Promise(resolve => setTimeout(resolve, 150));
    const result = await command('Runtime.evaluate', { expression: `JSON.stringify({ready:document.readyState, fonts:document.fonts.status, images:[...document.images].map(i=>({src:i.getAttribute('src').slice(0,70), loaded:i.complete&&i.naturalWidth>0})), mermaid:document.querySelectorAll('.mermaid svg').length, math:document.querySelectorAll('.katex').length, mathErrors:document.querySelectorAll('.katex-error').length, toc:[...document.querySelectorAll('a[href^="#"]')].map(a=>({label:a.textContent.trim(), target:!!document.getElementById(decodeURIComponent(a.hash.slice(1)))})), headingCount:document.querySelectorAll('h1,h2,h3').length, includesEnd:document.body.innerText.includes(${JSON.stringify(wechat ? 'PARITY_WECHAT_END' : 'PARITY_END')})})`, returnByValue: true }, sessionId);
    if (result.result.value) observation = JSON.parse(result.result.value);
    if (observation?.ready === 'complete' && observation.fonts === 'loaded' && observation.mermaid >= (wechat ? 0 : 2) && observation.images.every(image => image.loaded)) break;
  }
  observation.offline = !wechat;
  observation.source = source;
  observation.pass = observation.mermaid >= (wechat ? 0 : 2) && observation.math >= (wechat ? 0 : 3) && observation.mathErrors === 0 && observation.images.length >= (wechat ? 5 : 3) && observation.images.every(image => image.loaded) && observation.toc.length >= (wechat ? 4 : 20) && observation.toc.every(link => link.target) && observation.includesEnd;
  fs.writeFileSync(path.join(evidence, 'html-dom.json'), JSON.stringify(observation, null, 2));
  for (const [name, expression] of [['top', 'window.scrollTo(0,0)'], ['diagrams', `document.querySelector('.mermaid')?.scrollIntoView()`], ['code', `document.querySelector('pre:not(.mermaid)')?.scrollIntoView()`]]) {
    await command('Runtime.evaluate', { expression }, sessionId);
    const { data } = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
    fs.writeFileSync(path.join(evidence, `${name}.png`), Buffer.from(data, 'base64'));
  }
  if (wechat) {
    const { cssContentSize } = await command('Page.getLayoutMetrics', {}, sessionId);
    const { data } = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } }, sessionId);
    fs.writeFileSync(path.join(evidence, 'full-article.png'), Buffer.from(data, 'base64'));
  }
  console.log(JSON.stringify(observation));
  if (!observation.pass) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(deadline); socket?.close(); chrome.kill(); });
