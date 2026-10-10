import {mkdir,writeFile} from 'node:fs/promises';
import {UNIVERSE,screen,defaultConditions} from '../src/engine.js';
import {collectStock} from '../src/providers.js';
await mkdir('data',{recursive:true});const stocks=[];
for(let start=0;start<UNIVERSE.length;start+=3){const batch=await Promise.all(UNIVERSE.slice(start,start+3).map(meta=>collectStock(meta,process.env)));stocks.push(...batch);for(const s of batch)console.log(s.code,s.name,s.quote?.date??'无行情',s.reports.length,s.bars.length,s.issues.join('；'));}
const snapshot={schemaVersion:1,id:'snapshot-'+new Date().toISOString(),fetchedAt:new Date().toISOString(),scope:'固定24只A股研究样本；人工选取覆盖不同经营与波动情况，不代表指数成分或全市场',stocks};
const output=process.env.SNAPSHOT_OUTPUT||(process.env.FUYAO_API_KEY?'data/fuyao-private.json':'data/snapshot.json');
await writeFile(output,JSON.stringify(snapshot));console.log('已保存快照',output);
const r=screen(stocks,defaultConditions());console.log('默认筛选',JSON.stringify({included:r.included.map(s=>s.name),excluded:r.excluded.length,unknown:r.unknown.map(s=>({name:s.name,issues:s.issues,missing:s.checks.filter(c=>c.status==='unknown').map(c=>c.condition.field)}))}));
