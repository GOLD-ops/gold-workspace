import test from 'node:test';import assert from 'node:assert/strict';
import {parseIntent,interpretIntent,validateAIResult} from '../src/interpreter.js';
import { validateConditions } from '../src/engine.js';
test('主意图仅生成四项条件，经营改善不附加利润增速，保留两种可选澄清',()=>{const p=parseIntent('经营改善、估值合理、走势相对稳定');assert.equal(p.conditions.length,4);assert.equal(p.questions.length,2);assert.equal(p.unresolved.length,0);assert.ok(!p.conditions.some(c=>c.field==='acceleration'));});
test('用户明确要求利润增速时仍可解释并执行高级指标',()=>{for(const text of ['经营改善，利润增速提升至少3个百分点，估值合理','利润增速改善至少3个百分点']){const p=parseIntent(text),c=p.conditions.find(c=>c.field==='acceleration');assert.equal(c.value,3);assert.equal(c.op,'gte');}});
test('AI自作主张添加高级指标会回退，防止默认逻辑复杂化',async()=>{const fetcher=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({conditions:[{field:'revenueGrowth',op:'gte',value:0},{field:'profitGrowth',op:'gte',value:0},{field:'acceleration',op:'gte',value:0}],unresolved:[],assumptions:[]})}}]}));const p=await interpretIntent('经营改善',{AI_API_KEY:'test-key'},fetcher);assert.equal(p.mode,'fallback');assert.ok(!p.conditions.some(c=>c.field==='acceleration'));});
test('明确条件、行业范围与AND冲突可识别',()=>{const p=parseIntent('银行行业，市盈率不超过10倍，市盈率至少20倍，营收同比至少5%');assert.equal(p.industry,'银行');assert.equal(p.conditions.length,3);assert.ok(p.conflicts.some(e=>e.includes('冲突')));});
test('不支持的ROE、全市场、行业相对估值不能静默忽略',()=>{for(const text of ['ROE至少10%，市盈率不超过20倍','全市场低估值股票','寻找相对估值低的公司'])assert.ok(parseIntent(text).unresolved.length>0);});
test('收益承诺、预测与直接买卖建议在模型调用前被阻止',async()=>{for(const text of ['稳赚翻倍的股票','明天必涨的股票','告诉我买入哪只']){let called=false;const result=await interpretIntent(text,{AI_API_KEY:'test-key'},async()=>{called=true;});assert.equal(result.mode,'blocked');assert.equal(called,false);}});
test('未知AI字段与幻造阈值必须拒绝',()=>{assert.throws(()=>validateAIResult({conditions:[{field:'targetPrice',op:'gte',value:100}],unresolved:[],assumptions:[]}));});
test('AI401或非JSON显示失败并切回规则，不能伪称AI完成',async()=>{const p=await interpretIntent('估值合理',{AI_API_KEY:'test-key'},async()=>new Response('{}',{status:401}));assert.equal(p.mode,'fallback');assert.match(p.message,/401/);});
test('AI遗漏明确阈值会被拦截，保留原表达',async()=>{const fetcher=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({conditions:[{field:'pe',op:'lte',value:30}],unresolved:[],assumptions:[]})}}]}));const p=await interpretIntent('市盈率不超过15倍',{AI_API_KEY:'test-key'},fetcher);assert.equal(p.mode,'fallback');assert.equal(p.conditions[0].value,15);});
test('有效AI响应通过字段白名单，保留模型追踪记录与行业',async()=>{const fetcher=async()=>new Response(JSON.stringify({id:'test-request',choices:[{message:{content:JSON.stringify({conditions:[{field:'pe',op:'lte',value:15}],unresolved:[],assumptions:['绝对口径']})}}],usage:{total_tokens:100}}));const p=await interpretIntent('银行行业市盈率不超过15倍',{AI_API_KEY:'test-key'},fetcher);assert.equal(p.mode,'llm');assert.equal(p.industry,'银行');assert.equal(p.trace.requestId,'test-request');});

const aiResult=(conditions,unresolved=[])=>({conditions,unresolved,assumptions:[]});
const aiFetcher=(result,id='diagnostic-request')=>async()=>new Response(JSON.stringify({id,choices:[{message:{content:JSON.stringify(result)}}]}));

test('只指定行业的合法空条件进入澄清状态，执行引擎仍拒绝无指标筛选',async()=>{
  const p=await interpretIntent('银行行业',{AI_API_KEY:'test-key'},aiFetcher(aiResult([])));
  assert.equal(p.mode,'llm');assert.equal(p.industry,'银行');assert.equal(p.conditions.length,0);
  assert.ok(p.unresolved.some(x=>x.includes('至少一个可执行指标')));
  assert.deepEqual(validateConditions(p.conditions),['至少启用一条条件']);
  assert.deepEqual(p.trace.engineValidation,['至少启用一条条件']);
  assert.equal(p.trace.requestId,'diagnostic-request');assert.equal(p.diagnostic,undefined);
});

test('仅提未支持指标时保留未支持要求，不把空条件误报为非法字段',async()=>{
  const p=await interpretIntent('ROE至少10%',{AI_API_KEY:'test-key'},aiFetcher(aiResult([],['ROE未接入'])));
  assert.equal(p.mode,'llm');assert.equal(p.conditions.length,0);
  assert.ok(p.unresolved.includes('ROE未接入'));assert.ok(p.unresolved.some(x=>x.includes('至少一个可执行指标')));
  assert.doesNotMatch(p.message,/未知字段|非法阈值|解析失败/);
});

