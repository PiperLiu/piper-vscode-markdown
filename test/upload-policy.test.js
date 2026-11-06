'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {retryAfterMilliseconds,requestWithRateLimitRetry}=require('../src/upload-policy');

test('Retry-After honors integer seconds and HTTP dates; malformed values never become accidental dates',()=>{
 const now=Date.parse('Sat, 07 Nov 2026 12:00:00 GMT');
 assert.equal(retryAfterMilliseconds('12',now),12000);
 assert.equal(retryAfterMilliseconds(' 0 ',now),0);
 assert.equal(retryAfterMilliseconds('Sat, 07 Nov 2026 12:00:03 GMT',now),3000);
 assert.equal(retryAfterMilliseconds('Saturday, 07-Nov-26 12:00:03 GMT',now),3000);
 assert.equal(retryAfterMilliseconds('Sat Nov  7 12:00:03 2026',now),3000);
 assert.equal(retryAfterMilliseconds('Saturday, 07-Nov-75 12:00:00 GMT',now),Date.parse('2075-11-07T12:00:00Z')-now);
 assert.equal(retryAfterMilliseconds('Saturday, 07-Nov-77 12:00:00 GMT',now),0);
 assert.equal(retryAfterMilliseconds('Sat, 07 Nov 2026 11:00:00 GMT',now),0);
 assert.equal(retryAfterMilliseconds('9'.repeat(400),now),Number.MAX_SAFE_INTEGER);
 for(const value of [null,undefined,'','later','-1','1.5','1e2','Sat, invalid GMT'])assert.equal(retryAfterMilliseconds(value,now),undefined,value);
});

test('an absent Retry-After uses bounded backoff; cancellation interrupts the countdown immediately',async()=>{
 let calls=0;const progress=[],controller=new AbortController();
 await assert.rejects(requestWithRateLimitRetry(async()=>{calls++;return new Response('private response',{status:429});},controller.signal,value=>{progress.push(value);if(value.state==='retrying')controller.abort();}),{name:'AbortError'});
 assert.equal(calls,1);
 const retry=progress.find(value=>value.state==='retrying');assert.equal(retry.retry,1);assert.equal(retry.maxRetries,3);assert.ok(retry.retryAfterMs>0&&retry.retryAfterMs<=1000);
 assert.doesNotMatch(retry.message,/private response|credential|Token/);
});
