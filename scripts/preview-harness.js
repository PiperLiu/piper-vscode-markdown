// Disposable browser harness, never included in VSIX.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {render}=require('../src/render'),{previewHTML}=require('../src/preview');
(async()=>{
 const filename=path.resolve(__dirname,'../examples/demo.md');
 const result=await render(fs.readFileSync(filename,'utf8'),{filename,preview:true});
 const message={type:'content',html:result.html,headings:result.headings,characters:result.characters,filename:'demo.md',width:760,scrollSync:true};
 const server=http.createServer((req,res)=>{
 if(['/media/preview.css','/media/preview.js','/media/navigation.js'].includes(req.url)){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');return res.end(fs.readFileSync(path.join(__dirname,'..',req.url)));}
 let html=previewHTML({cspSource:'http://127.0.0.1:8768',asWebviewUri:u=>'http://127.0.0.1:8768'+u.path},{extensionUri:{path:'',with:o=>o}});
 const nonce=html.match(/nonce="([^"]+)"/)[1];
 html=html.replace('<body>', '<body class="vscode-dark">');
 html=html.replace('<script nonce=',`<script nonce="${nonce}">window.messages=[];window.acquireVsCodeApi=()=>({getState:()=>null,setState:s=>{window.savedState=s;},postMessage:m=>{window.messages.push(m);if(m.type==='ready')setTimeout(()=>dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(message).replace(/</g,'\\u003c')}})),10);}});</script><script nonce=`);
 res.setHeader('Content-Type','text/html');res.end(html);
 });server.listen(8768,'127.0.0.1',()=>console.log('Preview harness on http://127.0.0.1:8768'));
})();
