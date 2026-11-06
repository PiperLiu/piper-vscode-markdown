const {spawn}=require('node:child_process');
function runClipboard(helper,payload,args){return new Promise((resolve,reject)=>{
 const child=spawn(helper,args,{stdio:['pipe','ignore','pipe']});let settled=false;
 const done=e=>{if(settled)return;settled=true;clearTimeout(timer);e?reject(e):resolve();};
 const timer=setTimeout(()=>{child.kill();done(new Error('剪贴板写入超时'));},10000);
 child.on('error',done);child.on('close',code=>done(code===0?null:new Error('系统剪贴板写入失败')));child.stdin.on('error',done);child.stderr.resume();child.stdin.end(JSON.stringify(payload));
});}
function writeClipboard(helper,payload){return runClipboard(helper,payload,[]);}
// The native helper writes and verifies a fresh named pasteboard, never NSPasteboard.general.
function verifyClipboard(helper,payload){return runClipboard(helper,payload,['--verify']);}
module.exports={writeClipboard,verifyClipboard};
