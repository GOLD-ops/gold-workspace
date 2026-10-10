export const FIELDS = {
  revenueGrowth: { label: '营收同比', unit: '%', group: '经营', min: -100, max: 1000, definition: '最新已披露累计报告期营业总收入相对上年同期的增长率；负基期或零基期不计算。' },
  profitGrowth: { label: '归母净利润同比', unit: '%', group: '经营', min: -1000, max: 10000, definition: '最新已披露累计报告期归母净利润相对上年同期的增长率；负基期或零基期不计算。' },
  acceleration: { label: '利润增速改善', unit: '百分点', group: '经营', min: -1000, max: 1000, definition: '最新累计报告期归母净利润同比 − 上一个累计报告期同比。累计期间不同，仅作为改善代理，不代表单季度利润加速。' },
  pe: { label: '市盈率 TTM', unit: '倍', group: '估值', min: 0, max: 1000, definition: '扶摇模式直接使用估值快照pe_ttm；公开快照模式为供应商总市值 / 最近12个月归母净利润（上年度全年 + 本年度累计 − 上年同期累计）。负值或零值记为无意义。两种来源不混算，具体口径见股票证据。' },
  volatility: { label: '60日年化波动率', unit: '%', group: '走势', min: 0, max: 300, definition: '最近61个交易日后复权收盘价的60个对数收益，样本标准差 × √252 × 100；不足61条、重复日期、非正价格则缺失。' },
  drawdown: { label: '60日最大回撤', unit: '%', group: '走势', min: 0, max: 100, definition: '最近61个交易日后复权收盘价，max(1 − 当日收盘 / 截至当日最高收盘) × 100；表示损失幅度的正数。' },
  marketCap: { label: '总市值', unit: '亿元', group: '范围', min: 0, max: 100000, definition: '供应商行情总市值（元） / 100,000,000，不等于自由流通市值。' }
};
export const OPS = { gte: '≥', lte: '≤', gt: '>', lt: '<' };
export const UNIVERSE = [
  ['600036','招商银行','银行'],['601398','工商银行','银行'],['601166','兴业银行','银行'],['000001','平安银行','银行'],
  ['600519','贵州茅台','食品饮料'],['000858','五粮液','食品饮料'],['600887','伊利股份','食品饮料'],['000333','美的集团','家电'],
  ['000651','格力电器','家电'],['600690','海尔智家','家电'],['600900','长江电力','公用事业'],['601088','中国神华','煤炭'],
  ['600011','华能国际','公用事业'],['601318','中国平安','保险'],['600030','中信证券','证券'],['600276','恒瑞医药','医药'],
  ['300760','迈瑞医疗','医药'],['300750','宁德时代','电池'],['002594','比亚迪','汽车'],['601012','隆基绿能','光伏'],
  ['600309','万华化学','化工'],['002475','立讯精密','电子'],['600028','中国石化','石油石化'],['601857','中国石油','石油石化']
].map(([code,name,industry])=>({ code, name, industry, thscode: code + (code.startsWith('6')?'.SH':'.SZ') }));
export const defaultConditions = () => [
  { id: 'revenue', field: 'revenueGrowth', op: 'gte', value: 0, enabled: true, origin: '经营改善 → 收入不下降（需确认）' },
  { id: 'profit', field: 'profitGrowth', op: 'gte', value: 0, enabled: true, origin: '经营改善 → 利润不下降（需确认）' },
  { id: 'pe', field: 'pe', op: 'lte', value: 25, enabled: true, origin: '估值合理 → 绝对市盈率≤25倍（需确认）' },
  { id: 'vol', field: 'volatility', op: 'lte', value: 30, enabled: true, origin: '走势相对稳定 → 年化波动率≤30%（需确认）' }
];
export function validateConditions(conditions) {
  const errors=[];
  if (!Array.isArray(conditions) || conditions.length > 20) return ['条件必须为数组且不超过20条'];
  if (!conditions.some(c=>c?.enabled)) errors.push('至少启用一条条件');
  const ids=new Set();
  for (const c of conditions) {
    if (!c || !FIELDS[c.field] || !OPS[c.op] || !Number.isFinite(c.value) || typeof c.enabled !== 'boolean') { errors.push('存在未知字段、非法运算符或非数值阈值'); continue; }
    if (!c.id || ids.has(c.id)) errors.push('条件ID必须唯一'); ids.add(c.id);
    const f=FIELDS[c.field]; if(c.value<f.min||c.value>f.max) errors.push(`${f.label}阈值应在${f.min}～${f.max}${f.unit}`);
  }
  for (const field of Object.keys(FIELDS)) {
    const cs=conditions.filter(c=>c?.enabled&&c.field===field); let low=-Infinity, high=Infinity, ls=false, hs=false;
    for(const c of cs){if(c.op==='gte'||c.op==='gt'){if(c.value>low){low=c.value;ls=c.op==='gt';}else if(c.value===low)ls=ls||c.op==='gt';}else{if(c.value<high){high=c.value;hs=c.op==='lt';}else if(c.value===high)hs=hs||c.op==='lt';}}
    if(low>high||(low===high&&(ls||hs)))errors.push(`${FIELDS[field].label}条件冲突：下限${ls?'>':'≥'}${low}与上限${hs?'<':'≤'}${high}无法同时满足`);
  }
  return [...new Set(errors)];
}
export function compare(value, op, threshold){return op==='gte'?value>=threshold:op==='lte'?value<=threshold:op==='gt'?value>threshold:value<threshold;}
export function dateCN(ms){return new Date(ms).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});}
export function historyMetrics(bars){
  const sorted=[...bars].sort((a,b)=>a.date.localeCompare(b.date)).slice(-61);
  if(sorted.length!==61||new Set(sorted.map(b=>b.date)).size!==61||sorted.some(b=>!Number.isFinite(b.close)||b.close<=0))return { volatility:null, drawdown:null, window:null };
  const returns=sorted.slice(1).map((b,i)=>Math.log(b.close/sorted[i].close));
  const mean=returns.reduce((a,b)=>a+b,0)/60;
  const volatility=Math.sqrt(returns.reduce((a,b)=>a+(b-mean)**2,0)/59)*Math.sqrt(252)*100;
  let peak=sorted[0].close,drawdown=0;for(const b of sorted){peak=Math.max(peak,b.close);drawdown=Math.max(drawdown,(1-b.close/peak)*100);}
  return { volatility, drawdown, window:[sorted[0].date,sorted.at(-1).date] };
}
export function growth(current,prior){return Number.isFinite(current)&&Number.isFinite(prior)&&prior>0?(current/prior-1)*100:null;}
export function financialMetrics(reports, asOfDate){
  const available=reports.filter(r=>r.noticeDate&&r.noticeDate<=asOfDate&&r.period<=asOfDate).sort((a,b)=>b.period.localeCompare(a.period));
  const latest=available[0];if(!latest)return {revenueGrowth:null,profitGrowth:null,acceleration:null,ttm:null,period:null,noticeDate:null};
  const year=Number(latest.period.slice(0,4)),md=latest.period.slice(4);
  const prior=available.find(r=>r.period===`${year-1}${md}`),previous=available.find(r=>r.period<latest.period);
  const prevPrior=previous&&available.find(r=>r.period===`${Number(previous.period.slice(0,4))-1}${previous.period.slice(4)}`);
  const revenueGrowth=growth(latest.revenue,prior?.revenue),profitGrowth=growth(latest.profit,prior?.profit),prevGrowth=growth(previous?.profit,prevPrior?.profit);
  const annual=available.find(r=>r.period===`${year-1}-12-31`);
  const ttm=md==='-12-31'?latest.profit:(Number.isFinite(annual?.profit)&&Number.isFinite(latest.profit)&&Number.isFinite(prior?.profit)?annual.profit+latest.profit-prior.profit:null);
  return { revenueGrowth, profitGrowth, acceleration:profitGrowth!==null&&prevGrowth!==null?profitGrowth-prevGrowth:null, ttm, period:latest.period, noticeDate:latest.noticeDate, latest, prior, previous, prevPrior, annual };
}
export function normalizeStock(stock, now=Date.now()){
  const asOf=stock.quote?.date??dateCN(now),fin=financialMetrics(stock.reports??[],asOf),hist=historyMetrics((stock.bars??[]).filter(b=>b.date<=asOf)),cap=stock.quote?.marketCap;
  const pe=stock.valuation?((Number.isFinite(stock.valuation.peTTM)&&stock.valuation.peTTM>0)?stock.valuation.peTTM:null):(Number.isFinite(cap)&&cap>0&&Number.isFinite(fin.ttm)&&fin.ttm>0?cap/fin.ttm:null);
  const metrics={revenueGrowth:fin.revenueGrowth,profitGrowth:fin.profitGrowth,acceleration:fin.acceleration,pe,volatility:hist.volatility,drawdown:hist.drawdown,marketCap:Number.isFinite(cap)&&cap>0?cap/1e8:null};
  const ageDays=stock.quote?.date?(Date.parse(dateCN(now)+'T00:00:00+08:00')-Date.parse(stock.quote.date+'T00:00:00+08:00'))/86400000:Infinity;
  const issues=[...(stock.issues??[])];
  if(ageDays>7)issues.push('行情超过7个自然日未更新');
  if(!stock.quote?.date)issues.push('缺少行情时点');
  if(stock.quote?.date>dateCN(now))issues.push('行情交易日在未来，时点冲突');
  if(stock.valuation&&(!Number.isFinite(stock.valuation.timestamp)||dateCN(stock.valuation.timestamp)<asOf))issues.push('估值时点缺失或早于研究截至日');
  if(hist.window&&hist.window[1]!==asOf)issues.push('历史行情与行情快照交易日不一致');
  if(fin.period&&(Date.parse(asOf)-Date.parse(fin.period))/86400000>200)issues.push('财报报告期超过200天，可能过期');
  const metricDates={revenueGrowth:fin.period,profitGrowth:fin.period,acceleration:fin.period,pe:asOf,volatility:hist.window?.[1],drawdown:hist.window?.[1],marketCap:asOf};
  return {...stock,metrics,fin,hist,metricDates,issues:[...new Set(issues)],ageDays};
}
export function missingMetricReason(stock,field){
  if(field==='revenueGrowth'||field==='profitGrowth'){
    const key=field==='revenueGrowth'?'revenue':'profit',name=field==='revenueGrowth'?'收入':'利润';
    if(Number.isFinite(stock.fin.prior?.[key])&&stock.fin.prior[key]<=0)return `上年同期${name}为零或负数，普通同比增长率不适用`;
    return `缺少已披露的本期或上年同期${name}，无法计算同比`;
  }
  if(field==='pe'){
    if(stock.valuation)return Number.isFinite(stock.valuation.peTTM)&&stock.valuation.peTTM<=0?'估值接口返回非正市盈率，不能作为正常低估值':'估值接口缺少有效市盈率';
    return Number.isFinite(stock.fin.ttm)&&stock.fin.ttm<=0?'近12个月利润为零或负数，市盈率不适用':'缺少总市值或近12个月利润，无法计算市盈率';
  }
  if(field==='acceleration')return '缺少两个累计报告期的可比利润增长率，或其上年基数非正';
  if(field==='volatility'||field==='drawdown')return '历史收盘价不足61条、日期重复或价格无效，无法计算';
  return '行情接口未提供有效的总市值';
}
export function screen(stocks,conditions,options={}){
  const errors=validateConditions(conditions);if(errors.length)return {errors,rows:[],included:[],excluded:[],unknown:[]};
  const rows=stocks.filter(s=>!options.industry||options.industry==='全部行业'||s.industry===options.industry).map(raw=>{
    const s=normalizeStock(raw,options.now??Date.now());
    const checks=conditions.filter(c=>c.enabled).map(c=>{const value=s.metrics[c.field],missing=!Number.isFinite(value);return {condition:c,value:missing?null:value,status:missing?'unknown':compare(value,c.op,c.value)?'pass':'fail',reason:missing?missingMetricReason(s,c.field):null,date:s.metricDates[c.field]??null,unit:FIELDS[c.field].unit};});
    const status=s.issues.length||checks.some(c=>c.status==='unknown')?'unknown':checks.some(c=>c.status==='fail')?'excluded':'included';
    return {...s,checks,status};
  });
  return {errors:[],rows,included:rows.filter(s=>s.status==='included'),excluded:rows.filter(s=>s.status==='excluded'),unknown:rows.filter(s=>s.status==='unknown')};
}
export function sensitivity(stocks,conditions,id,value,options={}){
  const before=screen(stocks,conditions,options),after=screen(stocks,conditions.map(c=>c.id===id?{...c,value}:c),options);
  if(after.errors.length)return {errors:after.errors};
  const a=new Set(before.included.map(s=>s.code)),b=new Set(after.included.map(s=>s.code));
  return {before:a.size,after:b.size,added:after.included.filter(s=>!a.has(s.code)),removed:before.included.filter(s=>!b.has(s.code)),unknown:after.unknown.length};
}
