import {readFile,writeFile,mkdir} from 'node:fs/promises';
const modules=['engine','providers','interpreter','ifind','server'];
let source='';for(const name of modules){source+=(await readFile(`src/${name}.js`,'utf8')).replace(/^import .*;\r?\n/gm,'')+'\n';}
const snapshot=JSON.parse(await readFile('data/snapshot.json','utf8'));
if(snapshot.stocks.some(s=>s.evidence?.some(e=>e.source?.startsWith('扶摇'))))throw new Error('不能把授权数据嵌入提交源码；请使用公开快照作为可复现基线');
const assets={};for(const [path,file,type]of [['/index.html','public/index.html','text/html; charset=utf-8'],['/app.js','public/app.js','text/javascript; charset=utf-8'],['/workflow.js','public/workflow.js','text/javascript; charset=utf-8'],['/style.css','public/style.css','text/css; charset=utf-8'],['/engine.js','src/engine.js','text/javascript; charset=utf-8'],['/stock-lens.svg','public/stock-lens.svg','image/svg+xml']])assets[path]={body:await readFile(file,'utf8'),type};
source+=`\nconst snapshot=${JSON.stringify(snapshot)};\nconst assets=${JSON.stringify(assets)};\nconst handler=createHandler(snapshot,assets);\nexport default {fetch(request,env){return handler(request,env);}};\n`;
await mkdir('worker',{recursive:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('worker/index.js',source);await writeFile('dist/server/index.js',source);await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Built standalone Worker with embedded public baseline and application assets.');
