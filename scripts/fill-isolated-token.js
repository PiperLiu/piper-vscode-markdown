// Fill only the password prompt in the explicitly launched isolated Code debugger.
// No credentials or input contents are logged or included in screenshots.
const fs=require('node:fs'),path=require('node:path');
const [endpoint,privateConfig,evidence]=process.argv.slice(2);
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint||'')||![privateConfig,evidence].every(p=>p&&path.isAbsolute(p)))throw new Error('explicit loopback and private paths required');
if(fs.statSync(privateConfig).mode&0o077)throw new Error('private config permissions must be 0600');
const privateValues=JSON.parse(fs.readFileSync(privateConfig,'utf8'));
const expectedHost=new URL(privateValues.uploadUrl).host;
let secret=privateValues.token;delete privateValues.token;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let socket,seq=0;const pending=new Map();
function cmd(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
(async()=>{
 const deadline=Date.now()+120000;let target;
 while(Date.now()<deadline&&!target){try{const targets=await(await fetch(endpoint+'/json/list')).json();target=targets.find(t=>t.url.includes('workbench.html')&&t.title.includes('[Extension Development Host]'));}catch{}if(!target)await wait(150);}
 if(!target)throw new Error('isolated Code debugger did not start');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(new Error('debugger command failed')):p.resolve(m.result);});
 while(Date.now()<deadline){
  const result=await cmd('Runtime.evaluate',{expression:`(()=>{const e=document.querySelector('.quick-input-widget input[type=password]');return !!e&&e.getBoundingClientRect().width>0&&e.closest('.quick-input-widget').innerText.includes(${JSON.stringify(expectedHost)})})()`,returnByValue:true});
  if(!result.result.value){await wait(150);continue;}
  await cmd('Runtime.evaluate',{expression:`(()=>{const e=document.querySelector('.quick-input-widget input[type=password]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(secret)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,returnByValue:true});
  secret='';
  fs.writeFileSync(path.join(evidence,'token-ui.json'),JSON.stringify({status:'PASS',passwordInput:true,credentialsLogged:false}));
  await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await cmd('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  console.log('Isolated password prompt submitted.');return;
 }
 throw new Error('isolated password prompt did not appear');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{secret='';socket?.close();});
