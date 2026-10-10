import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultConditions,screen,validateConditions,historyMetrics,financialMetrics,growth,sensitivity,normalizeStock} from '../src/engine.js';
const fixture=JSON.parse(await readFile(new URL('../data/snapshot.json',import.meta.url),'utf8'));
const now=Date.parse('2026-10-10T12:00:00+08:00');
const cond=(field,op,value,id='t')=>({id,field,op,value,enabled:true});
test('真实公开快照主链路：9入选、14排除、1待核验，逐项原始证据可用',()=>{
  const r=screen(fixture.stocks,defaultConditions(),{now});
  assert.equal(r.included.length,9);assert.equal(r.excluded.length,14);assert.equal(r.unknown.length,1);
  assert.equal(r.unknown[0].code,'601012');
  for(const s of r.included){assert.ok(s.checks.every(c=>c.status==='pass'));assert.ok(s.evidence.length>=3);assert.ok(s.evidence.every(e=>e.url&&e.fetchedAt&&e.raw));}
});
test('独立财报数值核对：招商银行营收、利润同比与TTM分母',()=>{
  const s=normalizeStock(fixture.stocks.find(s=>s.code==='600036'),now);
  assert.equal(s.fin.latest.revenue,178181000000);assert.equal(s.fin.latest.profit,76445000000);
  const prior=s.reports.find(r=>r.period==='2025-06-30');
  assert.ok(Math.abs(s.metrics.revenueGrowth-((178181000000/prior.revenue-1)*100))<1e-10);
  assert.ok(Math.abs(s.metrics.pe-s.quote.marketCap/(s.fin.annual.profit+76445000000-prior.profit))<1e-10);
});
test('边界运算严格区分 > 与 ≥',()=>{
  const cs=[cond('pe','gt',25,'a'),cond('pe','lte',25,'b')];assert.ok(validateConditions(cs).some(e=>e.includes('冲突')));
  assert.equal(validateConditions([cond('pe','gte',25,'a'),cond('pe','lte',25,'b')]).length,0);
});
test('非法字段、NaN、超范围、全禁用、重复ID均拒绝',()=>{
  for(const cs of [[cond('roe','gte',10)],[cond('pe','lte',NaN)],[cond('pe','lte',-1)],[{...cond('pe','lte',10),enabled:false}],[cond('pe','lte',10),cond('pe','gte',2)]])assert.ok(validateConditions(cs).length>0);
});
test('财报按披露日进行点时选择，未来披露不能用于当日研究',()=>{
  const reports=[{period:'2026-06-30',noticeDate:'2026-08-29',profit:200,revenue:500},{period:'2026-03-31',noticeDate:'2026-04-29',profit:80,revenue:200}];
  assert.equal(financialMetrics(reports,'2026-08-01').period,'2026-03-31');
});
test('负基期与零基期不制造增长率',()=>{assert.equal(growth(10,-20),null);assert.equal(growth(10,0),null);assert.equal(growth(null,20),null);assert.equal(growth(30,20),50);});
test('负PE不能当作低估值入选',()=>{
  const stock=structuredClone(fixture.stocks[0]);stock.valuation={peTTM:-5,timestamp:now};
  const r=screen([stock],[cond('pe','lte',15)],{now});assert.equal(r.unknown.length,1);assert.equal(r.rows[0].checks[0].value,null);
});
test('缺少K线/重复日期/非正价格不生成正常波动率',()=>{
  const bars=fixture.stocks[0].bars.slice(-61);
  assert.equal(historyMetrics(bars.slice(1)).volatility,null);
  assert.equal(historyMetrics(bars.map((b,i)=>i===0?{...b,date:bars[1].date}:b)).volatility,null);
  assert.equal(historyMetrics(bars.map((b,i)=>i===0?{...b,close:0}:b)).volatility,null);
});
test('波动率公式与独立双遍参考实现一致',()=>{
  const bars=fixture.stocks[0].bars.slice(-61),r=[];for(let i=1;i<bars.length;i++)r.push(Math.log(bars[i].close)-Math.log(bars[i-1].close));
  const mean=r.reduce((a,b)=>a+b)/r.length;let squares=0;for(const v of r)squares+=(v-mean)**2;
  const reference=Math.sqrt(squares/(r.length-1))*Math.sqrt(252)*100;
  assert.ok(Math.abs(historyMetrics(bars).volatility-reference)<1e-9);
});
test('过期数据与接口失败优先进入待核验，已知失败条件仍保留',()=>{
  const s=structuredClone(fixture.stocks[0]);s.issues=['API 429'];
  const r=screen([s],[cond('pe','lte',1)],{now});assert.equal(r.unknown.length,1);assert.equal(r.rows[0].checks[0].status,'fail');
  assert.equal(screen([fixture.stocks[0]],defaultConditions(),{now:Date.parse('2026-11-01')}).unknown.length,1);
});
test('未来行情日期和早于研究时点的估值拒绝静默放行',()=>{
  const s=structuredClone(fixture.stocks[0]);s.quote.date='2026-10-11';assert.equal(screen([s],[cond('pe','lte',25)],{now}).unknown.length,1);
  s.quote.date='2026-10-09';s.valuation={peTTM:5,timestamp:Date.parse('2026-10-08')};assert.equal(screen([s],[cond('pe','lte',25)],{now}).unknown.length,1);
});
test('反事实分析：PE 25→15，9→7，移出五粮液与中国神华',()=>{
  const r=sensitivity(fixture.stocks,defaultConditions(),'pe',15,{now});assert.equal(r.before,9);assert.equal(r.after,7);assert.deepEqual(r.removed.map(s=>s.code).sort(),['000858','601088']);assert.equal(r.unknown,1);
});
test('收紧PE上限时，候选必为原候选子集',()=>{
  let previous=new Set(screen(fixture.stocks,[cond('pe','lte',100)],{now}).included.map(s=>s.code));
  for(let cap=95;cap>=5;cap-=5){const next=new Set(screen(fixture.stocks,[cond('pe','lte',cap)],{now}).included.map(s=>s.code));for(const c of next)assert.ok(previous.has(c));previous=next;}
});
