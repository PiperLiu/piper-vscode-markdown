'use strict';
const crypto=require('node:crypto');
class ByteCache{
 constructor(maxBytes=32*1024*1024,maxEntries=128){this.maxBytes=maxBytes;this.maxEntries=maxEntries;this.entries=new Map();this.bytes=0;}
 get(key){const value=this.entries.get(key);if(value){this.entries.delete(key);this.entries.set(key,value);}return value;}
 set(key,value){const bytes=value.bytes.length;if(bytes>this.maxBytes)return value;const old=this.entries.get(key);if(old){this.bytes-=old.bytes.length;this.entries.delete(key);}while(this.entries.size&&(this.bytes+bytes>this.maxBytes||this.entries.size>=this.maxEntries)){const first=this.entries.keys().next().value;this.bytes-=this.entries.get(first).bytes.length;this.entries.delete(first);}this.entries.set(key,value);this.bytes+=bytes;return value;}
 clear(){this.entries.clear();this.bytes=0;}
}
const digest=(...parts)=>{const hash=crypto.createHash('sha256');for(const part of parts)hash.update(typeof part==='string'||Buffer.isBuffer(part)?part:JSON.stringify(part));return hash.digest('hex');};
module.exports={ByteCache,digest};
