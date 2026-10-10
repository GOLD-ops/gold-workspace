import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHandler} from '../src/server.js';
const types={'/index.html':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/engine.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8','/stock-lens.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
  try{
    const assets={};for(const [path,type]of Object.entries(types))assets[path]={body:await readFile(path==='/engine.js'?'src/engine.js':'public'+path,'utf8'),type};
    const snapshot=JSON.parse(await readFile('data/snapshot.json','utf8')),handle=createHandler(snapshot,assets);
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const request=new Request('http://'+(req.headers.host??'localhost')+req.url,{method:req.method,headers:req.headers,...(req.method!=='GET'&&req.method!=='HEAD'?{body:Buffer.concat(chunks)}:{})});
    const response=await handle(request,process.env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('本地服务异常，请检查项目文件');}
});
const port=Number(process.env.PORT)||5180;server.listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${port}`));