test('纯数字字符串显式记录转换，保留用户明确阈值和严格运算符',async()=>{
  const p=await interpretIntent('市盈率低于15倍',{AI_API_KEY:'test-key'},aiFetcher(aiResult([{field:'pe',op:'lt',value:'15'}])));
  assert.equal(p.mode,'llm');assert.equal(p.conditions[0].value,15);assert.equal(p.conditions[0].op,'lt');
  assert.deepEqual(p.normalizations,[{index:1,field:'pe',from:'15',value:15,unit:'倍'}]);
  assert.ok(p.assumptions.some(x=>x.includes('阈值未作调整')));
  assert.deepEqual(p.trace.engineValidation,[]);
});

test('带单位、空串、布尔值和非纯数字阈值不能自动转换',()=>{
  for(const value of ['25倍','30%','',true,'1e2','25,000',null]){
    assert.throws(()=>validateAIResult(aiResult([{field:'pe',op:'lte',value}])),error=>error.code==='AI_NON_NUMERIC_THRESHOLD');
  }
});

test('未知字段、非法比较方式和越界阈值给出不同诊断并保留失败requestId',async()=>{
  const cases=[
    [{field:'ROE',op:'gte',value:10},'AI_UNKNOWN_FIELD',/ROE/],
    [{field:'pe',op:'between',value:25},'AI_INVALID_OPERATOR',/between/],
    [{field:'pe',op:'lte',value:-10},'AI_THRESHOLD_RANGE',/0～1000/]
  ];
  for(const [condition,code,message]of cases){
    const p=await interpretIntent('估值合理',{AI_API_KEY:'test-key'},aiFetcher(aiResult([condition]),`failed-${code}`));
    assert.equal(p.mode,'fallback');assert.equal(p.diagnostic.code,code);assert.match(p.message,message);
    assert.equal(p.trace.requestId,`failed-${code}`);assert.equal(p.trace.errorCode,code);
    assert.ok(p.trace.validationErrors.length>0);assert.equal(p.conditions[0].field,'pe');assert.equal(p.conditions[0].value,25);
  }
});

test('原型属性不属于金融字段或运算符白名单',()=>{
  assert.throws(()=>validateAIResult(aiResult([{field:'constructor',op:'gte',value:10}])),error=>error.code==='AI_UNKNOWN_FIELD');
  assert.throws(()=>validateAIResult(aiResult([{field:'pe',op:'toString',value:10}])),error=>error.code==='AI_INVALID_OPERATOR');
});

test('模型结构错误与条件超量可具体诊断，null条件不会变成网络异常',()=>{
  assert.throws(()=>validateAIResult({conditions:[],unresolved:[]}),error=>error.code==='AI_SCHEMA');
  assert.throws(()=>validateAIResult(aiResult([null])),error=>error.code==='AI_CONDITION_SCHEMA');
  assert.throws(()=>validateAIResult(aiResult(Array.from({length:21},()=>({field:'pe',op:'lte',value:25})))),error=>error.code==='AI_TOO_MANY_CONDITIONS');
});

test('合法的相互冲突条件保留给用户修改，不误报AI解析失败',()=>{
  const p=validateAIResult(aiResult([{field:'pe',op:'gte',value:30},{field:'pe',op:'lte',value:15}]));
  assert.equal(p.mode,'llm');assert.equal(p.conditions.length,2);assert.ok(p.conflicts[0].includes('条件冲突'));
});

test('明确数字或严格比较方式被AI更改时独立诊断，并保留原表达',async()=>{
  const p=await interpretIntent('市盈率低于15倍',{AI_API_KEY:'test-key'},aiFetcher(aiResult([{field:'pe',op:'lte',value:15}])));
  assert.equal(p.mode,'fallback');assert.equal(p.diagnostic.code,'AI_EXPLICIT_CONDITION_CHANGED');
  assert.deepEqual(p.diagnostic.details,['市盈率 TTM<15倍']);assert.equal(p.conditions[0].op,'lt');
});

test('AI接口失败、无内容与非JSON分别诊断，接口requestId仍可追溯',async()=>{
  const cases=[
    [async()=>new Response('{}',{status:429,headers:{'x-request-id':'rate-limit-request'}}),'AI_HTTP',/429/,'rate-limit-request'],
    [async()=>new Response(JSON.stringify({id:'empty-content',choices:[]})),'AI_CONTENT_MISSING',/没有返回条件内容/,'empty-content'],
    [async()=>new Response(JSON.stringify({id:'non-json-content',choices:[{message:{content:'不是JSON'}}]})),'AI_CONTENT_JSON',/不是有效JSON/,'non-json-content'],
    [async()=>new Response('not-json'),'AI_RESPONSE_JSON',/响应无法读取为JSON/,null]
  ];
  for(const [fetcher,code,message,requestId]of cases){
    const p=await interpretIntent('估值合理',{AI_API_KEY:'test-key'},fetcher);
    assert.equal(p.mode,'fallback');assert.equal(p.diagnostic.code,code);assert.match(p.message,message);assert.equal(p.trace.requestId,requestId);
  }
});

test('网络与超时提示不回显底层异常中的凭据',async()=>{
  for(const [name,code]of [['Error','AI_NETWORK'],['TimeoutError','AI_TIMEOUT']]){
    const p=await interpretIntent('估值合理',{AI_API_KEY:'test-key'},async()=>{throw Object.assign(new Error('failure with test-key'),{name});});
    assert.equal(p.diagnostic.code,code);assert.doesNotMatch(JSON.stringify(p),/test-key/);
  }
});
