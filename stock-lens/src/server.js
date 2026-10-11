import {collectStock} from './providers.js';
import {createUniverseSource,UniverseError,UNIVERSE_POOLS} from './universe.js';
import {interpretIntent} from './interpreter.js';
import {ifindCall} from './ifind.js';
export function createHandler(snapshot,assets,fetcher=fetch){
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  const getUniverse=createUniverseSource(fetcher),stockCache=new Map(),pendingStocks=new Map();
  async function liveStock(meta,env){
    const key=env.FUYAO_API_KEY+'\n'+meta.thscode,cached=stockCache.get(key);
    if(cached&&cached.expiresAt>Date.now())return {...cached.value,...meta};
    if(pendingStocks.has(key))return {...await pendingStocks.get(key),...meta};
    const pending=collectStock(meta,env,fetcher);pendingStocks.set(key,pending);
    try{
      const value=await pending,ttl=value.issues?.length||!value.quote?20000:5*60*1000;
      stockCache.set(key,{value,expiresAt:Date.now()+ttl});return {...value,...meta};
    }finally{pendingStocks.delete(key);}
  }
  return async function handle(request,env={}){
    const url=new URL(request.url),path=url.pathname;
    try{
      if(path==='/api/config'&&request.method==='GET')return json({ai:Boolean(env.AI_API_KEY),fuyao:Boolean(env.FUYAO_API_KEY),ifind:Boolean(env.IFIND_AUTH_TOKEN),model:env.AI_MODEL||null,pools:Object.entries(UNIVERSE_POOLS).map(([id,pool])=>({id,...pool}))});
      if(path==='/api/universe'&&request.method==='GET')return json(await getUniverse({pool:url.searchParams.get('pool')??'sz50',industry:url.searchParams.get('industry')??'全部行业'},env));
      if(path==='/api/snapshot'&&request.method==='GET')return json(env.FUYAO_API_KEY?{mode:'live',stocks:[],fetchedAt:null,source:'扶摇 · 同花顺金融数据',message:'真实筛选需要先读取官方股票池，再按该股票池刷新数据；此接口不提供固定演示名单'}:{...snapshot,mode:'public-baseline',message:'离线公开历史基线，仅供复现开发，不是扶摇实时筛选结果'});
      if(path.startsWith('/api/')&&request.method==='POST'){
        const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'不允许跨站请求'},403);
        if(Number(request.headers.get('content-length'))>20000)return json({error:'请求体过大'},413);
        const text=await request.text();if(text.length>20000)return json({error:'请求体过大'},413);
        let body;try{body=JSON.parse(text);}catch{return json({error:'请求体必须为JSON'},400);}
        if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'请求体必须为JSON对象'},400);
        if(path==='/api/interpret'){
          if(typeof body.text!=='string'||!body.text.trim()||body.text.length>1500)return json({error:'请输入1～1500字的研究意图'},400);
          let context={},catalogEvidence=null,catalogError=null;
          if(env.FUYAO_API_KEY){
            try{
              const catalog=await getUniverse.getIndustryOptions(env);
              context={industryOptions:catalog.industries.map(item=>item.name)};
              const {raw,...metadata}=catalog.evidence;catalogEvidence=metadata;
            }catch(error){context={industryOptions:[]};catalogError=String(error.message).slice(0,200);}
          }
          const result=await interpretIntent(body.text,env,fetcher,context);
          if(catalogEvidence)result.industryEvidence=catalogEvidence;
          if(catalogError&&result.mode!=='blocked'){
            result.unresolved=[...new Set([...(result.unresolved??[]),'扶摇行业目录读取失败，当前无法核验行业范围；请重新读取真实目录，或明确不限定行业。'])];
            result.industryEvidence={source:'扶摇 · 同花顺金融数据',status:'failed',error:catalogError,fetchedAt:new Date().toISOString()};
          }
          return json(result);
        }
        if(path==='/api/refresh'){
          const offset=body.offset;if(!Number.isInteger(offset)||offset<0||offset%4!==0)return json({error:'刷新批次无效'},400);
          if(typeof body.pool!=='string'||!Object.hasOwn(UNIVERSE_POOLS,body.pool)||typeof body.industry!=='string'||typeof body.universeId!=='string'||body.universeId.length>100)return json({error:'请先载入真实股票池，再刷新数据',code:'INVALID_UNIVERSE'},400);
          const universe=await getUniverse({pool:body.pool,industry:body.industry},env);
          if(universe.id!==body.universeId)return json({error:'官方股票池成分已更新，请重新载入股票池后筛选',code:'UNIVERSE_CHANGED',currentUniverseId:universe.id,currentTotal:universe.total},409);
          if(offset>=universe.total)return json({error:'刷新批次超出当前股票池范围'},400);
          const end=Math.min(offset+4,universe.total),stocks=[];
          for(let i=offset;i<end;i+=2)stocks.push(...await Promise.all(universe.stocks.slice(i,Math.min(i+2,end)).map(meta=>liveStock(meta,env))));
          return json({stocks,fetchedAt:new Date().toISOString(),provider:universe.source,universeId:universe.id,total:universe.total,offset,nextOffset:end,complete:end===universe.total});
        }
        if(path==='/api/ifind-verify'){
          if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code)||typeof body.period!=='string'||!/^20\d{2}-(03-31|06-30|09-30|12-31)$/.test(body.period)||typeof body.pool!=='string'||!Object.hasOwn(UNIVERSE_POOLS,body.pool)||typeof body.industry!=='string')return json({error:'核验股票、报告期或股票池无效'},400);
          const universe=await getUniverse({pool:body.pool,industry:body.industry},env),meta=universe.stocks.find(s=>s.code===body.code);
          if(!meta)return json({error:'核验股票不属于当前官方股票池'},400);
          const query=`${meta.name}（${meta.code}）${body.period}累计营业总收入、累计归属于母公司股东净利润；单位元，合并报表。只查指定报告期，区分累计与单季度。`;
          return json(await ifindCall('get_stock_financials',query,env,fetcher));
        }
        if(path==='/api/ifind-search'){
          if(typeof body.text!=='string'||body.text.length>1200)return json({error:'交叉检索内容无效'},400);
          const local=await interpretIntent(body.text,{});if(local.mode==='blocked')return json({error:local.message},400);
          return json(await ifindCall('search_stocks',body.text,env,fetcher));
        }
      }
      if(path.startsWith('/api/'))return json({error:'接口不存在或请求方法错误'},404);
      const asset=assets[path==='/'?'/index.html':path];if(!asset)return new Response('页面不存在',{status:404});
      return new Response(asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.chatgpt.site; form-action 'self'"}});
    }catch(error){return json({error:String(error.message).slice(0,200),...(error instanceof UniverseError?{code:error.code}:{})},error instanceof UniverseError?error.status:(path.startsWith('/api/')?502:500));}
  };
}
