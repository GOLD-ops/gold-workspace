export async function ifindCall(tool,query,env,fetcher=fetch){
  if(!env.IFIND_AUTH_TOKEN)throw new Error('未配置iFinD授权');
  const endpoint='https://api-mcp.51ifind.com:8643/ds-mcp-servers/hexin-ifind-ds-stock-mcp';
  const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:env.IFIND_AUTH_TOKEN};
  async function rpc(method,params,id){
    const response=await fetcher(endpoint,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',method,params,...(id?{id}:{})}),signal:AbortSignal.timeout(18000)});
    if(!response.ok)throw new Error(`iFinD HTTP ${response.status}`);
    const session=response.headers.get('Mcp-Session-Id');if(session)headers['Mcp-Session-Id']=session;
    const text=await response.text();if(!text.trim())return {};
    let data;try{data=JSON.parse(text);}catch{try{data=JSON.parse(text.split('\n').filter(x=>x.startsWith('data: ')).at(-1)?.slice(6));}catch{throw new Error('iFinD响应格式异常');}}
    if(data.error)throw new Error('iFinD MCP调用失败');return data;
  }
  await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'stock-lens',version:'1.0.0'}},1);
  if(!headers['Mcp-Session-Id'])throw new Error('iFinD初始化缺少会话标识');
  await rpc('notifications/initialized',{},null);
  const result=await rpc('tools/call',{name:tool,arguments:{query}},2);
  if(result.result?.isError)throw new Error('iFinD工具返回业务异常');
  const content=result.result?.content?.find(c=>c.type==='text')?.text;if(!content)throw new Error('iFinD没有返回可追溯内容');
  let parsed;try{parsed=JSON.parse(content);}catch{throw new Error('iFinD数据不是结构化JSON');}
  if(parsed.code!==1&&parsed.code!==0)throw new Error('iFinD业务返回失败');
  return {source:'iFinD MCP',endpoint,tool,query,fetchedAt:new Date().toISOString(),raw:parsed,answer:parsed.data?.answer??'',indicatorParams:parsed.data?.indicators_params??{}};
}
