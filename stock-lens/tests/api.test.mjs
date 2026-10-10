import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {createHandler} from '../src/server.js';import {collectStock,fetchJSON} from '../src/providers.js';
const snapshot=JSON.parse(await readFile(new URL('../data/snapshot.json',import.meta.url),'utf8'));
const handler=createHandler(snapshot,{'/index.html':{body:'<!doctype html>',type:'text/html'}});
test('配置接口只暴露能力状态，不输出密钥',async()=>{const res=await handler(new Request('https://example.test/api/config'),{AI_API_KEY:'secret-test',FUYAO_API_KEY:'secret-data'});const body=await res.text();assert.ok(!body.includes('secret'));assert.equal(JSON.parse(body).ai,true);});
test('API拒绝跨站、过大请求和无效刷新批次',async()=>{
  const r=await handler(new Request('https://example.test/api/interpret',{method:'POST',headers:{origin:'https://attacker.test'},body:'{}'}));assert.equal(r.status,403);
  const huge=await handler(new Request('https://example.test/api/interpret',{method:'POST',body:' '.repeat(20001)}));assert.equal(huge.status,413);
  const invalid=await handler(new Request('https://example.test/api/refresh',{method:'POST',body:'{"offset":1}'}));assert.equal(invalid.status,400);
});
test('限流、无效JSON与网络异常明确返回错误',async()=>{
  await assert.rejects(fetchJSON('https://example.test',{},async()=>new Response('{}',{status:429})),/429/);
  await assert.rejects(fetchJSON('https://example.test',{},async()=>new Response('html')),/JSON/);
  await assert.rejects(fetchJSON('https://example.test',{},async()=>{throw new Error('network');}),/连接失败/);
});
test('扶摇空数据与无效Key不能生成正常记录或泄露密钥',async()=>{const s=await collectStock({code:'600036',thscode:'600036.SH'},{FUYAO_API_KEY:'fake-secret'},async()=>new Response('{"code":2001,"message":"unauthorized"}'));assert.equal(s.quote,null);assert.equal(s.issues.length,4);assert.ok(!JSON.stringify(s).includes('fake-secret'));});
test('静态资源包含CSP，未知文件不泄露目录',async()=>{const r=await handler(new Request('https://example.test/'));assert.equal(r.status,200);assert.ok(r.headers.get('Content-Security-Policy').includes("script-src 'self'"));assert.equal((await handler(new Request('https://example.test/.env'))).status,404);});
test('iFinD报告期参数与股票必须匹配白名单',async()=>{const r=await handler(new Request('https://example.test/api/ifind-verify',{method:'POST',body:'{"code":"000000","period":"2026-06-30"}'}));assert.equal(r.status,400);});
