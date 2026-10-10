import { dateCN } from './engine.js';
export async function fetchJSON(url,headers={},fetcher=fetch){
  let response;
  try {response=await fetcher(url,{headers,signal:AbortSignal.timeout(14000)});}catch{throw new Error('数据源连接失败或超时');}
  if(!response.ok)throw new Error(`数据源HTTP ${response.status}${response.status===429?'：限流，请稍后重试':''}`);
  let data;try{data=await response.json();}catch{throw new Error('数据源返回了无效JSON');}
  return data;
}
export async function collectStock(meta,env={},fetcher=fetch){
  const fetchedAt=new Date().toISOString(),secid=(meta.code.startsWith('6')?'1.':'0.')+meta.code;
  const now=Date.now(),end=dateCN(now).replaceAll('-',''),beg=dateCN(now-370*86400000).replaceAll('-','');
  const quoteURL=`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fltt=2&fields=f43,f57,f58,f86,f116`;
  const reportURL=`https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DMSK_FN_INCOME&columns=SECURITY_CODE,SECURITY_NAME_ABBR,REPORT_DATE,NOTICE_DATE,PARENT_NETPROFIT,TOTAL_OPERATE_INCOME&filter=${encodeURIComponent(`(SECURITY_CODE="${meta.code}")`)}&pageSize=8&pageNumber=1&sortColumns=REPORT_DATE&sortTypes=-1`;
  const historyURL=`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=2&beg=${beg}&end=${end}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`;
  const urls=env.FUYAO_API_KEY?[`https://fuyao.aicubes.cn/api/a-share/prices/snapshot?thscodes=${meta.thscode}`,`https://fuyao.aicubes.cn/api/a-share/financials/income-statements?thscode=${meta.thscode}&period=quarterly&limit=8`,`https://fuyao.aicubes.cn/api/a-share/prices/historical?thscode=${meta.thscode}&interval=1d&start=${now-370*86400000}&end=${now}&adjust=backward`,`https://fuyao.aicubes.cn/api/a-share/valuations/snapshot?thscodes=${meta.thscode}`]:[quoteURL,reportURL,historyURL];
  const settled=await Promise.allSettled(urls.map(url=>fetchJSON(url,env.FUYAO_API_KEY?{'X-api-key':env.FUYAO_API_KEY}:{},fetcher)));
  const stock={...meta,quote:null,reports:[],bars:[],issues:[],evidence:[]};
  for(let i=0;i<settled.length;i++){
    const type=['quote','financials','history','valuation'][i],result=settled[i];
    if(result.status==='rejected'){stock.issues.push(`${type}：${result.reason.message}`);stock.evidence.push({type,url:urls[i],fetchedAt,error:result.reason.message});continue;}
    const raw=result.value,fuyao=Boolean(env.FUYAO_API_KEY),source=fuyao?'扶摇 · 同花顺金融数据':'东方财富公开接口';
    try{
      if(fuyao&&raw.code!==0)throw new Error(`扶摇业务错误 ${raw.code}：${String(raw.message??'').slice(0,80)}`);
      if(i===0){if(fuyao){const q=raw.data?.item?.find(r=>r.thscode===meta.thscode);if(!q||!Number.isFinite(q.last_price)||q.last_price<=0||!Number.isFinite(raw.data.timestamp))throw new Error('行情为空或字段格式异常');stock.quote={price:q.last_price,marketCap:null,timestamp:raw.data.timestamp,date:null,source,asOfBasis:'快照不含交易日，使用同来源历史K线最新日期作为研究截至日；timestamp为上游就绪时间。'};}else{const q=raw.data;if(raw.rc!==0||!q||q.f57!==meta.code||!Number.isFinite(q.f43)||q.f43<=0||!Number.isFinite(q.f86)||q.f86<=0)throw new Error('行情为空或字段格式异常');stock.quote={price:q.f43,marketCap:Number.isFinite(q.f116)?q.f116:null,timestamp:q.f86*1000,date:dateCN(q.f86*1000),source};}}
      if(i===1){const rows=fuyao?raw.data?.item:raw.result?.data;if(!Array.isArray(rows)||!rows.length)throw new Error('没有财务数据');stock.reports=rows.map(r=>fuyao?{period:dateCN(r.period_end_ms),noticeDate:r.report_date_ms?dateCN(r.report_date_ms):null,revenue:r.operating_income,profit:r.parent_holder_net_profit}:{period:r.REPORT_DATE?.slice(0,10),noticeDate:r.NOTICE_DATE?.slice(0,10),revenue:r.TOTAL_OPERATE_INCOME,profit:r.PARENT_NETPROFIT});}
      if(i===2){const rows=fuyao?raw.data?.item:raw.data?.klines;if(!Array.isArray(rows)||!rows.length)throw new Error('没有历史K线');stock.bars=rows.map(r=>fuyao?{date:dateCN(r.date_ms),close:r.close_price}:(()=>{const p=r.split(',');return {date:p[0],close:Number(p[2])};})()).sort((a,b)=>a.date.localeCompare(b.date)).slice(-130);}
      if(i===3){const v=raw.data?.item?.find(r=>r.thscode===meta.thscode);if(!v)throw new Error('估值缺失');stock.valuation={peTTM:v.pe_ttm,timestamp:raw.data.timestamp,source};}
      stock.evidence.push({type,url:urls[i],source,fetchedAt,requestId:raw.request_id??null,raw});
    }catch(error){stock.issues.push(`${type}：${error.message}`);stock.evidence.push({type,url:urls[i],source,fetchedAt,error:error.message,raw});}
  }
  if(env.FUYAO_API_KEY&&stock.quote&&stock.bars.length)stock.quote.date=stock.bars.at(-1).date;
  return stock;
}
