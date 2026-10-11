import {FIELDS,OPS,defaultConditions,validateConditions,screen,sensitivity,normalizeStock} from './engine.js';
import {workflowState} from './workflow.js';
import {PRESETS,presetDraft} from './presets.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,n=2)=>Number.isFinite(v)?v.toFixed(n):'—';
const clone=v=>structuredClone(v),time=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未知';
const state={data:null,config:{},draft:defaultConditions(),executed:defaultConditions(),industry:'全部行业',executedIndustry:'全部行业',result:null,tab:'included',view:'research',selected:new Set(),interpretation:null,stale:false,busy:false,parsedBusy:false,lastFocus:null,monitorRunning:false,hasRun:false,draftReady:false,interpretedText:null,executedIntent:null,executedInterpretation:null,executedUnresolved:[],stage:'input',pool:'sz50',universe:null,executedData:null,scopeLoading:false,scopeSeq:0};

const POOLS={sz50:'上证50',hs300:'沪深300'};
const resultData=()=>state.executedData??state.data;
const sameScope=(data,pool=state.pool,industry=state.industry)=>data?.scope?.pool===pool&&data.scope.industry===industry;
const hasCurrentData=()=>sameScope(state.data)&&state.data.scope.id===state.universe?.id&&Date.now()-new Date(state.data.fetchedAt).getTime()<300000;
const scopeLabel=()=>state.universe?state.universe.label+' · '+state.universe.total+'只':POOLS[state.pool]+' · 范围待取得';
function renderScope(){
  $$('[data-pool-select]').forEach(el=>{el.value=state.pool;el.disabled=state.busy;});
  $('#industry').disabled=state.busy;
  $('#scope-copy').textContent=state.scopeLoading?'正在获取官方成分…':scopeLabel();
}
async function loadScope(){
  const seq=++state.scopeSeq,pool=state.pool,industry=state.industry;
  state.scopeLoading=true;state.universe=null;$('#scope-error').innerHTML='';renderScope();updateExecute();
  try{
    const u=await api('/api/universe?pool='+encodeURIComponent(pool)+'&industry='+encodeURIComponent(industry));
    if(seq!==state.scopeSeq)return null;
    state.universe=u;
    $('#industry').innerHTML='<option>全部行业</option>'+(u.industries??[]).map(x=>'<option>'+e(x.name)+'</option>').join('');$('#industry').value=industry;
    setStatus(u.label+' · '+u.total+'只官方成分 · '+(u.total?'确认条件后获取行情与财务':'所选指数与行业暂无成分交集'));
    return u;
  }catch(err){
    if(seq!==state.scopeSeq)return null;
    $('#scope-error').innerHTML='<div class="notice error">股票范围获取失败：'+e(err.message)+'。没有使用演示名单替代。<button class="text-button" data-action="reload-scope">重新获取 →</button></div>';
    setStatus('尚未取得可验证股票范围',true);return null;
  }finally{if(seq===state.scopeSeq){state.scopeLoading=false;renderScope();updateExecute();if(state.view==='sources')renderOther();}}
}

const HELP={
  revenueGrowth:{label:'收入增长',explain:'公司赚取收入的规模，与去年同期相比变大还是变小。0%表示没有下降，10%表示比去年同期多10%。',basis:'最新已披露的累计报告期，与上年同一期间相比。',note:'收入增加不代表利润增加。上年基数为零或负数时不计算增长率。'},
  profitGrowth:{label:'利润增长',explain:'归属于上市公司股东的净利润，比去年同期增长了多少。0%表示没有下降。',basis:'最新已披露的累计归母净利润，与上年同一期间相比。',note:'利润可能受到一次性收入影响；负数基期无法用普通增长率解释。'},
  acceleration:{label:'利润增速提升',explain:'比较最新和上一份累计财报的利润增长率。比如从5%变为8%，提升了3个百分点。',basis:'最新累计利润同比减去上一个累计报告期同比。',note:'两个累计期间的长度不同，它不能直接证明单季度利润在加速。'},
  pe:{label:'市盈率',explain:'可以理解为：公司当前总市值相当于最近一年净利润的多少倍。例如20倍，表示市值约为一年利润的20倍。',basis:'TTM指最近12个月。优先使用扶摇估值字段，公开快照使用总市值除以近12个月归母净利润。',note:'倍数较低不一定更便宜，行业差异很大。亏损或零利润时不作为正常低估值。'},
  volatility:{label:'价格波动',explain:'衡量最近股价上下起伏的程度，数值越低，通常表示这段时间的波动更小。',basis:'用最近60个交易日的后复权收益计算，再换算为年化百分比。',note:'30%不表示最近涨跌30%，也不是未来风险预测。它只描述历史波动。'},
  drawdown:{label:'最大回撤',explain:'观察期内，从先前最高点到后来低点，最多下跌了多少。例如10%，表示最深的一次跌幅为10%。',basis:'最近61个后复权收盘价，约60个交易日。',note:'这里仅用每日收盘价，不包含盘中跌幅；历史回撤不代表未来跌幅。'},
  marketCap:{label:'公司市值',explain:'股票价格乘以总股数，表示公司股票在市场上的总价值。',basis:'单位为亿元，使用供应商的总市值字段。',note:'总市值不同于流通市值。来源没有提供该字段时，会显示无法判断。'}
};
const OP_WORD={gte:'不低于',lte:'不超过',gt:'高于',lt:'低于'};
const label=f=>HELP[f]?.label??FIELDS[f]?.label??f;
const helpButton=f=>'<button class="metric-help" data-field="'+e(f)+'" aria-label="'+e(label(f))+'解释" aria-expanded="false">?</button>';
function conditionWords(c){if(c.value===0&&c.op==='gte'&&['revenueGrowth','profitGrowth'].includes(c.field))return label(c.field).replace('增长','')+'不下降';return label(c.field)+' '+OP_WORD[c.op]+' '+c.value+(FIELDS[c.field]?.unit??'');}
let helpTarget=null,helpPinned=false,helpTimer;
function hideHelp(){clearTimeout(helpTimer);helpTarget?.setAttribute('aria-expanded','false');helpTarget?.removeAttribute('aria-describedby');helpTarget=null;helpPinned=false;$('#metric-tooltip').classList.add('hidden');}
function showHelp(button,pinned=false){
  const tip=HELP[button.dataset.field];if(!tip)return;hideHelp();helpTarget=button;helpPinned=pinned;button.setAttribute('aria-expanded','true');button.setAttribute('aria-describedby','metric-tooltip');
  const box=$('#metric-tooltip');box.innerHTML='<strong>'+e(tip.label)+'</strong><p>'+e(tip.explain)+'</p><p class="tip-note">口径：'+e(tip.basis)+'</p><p class="tip-note">注意：'+e(tip.note)+'</p>';box.classList.remove('hidden');
  const r=button.getBoundingClientRect(),b=box.getBoundingClientRect();box.style.left=Math.max(12,Math.min(r.right-b.width,innerWidth-b.width-12))+'px';box.style.top=Math.max(12,r.bottom+b.height+12<innerHeight?r.bottom+8:r.top-b.height-8)+'px';
}
function scheduleHide(){clearTimeout(helpTimer);if(!helpPinned)helpTimer=setTimeout(hideHelp,160);}
document.addEventListener('pointerover',ev=>{const button=ev.target.closest('.metric-help');if(button&&ev.pointerType!=='touch'&&helpTarget!==button)showHelp(button);if(ev.target.closest('#metric-tooltip'))clearTimeout(helpTimer);});
document.addEventListener('pointerout',ev=>{if(ev.target.closest('.metric-help,#metric-tooltip')&&!ev.relatedTarget?.closest?.('.metric-help,#metric-tooltip'))scheduleHide();});
document.addEventListener('focusin',ev=>{if(ev.target.matches('.metric-help'))showHelp(ev.target);});
document.addEventListener('focusout',ev=>{if(ev.target.matches('.metric-help')&&!helpPinned)hideHelp();});
document.addEventListener('click',ev=>{const button=ev.target.closest('.metric-help');if(button){if(helpTarget===button&&helpPinned)hideHelp();else showHelp(button,true);}else if(!ev.target.closest('#metric-tooltip'))hideHelp();});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&helpTarget){hideHelp();ev.stopPropagation();}},true);
window.addEventListener('resize',hideHelp);document.addEventListener('scroll',hideHelp,true);

