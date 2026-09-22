import { classifyJob } from './classifier.js';
import { scrapeAllSources } from './scraper.js';

const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'};

function json(data, status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...CORS}});}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if(request.method==='OPTIONS') return new Response(null,{headers:CORS});
    if(request.method==='GET' && path==='/api/jobs'){
      const p=url.searchParams;
      const allJobs=await getJobs(env.JOBS_KV);
      const filtered=allJobs.filter(j=>{
        if(p.get('territory')&&j.territory!==p.get('territory'))return false;
        if(p.get('sector')&&j.sector!==p.get('sector'))return false;
        if(p.get('mode')&&j.mode!==p.get('mode'))return false;
        if(p.get('src')&&j.src!==p.get('src'))return false;
        if(p.get('q')){const q=p.get('q').toLowerCase();if(!`${j.title} ${j.co} ${(j.tags||[]).join(' ')}`.toLowerCase().includes(q))return false;}
        return true;
      });
      const limit=parseInt(p.get('limit')||'50');
      const offset=parseInt(p.get('offset')||'0');
      return json({total:filtered.length,jobs:filtered.slice(offset,offset+limit),sources:[...new Set(allJobs.map(j=>j.src))].sort()});
    }
    if(request.method==='POST' && path==='/api/jobs/ingest'){
      const {url:jobUrl}=await request.json();
      if(!jobUrl) return json({error:'url required'},400);
      const pageRes=await fetch(jobUrl,{headers:{'User-Agent':'RhizaJobsBot/1.0'}});
      const html=await pageRes.text();
      const text=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,8000);
      const classified=await classifyJob(text,jobUrl,env.ANTHROPIC_API_KEY);
      if(!classified) return json({error:'could not classify'},422);
      const job={...classified,url:jobUrl,addedAt:new Date().toISOString()};
      await saveJob(env.JOBS_KV,job);
      return json({ok:true,job});
    }
    if(request.method==='POST' && path==='/api/jobs/scrape'){
      const auth=request.headers.get('Authorization')||'';
      if(auth!==`Bearer ${env.SCRAPE_SECRET}`) return json({error:'unauthorized'},401);
      const results=await scrapeAllSources(env);
      return json(results);
    }
    if(request.method==='DELETE' && path.startsWith('/api/jobs/')){
      const auth=request.headers.get('Authorization')||'';
      if(auth!==`Bearer ${env.SCRAPE_SECRET}`) return json({error:'unauthorized'},401);
      await env.JOBS_KV.delete(`job:${path.split('/').pop()}`);
      return json({ok:true});
    }
    return json({error:'not found'},404);
  },
  async scheduled(event,env,ctx){ctx.waitUntil(scrapeAllSources(env));}
};

async function getJobs(kv){
  const index=await kv.get('index',{type:'json'});
  if(!index?.ids?.length) return [];
  const jobs=await Promise.all(index.ids.map(id=>kv.get(`job:${id}`,{type:'json'})));
  return jobs.filter(Boolean).sort((a,b)=>new Date(b.date)-new Date(a.date));
}

async function saveJob(kv,job){
  const id=btoa(job.url).replace(/[^a-zA-Z0-9]/g,'').slice(0,16);
  job.id=id;
  await kv.put(`job:${id}`,JSON.stringify(job),{expirationTtl:60*60*24*60});
  const index=(await kv.get('index',{type:'json'}))||{ids:[]};
  if(!index.ids.includes(id)){index.ids.unshift(id);index.ids=index.ids.slice(0,500);}
  await kv.put('index',JSON.stringify(index));
}
