const {execFileSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
if(process.platform!=='darwin')throw new Error('v0.1 目前仅支持 macOS 的富文本剪贴板');
fs.mkdirSync(path.join(__dirname,'../bin'),{recursive:true});
execFileSync('swiftc',['-O','-module-cache-path',process.env.TMPDIR+'/piper-wechat-swift-cache',path.join(__dirname,'../native/clipboard.swift'),'-o',path.join(__dirname,'../bin/clipboard')],{stdio:'inherit'});
