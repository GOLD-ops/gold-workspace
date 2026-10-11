import {fetchJSON} from './providers.js';

export const UNIVERSE_POOLS = Object.freeze({
  sz50: Object.freeze({name:'上证50',indexCode:'000016.SH'}),
  hs300: Object.freeze({name:'沪深300',indexCode:'000300.SH'})
});
const universeSourceName='扶摇 · 同花顺金融数据';
const universeBaseURL='https://fuyao.aicubes.cn';
const universeMetadataTTL=10*60*1000;

export class UniverseError extends Error {
  constructor(message,status=502,code='UNIVERSE_SOURCE_FAILED'){
    super(message);this.name='UniverseError';this.status=status;this.code=code;
  }
}

function universeStockRows(data){
  if(!Array.isArray(data?.item))throw new UniverseError('扶摇股票池响应缺少成分列表');
  const result=new Map();
  for(const row of data.item){
    if(typeof row?.thscode!=='string'||!/^\d{6}\.(SH|SZ|BJ)$/.test(row.thscode))throw new UniverseError('扶摇股票池包含无效证券代码');
    const code=row.thscode.slice(0,6);
    if(row.ticker!==undefined&&row.ticker!==code)throw new UniverseError('扶摇股票池证券代码字段相互冲突');
    if(typeof row.name!=='string'||!row.name.trim()||row.name.length>100||/[\u0000-\u001f]/.test(row.name))throw new UniverseError('扶摇股票池包含缺失或无效股票名称');
    const item={code,thscode:row.thscode,name:row.name.trim()};
    const previous=result.get(item.thscode);
    if(previous&&previous.name!==item.name)throw new UniverseError('扶摇股票池重复证券的名称相互冲突');
    result.set(item.thscode,item);
  }
  return [...result.values()].sort((a,b)=>a.thscode.localeCompare(b.thscode));
}