function loadLocal(key){try{const data=JSON.parse(localStorage.getItem('stock-lens-'+key)||'[]');return Array.isArray(data)?data:[];}catch{return [];}}
let saved=loadLocal('saved'),monitors=loadLocal('monitors');
function writeLocal(key,value){try{localStorage.setItem('stock-lens-'+key,JSON.stringify(value));return true;}catch{toast('浏览器存储不可用，未能保存。可以导出JSON留存。');return false;}}
async function api(path,body){const r=await fetch(new URL(path.replace(/^\//,''),import.meta.url),{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(75000)});let data;try{data=await r.json();}catch{throw new Error('接口返回格式异常');}if(!r.ok||data.error){const error=new Error(data.error||`HTTP ${r.status}`);error.code=data.code;throw error;}return data;}
let toastTimer;function toast(text){$('#toast').textContent=text;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),4500);}
function modal(title,subtitle,body){hideHelp();state.lastFocus=document.activeElement;$('#dialog').innerHTML=`<header class="dialog-header"><div><h2 id="dialog-title">${e(title)}</h2><p>${e(subtitle)}</p></div><button class="close" data-action="close" aria-label="关闭">×</button></header><div class="dialog-body">${body}</div>`;$('#overlay').classList.remove('hidden');$('#dialog').focus();document.body.style.overflow='hidden';}
function closeModal(){$('#overlay').classList.add('hidden');document.body.style.overflow='';state.lastFocus?.focus();}
$('#overlay').addEventListener('click',ev=>{if(ev.target===$('#overlay'))closeModal();});
document.addEventListener('keydown',ev=>{if($('#overlay').classList.contains('hidden'))return;if(ev.key==='Escape')closeModal();if(ev.key==='Tab'){const els=[...$('#dialog').querySelectorAll('button,input,select,textarea,a[href]')].filter(el=>!el.disabled&&!el.closest('.hidden'));if(!els.length){ev.preventDefault();return;}const first=els[0],last=els.at(-1);if(ev.shiftKey&&(document.activeElement===first||document.activeElement===$('#dialog'))){ev.preventDefault();last.focus();}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}}});
function renderWorkflow(){
  const flow=workflowState({...state,intent:$('#intent').value});state.stage=flow.stage;
  $('#research-view').dataset.stage=flow.stage;
  $('#input-stage').classList.toggle('hidden',flow.stage!=='input');
  $('#condition-section').classList.toggle('hidden',flow.stage!=='conditions');
  $('#results-section').classList.toggle('hidden',flow.stage!=='results');
  $$('.workflow-nav [data-stage]').forEach(button=>{
    const current=button.dataset.stage===flow.stage;
    button.setAttribute('aria-current',current?'step':'false');
    button.disabled=button.dataset.stage==='conditions'?!flow.canReview:button.dataset.stage==='results'?!flow.canSeeResults:false;
    button.classList.toggle('completed',!current&&(button.dataset.stage==='input'&&flow.canReview||button.dataset.stage==='conditions'&&state.hasRun));
    if(button.dataset.stage==='results')button.title=flow.resultsArePrevious?'查看上次确认条件的结果':'查看结果';
  });
  $('#review-intent').textContent=state.interpretedText??'';
  $('#applied-intent').textContent=state.executedIntent||'已保存的筛选条件';
  $('#applied-conditions').innerHTML=state.hasRun?'<span class="scope-chip">'+e(resultData()?.scope?.label??'股票范围')+' · '+(state.result?.rows.length??0)+'只</span>'+state.executed.filter(c=>c.enabled).map(c=>'<span class="condition-chip">'+e(conditionWords(c))+' '+helpButton(c.field)+'</span>').join(''):'';
  $('#stale').classList.toggle('hidden',!flow.resultsArePrevious);
}
function showStage(stage){
  hideHelp();state.stage=stage;renderWorkflow();
  window.scrollTo({top:0,behavior:'instant'});
  const target=state.stage==='input'?$('#intent'):state.stage==='conditions'?$('#condition-title'):$('#result-heading');target?.focus({preventScroll:true});
}
function markDraft(){state.stale=state.hasRun;renderWorkflow();updateExecute();}
function renderConditions(rebuild=true){
  hideHelp();
  if(rebuild)$('#conditions').innerHTML=state.draft.map(c=>
    '<article class="condition-card '+(c.enabled?'':'disabled')+'" data-id="'+e(c.id)+'">'+
    '<div class="condition-card-header"><label class="condition-toggle"><input type="checkbox" data-property="enabled" '+(c.enabled?'checked':'')+' aria-label="启用'+e(label(c.field))+'"><span aria-hidden="true"></span></label>'+
    '<select class="field-select" data-property="field" aria-label="条件字段">'+Object.keys(FIELDS).map(k=>'<option value="'+k+'" '+(c.field===k?'selected':'')+'>'+e(label(k))+'</option>').join('')+'</select>'+helpButton(c.field)+
    '<button class="condition-remove" data-action="remove-condition" data-id="'+e(c.id)+'" aria-label="删除'+e(label(c.field))+'条件"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button></div>'+
    '<div class="condition-edit"><select class="op-select" data-property="op" aria-label="'+e(label(c.field))+'运算符">'+Object.keys(OPS).map(k=>'<option value="'+k+'" '+(c.op===k?'selected':'')+'>'+e(OP_WORD[k])+'</option>').join('')+'</select>'+
    '<div class="condition-value"><input type="number" data-property="value" value="'+e(c.value)+'" min="'+FIELDS[c.field]?.min+'" max="'+FIELDS[c.field]?.max+'" step="any" aria-label="'+e(label(c.field))+'阈值"><span class="unit">'+e(FIELDS[c.field]?.unit)+'</span></div></div>'+
    '<details class="condition-origin"><summary>条件依据</summary><p>'+e(c.origin)+'</p></details></article>').join('');
  $$('#conditions [data-id]').forEach(card=>card.classList.toggle('disabled',!state.draft.find(c=>c.id===card.dataset.id)?.enabled));
  const active=state.draft.filter(c=>c.enabled);
  $('#condition-count').textContent=active.length?active.length+' 个条件，全部满足':'尚无可执行条件';
  $('#condition-summary').innerHTML=(state.industry==='全部行业'?'':'<div class="scope-summary">范围：'+e(state.industry)+'</div>')+active.map(c=>'<div class="summary-condition"><span class="condition-mark" aria-hidden="true">✓</span><span>'+e(conditionWords(c))+'</span>'+helpButton(c.field)+'</div>').join('');
  renderConflicts();renderUnresolved(true);renderWorkflow();updateExecute();
}
function renderConflicts(){const errors=validateConditions(state.draft).filter(t=>t!=='至少启用一条条件');$('#conflicts').innerHTML=errors.length?`<div class="notice error">${errors.map(e).join('<br>')}<br>请修改条件后再执行。</div>`:'';}
function unsupportedRequirements(){return (state.interpretation?.unresolved??[]).filter(t=>!t.startsWith('请添加至少一个可执行指标与阈值')&&!t.startsWith('没有识别出可执行的字段条件'));}
function renderUnresolved(preserve=false){
  const skipped=preserve&&$('#remove-unsupported')?.checked,items=unsupportedRequirements();
  const empty=!state.draft.some(c=>c.enabled);
  $('#unresolved').innerHTML=(empty?'<div class="notice info"><strong>还需要一个筛选指标</strong><p>行业范围本身不是筛选条件。请补充一个指标和阈值，例如“市盈率不超过25倍”，或展开下方手动添加。</p><button class="text-button" data-stage="input">修改想法 →</button><button class="text-button" data-view="saved">选择预制方案 →</button></div>':'')+
    (items.length?'<div class="notice">以下要求暂时无法验证：<br>'+items.map(e).join('<br>')+(empty?'':'<label><input type="checkbox" id="remove-unsupported" '+(skipped?'checked':'')+'>本次先不使用这些要求，按已列条件继续</label>')+'</div>':'');
}
function updateExecute(){const unresolved=unsupportedRequirements().length&&!$('#remove-unsupported')?.checked;$('#execute').disabled=!state.config.fuyao||!state.universe||state.scopeLoading||!state.draftReady||state.busy||state.parsedBusy||state.interpretedText!==$('#intent').value.trim()||validateConditions(state.draft).length>0||Boolean(unresolved)||state.interpretation?.mode==='blocked';$('#execute').innerHTML=(state.busy?'数据更新中…':!hasCurrentData()?'取数并按条件筛选':'按这些条件筛选 <span aria-hidden="true">→</span>');$('#save').disabled=state.stale||state.busy;$('#create-monitor').disabled=state.stale||state.busy;}
function renderInterpretation(){
  const i=state.interpretation;
  $('#parse-message').innerHTML=!i?'':i.mode==='blocked'||i.mode==='fallback'?'<div class="notice '+(i.mode==='blocked'?'error':'')+'">'+e(i.message)+'</div>':i.mode==='preset'||i.mode==='saved'?'<div class="parse-status">已载入'+(i.mode==='preset'?'预制':'保存的')+'方案。可修改条件，确认后再筛选。</div>':i.mode==='llm'?'':'<div class="parse-status">使用本地规则整理，未调用大模型。</div>';
  $('#ai-mode').textContent=({llm:'本次由 AI 整理',fallback:'本次使用本地规则',rules:'本次使用本地规则',preset:'本次使用预制方案',saved:'本次使用保存的方案',blocked:'请改写研究条件'}[i?.mode])??(state.config.ai?'AI 帮你整理，可随时修改':'本地规则模式');
  if(i?.diagnostic)$('#parse-message').innerHTML+='<details class="parse-details"><summary>查看解析问题</summary><p>'+e(i.diagnostic.code)+' · '+e(i.diagnostic.message)+'</p>'+(i.diagnostic.details??[]).map(t=>'<p>'+e(typeof t==='string'?t:JSON.stringify(t))+'</p>').join('')+(i.trace?.requestId?'<p>请求编号：'+e(i.trace.requestId)+'</p>':'')+'</details>';
  if(i?.assumptions?.length)$('#parse-message').innerHTML+='<details class="parse-details"><summary>查看本次理解与假设</summary>'+i.assumptions.map(t=>'<p>'+e(t)+'</p>').join('')+'</details>';
  $('#clarifications').innerHTML=(i?.questions??[]).map((q,qi)=>'<div class="question"><p>'+e(q.label)+'</p><div class="question-options">'+q.options.map((o,oi)=>'<button data-action="clarify" data-q="'+qi+'" data-o="'+oi+'">'+e(o.label)+'</button>').join('')+'</div></div>').join('');
  $('#clarification-options').classList.toggle('hidden',!i?.questions?.length);
  renderUnresolved();
}
function refreshResult(){if(!resultData()||!state.hasRun)return;state.result=screen(resultData().stocks,state.executed,{industry:state.executedIndustry});renderResults();renderSensitivity();renderWorkflow();if(state.view==='sources')renderOther();}
function renderResults(){
  const r=state.result;if(!r)return;
  for(const k of ['included','excluded','unknown'])$(`#${k}-count`).textContent=r[k].length;
  const query=$('#search').value.trim().toLowerCase();const rows=r[state.tab].filter(s=>s.name.includes(query)||s.code.includes(query)).sort((a,b)=>a.code.localeCompare(b.code));
  $('#stock-rows').innerHTML=rows.length?rows.map(s=>`<tr><td><input type="checkbox" data-action="select-stock" data-code="${s.code}" ${state.selected.has(s.code)?'checked':''} aria-label="比较${e(s.name)}"></td><td><button class="stock-name" data-action="evidence" data-code="${s.code}">${e(s.name)}</button><span class="stock-code">${s.thscode}<i>${e(s.industry)}</i></span></td>${['revenueGrowth','profitGrowth','pe','volatility'].map(f=>{const check=s.checks.find(c=>c.condition.field===f);return `<td class="${!Number.isFinite(s.metrics[f])?'missing':check?.status==='fail'?'failed':f==='revenueGrowth'||f==='profitGrowth'?(s.metrics[f]>=0?'positive':'failed'):''}">${fmt(s.metrics[f])}${Number.isFinite(s.metrics[f])&&FIELDS[f].unit==='%'?'%':''}</td>`;}).join('')}<td><div class="reason-text">${e(s.status==='included'?'全部已确认条件均满足':s.status==='excluded'?s.checks.filter(c=>c.status==='fail').slice(0,2).map(c=>label(c.condition.field)+'不满足').join('、'):s.issues[0]||s.checks.find(c=>c.status==='unknown')?.reason||'缺少条件所需数据')}</div><button class="evidence-link" data-action="evidence" data-code="${s.code}"><span class="mini-dot ${s.status==='excluded'?'fail':s.status==='unknown'?'unknown':''}"></span>查看依据</button></td></tr>`).join(''):`<tr><td colspan="7"><div class="empty-state"><strong>${!r.rows.length?'当前范围没有公司':state.tab==='included'?'没有公司满足全部条件':state.tab==='excluded'?'没有被排除的公司':'没有待核验的公司'}</strong>${!r.rows.length?'所选指数与行业成分没有交集，请调整股票范围。':query?'试试其他名称或代码。':state.tab==='included'?'检查条件是否过严，使用下方条件变化分析查看影响。':'数据状态与条件判断将分别展示。'}</div></td></tr>`;
  $('#table-caption').textContent=`当前范围 ${r.rows.length} 只 · 显示 ${rows.length} 只 · ${resultData()?.stocks[0]?.quote?.source??resultData()?.scope?.source??'数据源未知'}`;
  $('#stale').classList.toggle('hidden',!state.stale);renderCompareBar();
}
function renderCompareBar(){$('#compare-bar').classList.toggle('hidden',!state.selected.size);$('#compare-bar').innerHTML=`已选 ${state.selected.size} / 4 只 · ${[...state.selected].map(code=>e(state.result?.rows.find(s=>s.code===code)?.name)).join('、')}<button class="text-button" data-action="compare">比较字段与走势 →</button><button class="text-button" data-action="clear-compare">清空</button>`;}
function setupSensitivity(){const cs=state.executed.filter(c=>c.enabled);const old=$('#sensitivity-field').value;$('#sensitivity-field').innerHTML=cs.map(c=>`<option value="${e(c.id)}">${e(label(c.field))} ${e(OPS[c.op])}</option>`).join('');const c=cs.find(c=>c.id===old)||cs.find(c=>c.field==='pe')||cs[0];if(c){$('#sensitivity-field').value=c.id;$('#sensitivity-value').value=c.field==='pe'?15:c.value;$('#sensitivity-value').min=FIELDS[c.field].min;$('#sensitivity-value').max=FIELDS[c.field].max;}renderSensitivity();}
function renderSensitivity(){if(!resultData())return;const c=state.executed.find(c=>c.id===$('#sensitivity-field').value);if(!c)return;$('#sensitivity-unit').textContent=FIELDS[c.field].unit;const value=$('#sensitivity-value').value===''?NaN:Number($('#sensitivity-value').value);if(!state.hasRun)return;const r=sensitivity(resultData().stocks,state.executed,c.id,value,{industry:state.executedIndustry});$('.threshold-presets').classList.toggle('hidden',c.field!=='pe');if(r.errors?.length){$('#sensitivity-result').innerHTML='<span>阈值无效</span>';$('#sensitivity-changes').textContent=r.errors.join('；');$('#apply-sensitivity').disabled=true;return;}$('#apply-sensitivity').disabled=state.stale;$('#sensitivity-result').innerHTML=`<div><b>${r.before}</b><span>当前候选</span></div><span class="arrow">→</span><div><b>${r.after}</b><span>修改后候选</span></div>`;$('#sensitivity-changes').innerHTML=`${r.added.length?`新增 ${r.added.length} 只：${r.added.map(s=>e(s.name)).join('、')}`:'无新增'}<br>${r.removed.length?`移出 ${r.removed.length} 只：${r.removed.map(s=>e(s.name)).join('、')}`:'无移出'} · 待核验 ${r.unknown} 只不计入候选`;}
function setStatus(message,error=false){$('#load-status').innerHTML=`<span class="live-dot"></span><span class="${error?'status-error':''}">${e(message)}</span><button class="status-link" data-view="sources">查看数据口径 ↗</button>`;}
async function fetchScopeSnapshot(u,onProgress=()=>{}){
  const stocks=[];let failures=0;
  for(let offset=0;offset<u.total;offset+=4){
    onProgress(offset,u.total);
    const metas=u.stocks.slice(offset,offset+4);
    try{
      const batch=await api('/api/refresh',{pool:u.pool,industry:u.industry,universeId:u.id,offset});
      if(batch.universeId!==u.id)throw new Error('股票范围已变化，请重新获取范围');
      const rows=metas.map(meta=>batch.stocks.find(s=>s.thscode===meta.thscode));
      if(rows.some(s=>!s)||batch.stocks.length!==metas.length)throw new Error('批次返回公司不完整或与范围不一致');
      stocks.push(...rows);
    }catch(err){
      if(err.code==='UNIVERSE_CHANGED'||/范围已|名册|成分.*(?:变化|更新)/.test(err.message))throw err;
      failures++;stocks.push(...metas.map(s=>({...s,quote:null,reports:[],bars:[],issues:['取数失败：'+err.message],evidence:[]})));
    }
  }
  onProgress(u.total,u.total);
  return {id:'live-'+u.id+'-'+Date.now(),fetchedAt:new Date().toISOString(),scope:u,stocks,failures};
}
async function refreshData(quiet=false){
  if(state.busy)return false;state.busy=true;renderScope();$('#refresh').disabled=true;$('#refresh').textContent='↻ 取数中';updateExecute();if(state.view==='sources')renderOther();
  try{
    const u=await loadScope();if(!u)return false;
    const data=await fetchScopeSnapshot(u,(done,total)=>setStatus('正在获取扶摇数据 · '+u.label+' · '+done+' / '+total+' · 完成后统一计算'));
    state.data=data;
    if(state.hasRun&&sameScope(state.executedData)){state.executedData=data;refreshResult();}
    const dates=[...new Set(data.stocks.map(s=>s.quote?.date).filter(Boolean))],abnormal=data.stocks.filter(s=>normalizeStock(s).issues.length).length;
    setStatus(u.total?'扶摇 · '+u.label+' · '+data.stocks.filter(s=>s.quote).length+' / '+u.total+'只已取数 · '+(dates.length===1?'行情 '+dates[0]:dates.length?'行情日期不一致':'行情时点缺失')+(abnormal?' · '+abnormal+'只数据异常，查看依据':''):'所选指数与行业成分没有交集，未请求个股数据',Boolean(abnormal));
    if(!quiet)toast(data.failures?'部分取数失败，相关公司保留为待核验。':'真实数据已更新。');return true;
  }catch(err){$('#scope-error').innerHTML='<div class="notice error">本次取数未完成：'+e(err.message)+'。没有生成正常筛选结论。</div>';setStatus('本次取数未完成，需重新获取',true);toast('取数未完成，请重试。');return false;}
  finally{state.busy=false;renderScope();$('#refresh').disabled=false;$('#refresh').innerHTML='<span>↻</span> 更新数据';updateExecute();if(state.view==='sources')renderOther();}
}

async function interpret(){
  if(state.parsedBusy)return;const text=$('#intent').value.trim();if(!text){$('#intent-error').innerHTML='<div class="notice error">先写下想法，或选择一个例子。</div>';$('#intent').focus();return;}
  state.parsedBusy=true;$('#interpret').disabled=true;$('#interpret').textContent='正在整理…';$('#intent-error').innerHTML='';updateExecute();
  try{const i=await api('/api/interpret',{text});if(text!==$('#intent').value.trim()){toast('输入已变化，请重新整理条件。');return;}state.interpretation=i;state.interpretedText=text;state.draftReady=true;state.stage='conditions';$('#advanced').open=false;state.draft=i.conditions;state.industry=i.industry??'全部行业';if(i.pool)state.pool=i.pool;$('#industry').value=state.industry;markDraft();await loadScope();renderInterpretation();renderConditions();showStage('conditions');$('#result-label').textContent=state.hasRun?'上次筛选结果':'';toast(i.mode==='blocked'?'请改成可以用数据检查的条件。':'条件已整理，检查后点击筛选。');}
  catch(err){state.interpretedText=null;$('#intent-error').innerHTML='<div class="notice error">整理失败：'+e(err.message)+'。请重试；上次条件没有被替换。</div>';toast('未生成新条件，请重新整理。');}
  finally{state.parsedBusy=false;$('#interpret').disabled=false;$('#interpret').innerHTML='整理筛选条件 <span aria-hidden="true">→</span>';updateExecute();}
}
async function execute(){
  if($('#execute').disabled)return;
  const accepted=JSON.stringify({conditions:state.draft,pool:state.pool,industry:state.industry,intent:$('#intent').value.trim()});
  if(!hasCurrentData()&&!await refreshData(true))return;if(!state.data)return;
  if(accepted!==JSON.stringify({conditions:state.draft,pool:state.pool,industry:state.industry,intent:$('#intent').value.trim()})){toast('数据已取得，但条件已变化，请重新确认。');return;}
  state.executedData=state.data;state.executed=clone(state.draft);state.executedIndustry=state.industry;state.executedIntent=state.interpretedText;state.executedInterpretation=clone(state.interpretation);state.executedUnresolved=clone(unsupportedRequirements());state.hasRun=true;state.stale=false;state.stage='results';state.selected.clear();refreshResult();setupSensitivity();$('#result-label').textContent=state.executed.filter(c=>c.enabled).length+' 个已确认条件';updateExecute();toast('筛选完成：'+state.result.included.length+' 只符合，'+state.result.unknown.length+' 只暂无法判断。');showStage('results');
}

function formula(s,field){const f=s.fin,n=v=>Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'缺失';if(field==='revenueGrowth')return `(${n(f.latest?.revenue)} / ${n(f.prior?.revenue)} − 1) × 100 · 单位元，${f.period??'—'}与上年同期累计值`;if(field==='profitGrowth')return `(${n(f.latest?.profit)} / ${n(f.prior?.profit)} − 1) × 100 · 负基期/零基期不计算`;if(field==='acceleration')return `最新同比 ${fmt(f.profitGrowth)}% − 上期同比 ${fmt(f.previous&&f.prevPrior&&f.prevPrior.profit>0?(f.previous.profit/f.prevPrior.profit-1)*100:null)}% · 累计周期不同`;if(field==='pe')return s.valuation?`扶摇 data.item[].pe_ttm = ${n(s.valuation.peTTM)} · 供应商TTM；负值不通过低估值筛选`:`总市值 ${n(s.quote?.marketCap)} / TTM净利 ${n(f.ttm)} · 元/元；TTM = ${n(f.annual?.profit)} + ${n(f.latest?.profit)} − ${n(f.prior?.profit)}`;if(field==='marketCap')return `${n(s.quote?.marketCap)} / 100,000,000 · FU快照无总市值时明确缺失`;return `${s.hist.window?.join(' ～ ')??'历史数据不足'} · 后复权收盘价 · ${field==='volatility'?'60个对数收益的样本标准差 × √252 × 100':'61个收盘价的峰谷最大回撤'}`;}
function evidence(code){
  const raw=resultData()?.stocks.find(s=>s.code===code);if(!raw)return;const s=state.result?.rows.find(s=>s.code===code)||normalizeStock(raw);
  const status={included:'符合已确认条件',excluded:'未符合全部条件',unknown:'数据不完整或异常，暂无法判断'};
  const checks=s.checks??[],pass=checks.filter(c=>c.status==='pass').length,fail=checks.filter(c=>c.status==='fail').length;
  modal(s.name+' · 筛选依据',s.thscode+' / '+s.industry+' / '+(status[s.status]??'当前范围外'),
    '<div class="evidence-meta"><span>行情截至 '+e(s.quote?.date??'未知')+'</span><span>财报期间 '+e(s.fin.period??'缺失')+'</span><span>披露 '+e(s.fin.noticeDate??'未知')+'</span></div>'+
    '<p>事实：'+pass+' 个条件满足，'+fail+' 个不满足，'+checks.filter(c=>c.status==='unknown').length+' 个无法判断。以下数值来自金融数据，由固定规则计算。</p>'+
    (s.issues.length?'<div class="notice">数据问题：'+s.issues.map(e).join('；')+'</div>':'')+
    '<div class="check-list">'+checks.map(c=>'<div class="check-item"><div>'+e(conditionWords(c.condition))+' '+helpButton(c.condition.field)+'<small>'+e(c.date??'时点未知')+'</small>'+(c.reason?'<small class="missing">'+e(c.reason)+'</small>':'')+'</div><div class="check-value '+({pass:'positive',fail:'failed',unknown:'missing'}[c.status])+'">'+fmt(c.value)+' '+e(c.unit)+'<small>'+({pass:'满足',fail:'不满足',unknown:'无法判断'}[c.status])+'</small></div></div>').join('')+'</div>'+
    '<div class="notice info">解释：“改善、合理、稳定”是你确认的筛选假设。条件匹配不代表公司一定优质，也不能预测价格。</div>'+
    '<details class="source-item"><summary>查看计算方式与数据时点</summary>'+(s.quote?.asOfBasis?'<p>'+e(s.quote.asOfBasis)+'</p>':'')+'<div class="audit-scroll"><table class="audit-metrics"><thead><tr><th>指标</th><th>数值 / 时间</th><th>计算依据</th></tr></thead><tbody>'+checks.map(c=>'<tr><td>'+e(FIELDS[c.condition.field].label)+'</td><td>'+fmt(c.value)+' '+e(c.unit)+'<small>'+e(c.date??'未知')+'</small></td><td><div class="formula">'+e(formula(s,c.condition.field))+'</div></td></tr>').join('')+'</tbody></table></div></details>'+
    '<details class="source-item"><summary>查看原始数据与请求记录</summary><p>来源、获取时间、请求编号与原始字段可用于复核。</p>'+(s.evidence??[]).map(ev=>'<details class="source-item"><summary>'+e({quote:'行情快照',financials:'利润表',history:'后复权日K线',valuation:'估值快照'}[ev.type]??ev.type)+' <span class="tag '+(ev.error?'red':'muted')+'">'+e(ev.error?'调用失败':ev.source)+'</span></summary><div class="source-meta">获取：'+e(time(ev.fetchedAt))+' / 请求编号：'+e(ev.requestId??'公开接口未提供')+'<br><a href="'+e(ev.url)+'" target="_blank" rel="noopener">查看请求地址</a>（授权接口需要服务端密钥）</div><pre class="raw-data">'+e(JSON.stringify(ev.error?{error:ev.error,raw:ev.raw}:ev.raw,null,2))+'</pre></details>').join('')+'</details>'+
    '<details class="source-item"><summary>用另一来源核验财报</summary><p>iFinD 会返回财报原文；报告期、累计/单季度、单位需要先对齐，结果不会直接覆盖本次筛选。</p><button class="button secondary small" data-action="verify" data-code="'+s.code+'" data-period="'+(s.fin.period??'')+'" '+(!state.config.ifind||!s.fin.period?'disabled':'')+'>'+(state.config.ifind?'查询 iFinD 财报':'iFinD 未配置')+'</button><div id="verify-result"></div></details>'+
    '<div class="dialog-footer"><button class="button secondary" data-action="export-stock" data-code="'+s.code+'">导出这只股票的依据</button><button class="button primary" data-action="close">完成检查</button></div>');
}

function sparkline(bars){const cs=bars.slice(-61).map(b=>b.close).filter(Number.isFinite);if(cs.length<2)return '<p>历史价格缺失</p>';const lo=Math.min(...cs),hi=Math.max(...cs),points=cs.map((v,i)=>`${i/(cs.length-1)*190},${48-(v-lo)/(hi-lo||1)*40}`).join(' ');return `<svg viewBox="0 0 190 55" role="img" aria-label="近60日后复权收盘价走势"><polyline points="${points}" stroke="#2463d6" stroke-width="1.8" fill="none"/><path d="M0 54H190" stroke="#e5eaf0"/></svg>`;}
function compareStocks(){if(state.selected.size<2){toast('请至少选择两只股票进行比较。');return;}const rows=[...state.selected].map(code=>state.result.rows.find(s=>s.code===code)).filter(Boolean);modal('比较研究候选',`对齐口径再比较 · ${rows.length} 只 · 不形成投资排名`,`<p>走势小图各自缩放，仅展示形态，不比较绝对价格。财报周期不同、来源不同或数据缺失时，请先查看条件证据。</p><div class="comparison">${rows.map(s=>`<div class="comparison-card"><h3>${e(s.name)}</h3><small>${s.thscode}</small>${sparkline(s.bars)}<dl>${['revenueGrowth','profitGrowth','pe','volatility','drawdown'].map(f=>`<dt>${e(label(f))} ${helpButton(f)}</dt><dd>${fmt(s.metrics[f])} ${e(FIELDS[f].unit)}</dd>`).join('')}</dl><p>报告期 ${e(s.fin.period??'缺失')}<br>行情 ${e(s.quote?.date??'缺失')}<br>${e(s.quote?.source??'未知')}</p><button class="text-button" data-action="evidence" data-code="${s.code}">逐项证据 ↗</button></div>`).join('')}</div>`);}
function exportJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function audit(){const data=resultData();return {version:3,intent:state.executedIntent,conditions:state.executed,industry:state.executedIndustry,snapshotId:data?.id,fetchedAt:data?.fetchedAt,exportedAt:new Date().toISOString(),scope:data?.scope,interpretation:state.executedInterpretation,explicitlyOmittedRequests:state.executedUnresolved,rows:state.result?.rows,disclaimer:'仅研究条件匹配，不构成投资建议。授权数据仅供本人核验，不得未经许可公开传播。'};}
function saveDialog(){if(!state.result||state.stale){toast('请先确认并执行当前条件，再保存。');return;}modal('保存筛选','筛选条件保存在当前浏览器，可下次载入使用。',`<label class="field-label" for="strategy-name">筛选名称</label><input id="strategy-name" class="form-input" maxlength="60" value="经营改善与合理估值"><p>${state.executed.filter(c=>c.enabled).length} 项条件 / ${e(state.executedIndustry)} / 当前符合 ${state.result.included.length} 只。保存条件与数据时点，不保存授权原始数据。</p><div class="dialog-footer"><button class="button secondary" data-action="close">取消</button><button class="button primary" data-action="confirm-save">保存筛选</button></div>`);$('#strategy-name').value=(state.executedIntent||'我的筛选').slice(0,40);$('#strategy-name').select();}
function createMonitor(){if(!state.result||state.stale){toast('请先确认并执行条件，再创建监控。');return;}modal('创建条件监控','持续观察条件变化，不生成交易信号。',`<p>保存本次已确认的条件，重新取数后比较“新增符合 / 移出 / 待核验”。</p><div class="notice">本版本为浏览器监控：只在页面打开且开启自动检查时，每60秒取数。关闭页面会停止，不提供服务器后台监控或邮件通知。</div><label class="field-label" for="monitor-name">监控名称</label><input id="monitor-name" class="form-input" maxlength="60" value="经营改善观察"><div class="dialog-footer"><button class="button secondary" data-action="close">取消</button><button class="button primary" data-action="confirm-monitor">保存监控任务</button></div>`);}
function showUniverse(){
  const u=state.universe;if(!u){toast('尚未取得官方股票范围，请重新获取。');return;}
  modal('当前股票范围',u.label+' · '+u.total+'家公司 · 扶摇官方成分',
    '<p>名单直接来自扶摇官方指数成分'+(u.industry==='全部行业'?'':'，并与“'+e(u.industry)+'”官方行业成分取交集')+'。这是当前范围，不代表全A股扫描。</p><p>成分数据就绪：'+e(time(u.asOf))+'；获取：'+e(time(u.fetchedAt))+'。就绪时间不等于成分生效日期，不能用于历史成分回测。</p>'+
    '<div class="live-universe-list">'+u.stocks.map(s=>'<div><span>'+e(s.name)+'</span><code>'+e(s.thscode)+'</code></div>').join('')+'</div>'+
    '<details class="source-item"><summary>成分来源与请求记录</summary><pre class="raw-data">'+e(JSON.stringify(u.evidence,null,2))+'</pre></details><div class="dialog-footer"><button class="button primary" data-action="close">知道了</button></div>');
}

async function loadDraft(draft,interpretation=null){
  const errors=validateConditions(draft.conditions);if(errors.length){toast('方案条件无效，请检查导出记录。');return;}
  state.draft=clone(draft.conditions);state.industry=draft.industry;if(draft.pool&&POOLS[draft.pool])state.pool=draft.pool;$('#industry').value=draft.industry;$('#intent').value=draft.intent??'';
  state.interpretation=interpretation??{mode:'saved',conditions:clone(draft.conditions),assumptions:[],unresolved:[],questions:[]};state.interpretedText=(draft.intent??'').trim();state.draftReady=true;state.stage='conditions';$('#advanced').open=false;
  markDraft();renderConditions();renderInterpretation();switchView('research');showStage('conditions');await loadScope();
  toast('方案已载入，检查或修改后再筛选。');
}
function switchView(view){hideHelp();state.view=view;$$('.nav-button').forEach(el=>{el.classList.toggle('active',el.dataset.view===(view==='monitors'?'saved':view));el.setAttribute('aria-current',el.dataset.view===(view==='monitors'?'saved':view)?'page':'false');});$('#research-view').classList.toggle('hidden',view!=='research');$('#other-view').classList.toggle('hidden',view==='research');if(view!=='research')renderOther();window.scrollTo({top:0,behavior:'instant'});}
function renderOther(){
  const root=$('#other-view');
  if(state.view==='saved'){
    root.innerHTML='<div class="page-intro"><div><h2>我的筛选</h2><p>从预制方案开始，也可以保存自己修改的条件。</p></div><button class="text-button" data-view="monitors">条件监控'+(monitors.length?'（'+monitors.length+'）':'')+' →</button></div>'+
      '<section aria-label="预制研究方案"><div class="section-heading"><h3>预制方案</h3><span>条件可修改，检查后再执行</span></div><div class="preset-grid">'+PRESETS.map(p=>
      '<article class="preset-card panel"><div class="preset-heading"><span class="preset-category">'+e(p.category)+'</span><span class="preset-scope">'+e(p.industry)+'</span></div><h3>'+e(p.name)+'</h3><p>'+e(p.blurb)+'</p><div class="preset-criteria">'+p.conditions.map(c=>'<span>'+e(conditionWords(c))+'</span>').join('')+'</div><button class="button secondary small" data-action="load-preset" data-id="'+e(p.id)+'">载入并检查 <span aria-hidden="true">→</span></button></article>').join('')+'</div></section>'+
      '<section class="personal-schemes"><div class="section-heading"><h3>我保存的方案 <span class="count-badge">'+saved.length+'</span></h3><span>仅保存在当前浏览器</span></div>'+
      (saved.length?saved.map(s=>'<article class="saved-card panel"><div><h3>'+e(s.name)+'</h3><p>'+e(s.conditions.filter(c=>c.enabled).map(conditionWords).join(' · '))+'</p><small>'+e(s.industry)+' / 保存 '+e(time(s.createdAt))+' / '+e(s.asOf??'未知时点')+'</small></div><div class="saved-actions"><button class="button secondary small" data-action="load-strategy" data-id="'+e(s.id)+'">载入检查</button><button class="text-button" data-action="export-strategy" data-id="'+e(s.id)+'">导出</button><button class="text-button" data-action="delete-strategy" data-id="'+e(s.id)+'">删除</button></div></article>').join(''):'<p class="saved-hint">还没有保存的方案。使用预制方案，筛选后点击“保存筛选”即可留存。</p>')+'</section>';return;
  }
  if(state.view==='monitors'){root.innerHTML=`<section class="panel source-card"><button class="text-button" data-view="saved">← 我的筛选</button><h2>条件监控</h2><p>只监控已确认条件的匹配状态；新增符合、移出与待核验分别记录。当前版本仅在页面保持打开时运行。</p><button class="button ${state.monitorRunning?'secondary':'primary'} small" data-action="toggle-auto" ${!monitors.length?'disabled':''}>${state.monitorRunning?'停止每60秒自动检查':'开启每60秒自动检查'}</button><span class="monitor-status"> ${state.monitorRunning?'页面关闭后停止':'自动检查未开启'}</span></section>${monitors.map(m=>`<article class="saved-card panel"><div><h3>${e(m.name)}</h3><p>${m.conditions.filter(c=>c.enabled).length} 项条件 / ${e(m.industry)} / 基线符合 ${m.baseline.length} 只</p><small>上次检查：${e(m.checkedAt?time(m.checkedAt):'尚未执行')}<br>${e(m.message??'等待首次检查')}</small></div><div class="saved-actions"><button class="button secondary small" data-action="check-monitor" data-id="${e(m.id)}">立即检查</button><button class="text-button" data-action="delete-monitor" data-id="${e(m.id)}">删除</button></div></article>`).join('')}`;return;}
  if(state.view==='sources'){
    const stocks=sameScope(state.data)?state.data.stocks:[],sources=[...new Set(stocks.map(s=>s.quote?.source).filter(Boolean))],dates=[...new Set(stocks.map(s=>s.quote?.date).filter(Boolean))];
    const available=stocks.filter(s=>s.quote).length,abnormal=stocks.filter(s=>!s.quote||normalizeStock(s).issues.length).length;
    const mode=state.interpretation?.mode,modeName=({llm:'本次由 AI 整理',fallback:'本次使用本地规则',rules:'本次使用本地规则',preset:'本次使用预制方案',saved:'本次使用保存的方案',blocked:'本次请求已停止'}[mode])??(state.config.ai?'AI 服务端已配置':'未配置 AI，使用本地规则');
    root.innerHTML='<div class="page-intro"><div><h2>数据与说明</h2><p>查看筛选范围、数据时点与指标口径。这里无需填写设置。</p></div><button class="button secondary small" data-action="refresh-data" '+(state.busy?'disabled':'')+'>'+(state.busy?'更新中…':'更新当前数据')+'</button></div>'+
      '<section class="data-overview panel" aria-label="当前数据"><div><span>当前数据来源</span><strong>'+e(sources.join('、')||'尚未取得行情')+'</strong><small>'+available+' / '+(state.universe?.total??'—')+' 只已取数'+(abnormal?' · '+abnormal+' 只数据异常，逐只核验':'')+'</small></div><div><span>行情时点</span><strong>'+e(dates.length===1?dates[0]:dates.length>1?'日期不一致（'+dates.length+'个）':'时点未知')+'</strong><small>各股票的财报时点在“查看依据”中</small></div><div><span>最近取数</span><strong>'+e(time(sameScope(state.data)?state.data.fetchedAt:null))+'</strong><small>'+e(state.busy?'正在更新，完成后统一计算':'数据失败不会补成正常数值')+'</small></div></section>'+
      '<div class="source-info-grid"><section class="source-card panel"><h3>当前股票范围</h3><p>'+e(scopeLabel())+'。名单来自扶摇官方指数成分接口，行业范围与官方行业成分取交集，每次按接口返回的完整成分确定范围。</p><p>确认筛选后，逐只获取行情、估值、财报和后复权历史价格，再由规则计算。名单或数据取数失败会明确提示。</p><button class="text-button" data-action="show-universe">查看公司名单与来源 →</button></section>'+
      '<section class="source-card panel"><h3>谁在做判断？</h3><dl class="role-list"><div><dt>AI</dt><dd>把你的描述整理成待确认的条件，不生成财务数字或候选名单。</dd></div><div><dt>数据</dt><dd>扶摇提供行情与财务数据；iFinD用于独立核验。未配置授权时无法执行在线取数。</dd></div><div><dt>筛选</dt><dd>只执行你确认的条件，逐项区分符合、未符合和暂无法判断。</dd></div></dl><span class="parse-mode-label">'+e(modeName)+'</span></section></div>'+
      '<details class="info-section panel"><summary><span>指标怎么计算？</span><small>收入、利润、估值与历史走势</small></summary><div class="info-body definition-list">'+Object.entries(FIELDS).map(([k,f])=>'<div><h3>'+e(label(k))+' '+helpButton(k)+' <span class="tag muted">'+e(f.unit)+'</span></h3><p>'+e(HELP[k].explain)+'</p><p class="definition-basis">'+e(f.definition)+'</p></div>').join('')+'</div></details>'+
      '<details class="info-section panel"><summary><span>数据异常与使用边界</span><small>缺失、过期、监控与回测</small></summary><div class="info-body"><p>行情超过7个自然日、财报报告期超过200天、价格历史与行情时点冲突，均需要核验。这些是产品采用的保守阈值。</p><p>指数与行业成分来自当前官方列表，不代表全市场筛选或历史成分回测。保存仅在当前浏览器，比较可选择2～4只公司；监控仅在页面打开且开启时运行。尚未实现历史财报版本的点时回测和服务器后台监控。</p><p>仅用于研究条件匹配，不提供买卖建议、价格预测或收益承诺。</p></div></details>'+
      '<details class="info-section panel"><summary><span>独立核验与来源文档</span><small>iFinD与扶摇</small></summary><div class="info-body"><p>查看股票依据时可用iFinD核验财报原文；累计/单季度、单位与日期需对齐。下方智能检索使用独立范围，不自动补入本次候选。</p><button class="button secondary small" data-action="ifind-search" '+(!state.config.ifind?'disabled':'')+'>'+(state.config.ifind?'iFinD 智能检索交叉检查':'iFinD 未配置')+'</button><p class="source-links"><a href="https://fuyao.aicubes.cn/docs/" target="_blank" rel="noopener">扶摇官方文档 ↗</a><a href="https://mcp.51ifind.com/" target="_blank" rel="noopener">iFinD MCP ↗</a></p></div></details>';
  }

}
async function checkMonitor(id){
  const m=monitors.find(item=>item.id===id);if(!m||state.busy)return;
  if(!m.pool){m.message='旧版监控没有官方股票池，请载入条件重新筛选后创建监控。';writeLocal('monitors',monitors);if(state.view==='monitors')renderOther();toast(m.message);return;}
  state.busy=true;updateExecute();renderScope();
  try{
    const u=await api('/api/universe?pool='+encodeURIComponent(m.pool)+'&industry='+encodeURIComponent(m.industry));
    const data=await fetchScopeSnapshot(u),r=screen(data.stocks,m.conditions,{industry:m.industry});
    const codes=r.included.map(s=>s.code),added=r.included.filter(s=>!m.baseline.includes(s.code)),unknown=r.unknown.map(s=>s.code),inScope=new Set(u.stocks.map(s=>s.code));
    const removed=m.baseline.filter(c=>!codes.includes(c)&&!unknown.includes(c)&&inScope.has(c)),outside=m.baseline.filter(c=>!inScope.has(c));
    m.message='新增符合 '+added.length+'只：'+(added.map(s=>s.name).join('、')||'无')+'；移出 '+removed.length+'只；待核验 '+unknown.length+'只；已离开当前官方成分 '+outside.length+'只（不计作条件失效）。';
    m.baseline=[...new Set([...codes,...m.baseline.filter(c=>unknown.includes(c))])];m.checkedAt=new Date().toISOString();writeLocal('monitors',monitors);toast(m.message);
  }catch(err){m.message='检查失败：'+err.message+'；上次基线保留。';writeLocal('monitors',monitors);toast(m.message);}
  finally{state.busy=false;updateExecute();renderScope();if(state.view==='monitors')renderOther();}
}
let autoTimer,autoChecking=false;
function toggleAuto(){
  state.monitorRunning=!state.monitorRunning;clearInterval(autoTimer);
  if(state.monitorRunning)autoTimer=setInterval(async()=>{if(state.busy||autoChecking||document.hidden)return;autoChecking=true;try{for(const m of monitors)await checkMonitor(m.id);}finally{autoChecking=false;}},60000);
  renderOther();
}

function changeCondition(ev){
  const el=ev.target,id=el.closest('[data-id]')?.dataset.id,c=state.draft.find(c=>c.id===id),p=el.dataset.property;
  if(!c||!p||ev.type==='input'&&p!=='value')return;
  c[p]=p==='enabled'?el.checked:p==='value'?(el.value===''?NaN:Number(el.value)):el.value;
  if(p==='field'){c.op=['revenueGrowth','profitGrowth','acceleration','marketCap'].includes(c.field)?'gte':'lte';c.value={pe:25,volatility:30,drawdown:10,marketCap:1000}[c.field]??0;c.origin='手动修改，口径需确认';}
  markDraft();renderConditions(p==='field');
}
$('#conditions').addEventListener('change',changeCondition);$('#conditions').addEventListener('input',changeCondition);
$('#industry').addEventListener('change',async()=>{state.industry=$('#industry').value;markDraft();renderConditions();await loadScope();});$$('[data-pool-select]').forEach(el=>el.addEventListener('change',async()=>{state.pool=el.value;markDraft();await loadScope();}));$('#unresolved').addEventListener('change',updateExecute);$('#interpret').addEventListener('click',interpret);$('#execute').addEventListener('click',execute);$('#refresh').addEventListener('click',()=>refreshData());$('#save').addEventListener('click',saveDialog);$('#create-monitor').addEventListener('click',createMonitor);$('#search').addEventListener('input',renderResults);
$('#add-condition').addEventListener('click',()=>{if(state.draft.length>=20){toast('最多20条条件。');return;}state.draft.push({id:'manual-'+Date.now(),field:'drawdown',op:'lte',value:10,enabled:true,origin:'手动添加条件'});markDraft();renderConditions();});
$('#sensitivity-field').addEventListener('change',()=>{const c=state.executed.find(c=>c.id===$('#sensitivity-field').value);$('#sensitivity-value').value=c.value;renderSensitivity();});$('#sensitivity-value').addEventListener('input',renderSensitivity);
$('#apply-sensitivity').addEventListener('click',()=>{const id=$('#sensitivity-field').value,c=state.draft.find(c=>c.id===id);if(!c){toast('该条件已从草案中删除，请重新筛选后再分析。');return;}if(state.stale){toast('请先执行修改后的条件，再分析阈值变化。');return;}c.value=Number($('#sensitivity-value').value);markDraft();renderConditions();showStage('conditions');$('#advanced').open=true;toast('阈值已加入条件草案，确认并筛选后生效。');});
$('#export').addEventListener('click',()=>{if(state.result)exportJSON(audit(),'stock-lens-audit.json');});
$('#intent').addEventListener('input',()=>{markDraft();$('#intent-error').innerHTML=state.draftReady&&state.interpretedText!==$('#intent').value.trim()?'<div class="notice">想法已修改，请重新整理条件。</div>':'';});
$('#help').addEventListener('click',()=>modal('使用说明','智能选股 · GOLD Workspace','<p>1. 输入你想找的公司，或点一个例子，点击“整理筛选条件”。</p><p>2. 检查 AI 理解的条件。点问号了解指标；需要调整时展开“修改条件与高级指标”，再点击“按这些条件筛选”。</p><p>3. 查看符合、未符合和暂无法判断的公司，点击“查看依据”检查原因和数据来源。</p><p>4. 可比较2～4只公司、保存筛选，或展开“条件改一点，结果会怎样？”查看调整影响。</p><div class="notice">当前在所选官方指数成分范围筛选，行业筛选使用官方行业成分交集。条件匹配仅供研究；不会形成买卖建议。监控仅在页面打开且可见时运行。</div>'));

document.addEventListener('click',async ev=>{
  const button=ev.target.closest('button');if(!button||button.classList.contains('metric-help'))return;if(button.dataset.stage){showStage(button.dataset.stage);return;}if(button.dataset.view){switchView(button.dataset.view);return;}if(button.dataset.example){$('#intent').value=button.dataset.example;await interpret();return;}if(button.dataset.tab){state.tab=button.dataset.tab;$$('[data-tab]').forEach(el=>{el.classList.toggle('active',el===button);el.setAttribute('aria-selected',el===button?'true':'false');});renderResults();return;}if(button.dataset.value){$('#sensitivity-value').value=button.dataset.value;renderSensitivity();return;}
  const action=button.dataset.action;if(!action)return;const id=button.dataset.id,code=button.dataset.code;
  if(action==='close')closeModal();
  if(action==='show-universe')showUniverse();if(action==='reload-scope')await loadScope();
  if(action==='refresh-data')await refreshData();
  if(action==='load-preset'){const preset=presetDraft(id);if(!preset){toast('该预制方案不存在。');return;}await loadDraft(preset,{mode:'preset',name:preset.name,conditions:preset.conditions,assumptions:preset.assumptions,unresolved:[],questions:[],message:'预制方案提供研究条件，尚未执行筛选。'});}
  if(action==='review-draft')showStage(workflowState({...state,intent:$('#intent').value}).canReview?'conditions':'input');
  if(action==='remove-condition'){state.draft=state.draft.filter(c=>c.id!==id);markDraft();renderConditions();}
  if(action==='definition'){const f=FIELDS[button.dataset.field];modal(f.label+' · 数据口径','单位：'+f.unit,`<p>${e(f.definition)}</p>`);}
  if(action==='clarify'){const q=state.interpretation.questions[Number(button.dataset.q)],o=q.options[Number(button.dataset.o)];if(o.unsupported){toast('行业相对估值尚未接入，请选择可验证的绝对口径或保留为未解决要求。');return;}if(q.id==='stability')state.draft=state.draft.filter(c=>c.field!=='volatility'&&!(c.field==='drawdown'&&c.origin==='经澄清选择的代理'));if(o.patch){if(o.replace)state.draft=state.draft.filter(c=>c.field!==o.replace);let c=state.draft.find(c=>c.field===o.patch.field);if(c)c.value=o.patch.value;else state.draft.push({id:'clarified-'+Date.now(),field:o.patch.field,value:o.patch.value,op:'lte',enabled:true,origin:'经澄清选择的代理'});}if(o.disable){const fields=Array.isArray(o.disable)?o.disable:[o.disable];state.draft.forEach(c=>{if(fields.includes(c.field))c.enabled=false;});}button.parentElement.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===button));markDraft();renderConditions();}
  if(action==='evidence')evidence(code);
  if(action==='compare')compareStocks();if(action==='clear-compare'){state.selected.clear();renderResults();}
  if(action==='export-stock'){const row=state.result.rows.find(s=>s.code===code);exportJSON({conditions:state.executed,stock:row,snapshotId:resultData().id,scope:resultData().scope,disclaimer:'授权数据仅供本人核验，不得未经许可公开传播。'},code+'-evidence.json');}
  if(action==='confirm-save'){const name=$('#strategy-name').value.trim();if(!name){toast('请填写筛选名称。');return;}const item={id:crypto.randomUUID(),name,conditions:clone(state.executed),pool:resultData().scope.pool,industry:state.executedIndustry,intent:state.executedIntent,createdAt:new Date().toISOString(),asOf:resultData().stocks[0]?.quote?.date,snapshotId:resultData().id};if(writeLocal('saved',[...saved,item])){saved.push(item);closeModal();toast('筛选已保存在当前浏览器。');}}
  if(action==='load-strategy'){const strategy=saved.find(s=>s.id===id);if(strategy)await loadDraft(strategy);else toast('该保存方案不存在。');}
  if(action==='export-strategy')exportJSON(saved.find(s=>s.id===id),'stock-lens-strategy.json');
  if(action==='delete-strategy'){const next=saved.filter(s=>s.id!==id);if(writeLocal('saved',next)){saved=next;renderOther();}}
  if(action==='confirm-monitor'){const name=$('#monitor-name').value.trim();if(!name){toast('请填写监控名称。');return;}const item={id:crypto.randomUUID(),name,conditions:clone(state.executed),pool:resultData().scope.pool,industry:state.executedIndustry,baseline:state.result.included.map(s=>s.code),createdAt:new Date().toISOString()};if(writeLocal('monitors',[...monitors,item])){monitors.push(item);closeModal();toast('监控任务已保存，可在“我的筛选 → 条件监控”中启动。');}}
  if(action==='check-monitor'){button.disabled=true;await checkMonitor(id);button.disabled=false;}
  if(action==='toggle-auto')toggleAuto();if(action==='delete-monitor'){const next=monitors.filter(m=>m.id!==id);if(writeLocal('monitors',next)){monitors=next;if(!monitors.length){state.monitorRunning=false;clearInterval(autoTimer);}renderOther();}}
  if(action==='verify'){button.disabled=true;button.textContent='正在独立核验…';try{const r=await api('/api/ifind-verify',{pool:resultData()?.scope?.pool,industry:resultData()?.scope?.industry,code,period:button.dataset.period});$('#verify-result').innerHTML=`<div class="notice">核验工具返回原文，尚未自动判定“一致”。请检查日期、累计/单季度与单位。获取：${e(time(r.fetchedAt))}</div><pre class="raw-data verify-content">${e(r.answer.replaceAll('\\n','\n'))}</pre><details class="source-item"><summary>指标参数与完整原文</summary><pre class="raw-data">${e(JSON.stringify(r,null,2))}</pre></details>`;}catch(err){$('#verify-result').innerHTML=`<div class="notice error">核验失败：${e(err.message)}。没有生成一致性结论。</div>`;}finally{button.disabled=false;button.textContent='重新核验当前报告期';}}
  if(action==='ifind-search'){modal('iFinD · 智能检索交叉检查','独立AI工具输出，不自动修改筛选条件或候选。',`<label class="field-label" for="ifind-query">请用明确的研究条件，范围不宜过大</label><textarea id="ifind-query" class="form-input" rows="3" maxlength="1200">银行行业，市盈率TTM不超过15倍，营业总收入同比大于0%</textarea><button class="button primary small" data-action="run-ifind">发起智能检索</button><div id="ifind-result"></div>`);}
  if(action==='run-ifind'){button.disabled=true;button.textContent='正在检索…';try{const r=await api('/api/ifind-search',{text:$('#ifind-query').value});$('#ifind-result').innerHTML=`<div class="notice">这是iFinD全市场工具原文，可能含不同口径或解析失败。零结果不等同于“市场上没有符合股票”。本研究引擎只计算当前已确认的官方成分范围。</div><pre class="raw-data verify-content">${e(r.answer.replaceAll('\\n','\n'))}</pre><details class="source-item"><summary>请求与完整响应</summary><pre class="raw-data">${e(JSON.stringify(r,null,2))}</pre></details>`;}catch(err){$('#ifind-result').innerHTML=`<div class="notice error">智能检索失败：${e(err.message)}</div>`;}finally{button.disabled=false;button.textContent='重新检索';}}
});
$('#stock-rows').addEventListener('change',ev=>{const el=ev.target;if(el.dataset.action!=='select-stock')return;const code=el.dataset.code;if(el.checked){if(state.selected.size>=4){el.checked=false;toast('最多比较4只股票。');return;}state.selected.add(code);}else state.selected.delete(code);renderCompareBar();});
async function init(){
  renderConditions();renderScope();
  try{state.config=await api('/api/config');renderInterpretation();await loadScope();}
  catch(err){setStatus('数据服务连接失败：'+err.message+'。请刷新页面重试。',true);updateExecute();}
}

init();

