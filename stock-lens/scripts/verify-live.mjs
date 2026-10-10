import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {interpretIntent} from '../src/interpreter.js';
import {collectStock} from '../src/providers.js';
import {screen,defaultConditions,UNIVERSE} from '../src/engine.js';
import {ifindCall} from '../src/ifind.js';
const record={verifiedAt:new Date().toISOString(),ai:[],finance:{},ifind:{}};
for(const text of ['寻找经营改善、估值合理、走势相对稳定的公司','银行行业，市盈率不超过15倍，营收同比至少5%']){const result=await interpretIntent(text,process.env);record.ai.push({input:text,result});console.log('AI',result.mode,result.model??'',result.conditions.length,result.unresolved,result.message);}
const first=await collectStock(UNIVERSE[0],process.env);const result=screen([first],defaultConditions());record.finance={provider:first.quote?.source,code:first.code,asOf:first.quote?.date,status:result.rows[0]?.status,issues:first.issues,requestIds:first.evidence.map(e=>({type:e.type,requestId:e.requestId,source:e.source}))};
const verification=await ifindCall('get_stock_financials','招商银行（600036）2026-06-30累计营业总收入、累计归属于母公司股东净利润；单位元，合并报表。',process.env);record.ifind={source:verification.source,tool:verification.tool,query:verification.query,fetchedAt:verification.fetchedAt,hasAnswer:Boolean(verification.answer),hasIndicatorParams:Object.keys(verification.indicatorParams).length>0,conclusion:'仅确认工具返回成功，尚未自动对齐单位、累计/单季度或判定一致。'};
await mkdir('docs',{recursive:true});await writeFile('docs/LIVE-VALIDATION.json',JSON.stringify(record,null,2));console.log('Live validation saved without credentials or licensed raw financial data.');
