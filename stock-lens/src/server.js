import {UNIVERSE} from './engine.js';
import {collectStock} from './providers.js';
import {interpretIntent} from './interpreter.js';
import {ifindCall} from './ifind.js';
export function createHandler(snapshot,assets){
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  return async function handle(request,env={}){
    const url=new URL(request.url),path=url.pathname;
    try{
      if(path==='/api/config'&&request.method==='GET')return json({ai:Boolean(env.AI_API_KEY),fuyao:Boolean(env.FUYAO_API_KEY),ifind:Boolean(env.IFIND_AUTH_TOKEN),model:env.AI_MODEL||null});
      if(path==='/api/snapshot'&&request.method==='GET')return json(snapshot);
      if(path.startsWith('/api/')&&request.method==='POST'){
        const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'不允许跨站请求'},403);
        if(Number(request.headers.get('content-length'))>20000)return json({error:'请求体过大'},413);
        const text=await request.text();if(text.length>20000)return json({error:'请求体过大'},413);
        let body;try{body=JSON.parse(text);}catch{return json({error:'请求体必须为JSON'},400);}
        if(path==='/api/interpret')return json(await interpretIntent(body.text,env));
        if(path==='/api/refresh'){
          const offset=Number(body.offset);if(!Number.isInteger(offset)||offset<0||offset>=UNIVERSE.length||offset%4!==0)return json({error:'刷新批次无效'},400);
          const stocks=[];for(let i=offset;i<Math.min(offset+4,UNIVERSE.length);i+=2)stocks.push(...await Promise.all(UNIVERSE.slice(i,Math.min(i+2,offset+4)).map(meta=>collectStock(meta,env))));
          return json({stocks,fetchedAt:new Date().toISOString(),provider:env.FUYAO_API_KEY?'扶摇':'东方财富公开接口'});
        }
        if(path==='/api/ifind-verify'){
          const meta=UNIVERSE.find(s=>s.code===body.code);if(!meta||!/^20\d{2}-(03-31|06-30|09-30|12-31)$/.test(body.period))return json({error:'核验股票或报告期无效'},400);
          const query=`${meta.name}（${meta.code}）${body.period}累计营业总收入、累计归属于母公司股东净利润；单位元，合并报表。只查指定报告期，区分累计与单季度。`;
          return json(await ifindCall('get_stock_financials',query,env));
        }
        if(path==='/api/ifind-search'){
          if(typeof body.text!=='string'||body.text.length>1200)return json({error:'交叉检索内容无效'},400);
          const local=await interpretIntent(body.text,{});if(local.mode==='blocked')return json({error:local.message},400);
          return json(await ifindCall('search_stocks',body.text,env));
        }
      }
      if(path.startsWith('/api/'))return json({error:'接口不存在或请求方法错误'},404);
      const asset=assets[path==='/'?'/index.html':path];if(!asset)return new Response('页面不存在',{status:404});
      return new Response(asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.chatgpt.site; form-action 'self'"}});
    }catch(error){return json({error:String(error.message).slice(0,200)},path.startsWith('/api/')?502:500);}
  };
}