function universeIndustryRows(data){
  if(!Array.isArray(data?.item)||!data.item.length)throw new UniverseError('扶摇行业目录为空或格式异常');
  const result=new Map();
  for(const row of data.item){
    if(typeof row?.thscode!=='string'||!/^\d{6}\.(TI|SH|SZ)$/.test(row.thscode)||typeof row.name!=='string'||!row.name.trim()||row.name.length>100||/[\u0000-\u001f]/.test(row.name))throw new UniverseError('扶摇行业目录包含无效名称或代码');
    const item={thscode:row.thscode,name:row.name.trim()},previous=result.get(row.thscode);
    if(previous&&previous.name!==item.name)throw new UniverseError('扶摇行业目录重复指数的名称相互冲突');
    result.set(item.thscode,item);
  }
  return [...result.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
}

async function universeContentId(pool,indexCode,industry,stocks){
  const value=JSON.stringify({pool,indexCode,industry,members:stocks.map(({thscode,name})=>({thscode,name}))});
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return 'universe_'+[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function createUniverseSource(fetcher=fetch){
  const metadataCache=new Map(),pendingMetadata=new Map();
  async function query(path,params,env,type){
    if(!env.FUYAO_API_KEY)throw new UniverseError('尚未配置扶摇授权，无法读取真实股票池',503,'FUYAO_NOT_CONFIGURED');
    const url=new URL(path,universeBaseURL);
    for(const [key,value]of Object.entries(params))url.searchParams.set(key,value);
    const cacheKey=env.FUYAO_API_KEY+'\n'+url.href,cached=metadataCache.get(cacheKey);
    if(cached&&cached.expiresAt>Date.now())return cached.value;
    if(pendingMetadata.has(cacheKey))return pendingMetadata.get(cacheKey);
    const pending=(async()=>{
      let raw;
      try{raw=await fetchJSON(url.href,{'X-api-key':env.FUYAO_API_KEY},fetcher);}
      catch(error){throw new UniverseError('扶摇股票池读取失败：'+String(error.message).slice(0,150));}
      if(raw?.code!==0)throw new UniverseError('扶摇股票池查询失败（业务码 '+(Number.isInteger(raw?.code)?raw.code:'缺失或非法')+'）');
      if(!Number.isFinite(raw.data?.timestamp)||raw.data.timestamp<=0)throw new UniverseError('扶摇股票池响应缺少有效数据时点');
      const rows=type==='industry_catalog'?universeIndustryRows(raw.data):universeStockRows(raw.data);
      if(type==='index_constituents'&&!rows.length)throw new UniverseError('扶摇返回的指数成分为空，请稍后重新读取');
      const fetchedAt=new Date().toISOString();
      const value={rows,evidence:{type,url:url.href,parameters:{...params},source:universeSourceName,fetchedAt,asOf:raw.data.timestamp,requestId:typeof raw.request_id==='string'?raw.request_id.slice(0,120):null,count:rows.length,fields:type==='industry_catalog'?['thscode','name']:['thscode','ticker','name'],raw:{timestamp:raw.data.timestamp,item:raw.data.item}}};
      metadataCache.set(cacheKey,{value,expiresAt:Date.now()+universeMetadataTTL});return value;
    })();
    pendingMetadata.set(cacheKey,pending);
    try{return await pending;}finally{pendingMetadata.delete(cacheKey);}
  }
  const getUniverse=async function({pool='sz50',industry='全部行业'}={},env={}){
    if(typeof pool!=='string'||!Object.hasOwn(UNIVERSE_POOLS,pool))throw new UniverseError('股票池无效，请选择上证50或沪深300',400,'INVALID_POOL');
    if(typeof industry!=='string'||!industry||industry.length>100)throw new UniverseError('行业参数无效',400,'INVALID_INDUSTRY');
    const definition=UNIVERSE_POOLS[pool];
    const [base,catalog]=await Promise.all([
      query('/api/a-share-index/constituents/ths-stock-list',{thscode:definition.indexCode},env,'index_constituents'),
      query('/api/a-share-index/catalog/ths-index-list',{tag:'industry'},env,'industry_catalog')
    ]);
    if(!base.rows.length)throw new UniverseError('扶摇返回的指数成分为空，请稍后重新读取');
    let selected=base.rows;const evidence=[base.evidence,catalog.evidence];
    if(industry!=='全部行业'){
      const matches=catalog.rows.filter(item=>item.name===industry);
      if(matches.length!==1)throw new UniverseError(matches.length?'行业名称存在歧义，请选择目录中的唯一行业':'行业不在扶摇当前官方目录中',400,'INVALID_INDUSTRY');
      const membership=await query('/api/a-share-index/constituents/ths-stock-list',{thscode:matches[0].thscode},env,'industry_constituents');
      const codes=new Set(membership.rows.map(item=>item.thscode));
      selected=base.rows.filter(item=>codes.has(item.thscode));evidence.push(membership.evidence);
    }
    const stocks=selected.map(item=>({...item,industry:industry==='全部行业'?'未指定行业':industry}));
    return {id:await universeContentId(pool,definition.indexCode,industry,stocks),pool,label:definition.name+'当前成分股'+(industry==='全部行业'?'':' · '+industry),indexCode:definition.indexCode,industry,source:universeSourceName,fetchedAt:evidence.reduce((latest,item)=>item.fetchedAt>latest?item.fetchedAt:latest,''),asOf:base.evidence.asOf,total:stocks.length,baseTotal:base.rows.length,stocks,industries:catalog.rows.map(item=>({...item})),evidence};
  };
  getUniverse.getIndustryOptions=async function(env={}){
    const catalog=await query('/api/a-share-index/catalog/ths-index-list',{tag:'industry'},env,'industry_catalog');
    return {industries:catalog.rows.map(item=>({...item})),evidence:catalog.evidence};
  };
  return getUniverse;
}
