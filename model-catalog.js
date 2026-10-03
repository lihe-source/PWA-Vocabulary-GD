import {DEFAULT_AI_MODELS} from './ai-models.js?v=V7_5_0';
import {request} from './network.js?v=V7_5_0';
export class ModelCatalogManager {
  constructor(storage){this.storage=storage;this.models=DEFAULT_AI_MODELS;this.job=null;this.jobKey='';this.checkedAt=0;this.key='';}
  async ensure(apiKey,{force=false,signal}={}){
    if(!apiKey)return this.models;
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(apiKey)));
    const key=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
    if(!force && this.key===key && Date.now()-this.checkedAt<86400000)return this.models;
    if(signal?.aborted)throw new Error('REQUEST_CANCELLED');
    if(this.job){
      if(this.jobKey===key)return this.job;
      await this.job.catch(()=>{});return this.ensure(apiKey,{force,signal});
    }
    let saved;try{saved=JSON.parse(this.storage.getItem('geminiModelCatalog')||'null');}catch{}
    if(!force && saved?.key===key && Date.now()-saved.checkedAt<86400000 && saved.models?.length){
      this.models=saved.models;this.key=key;this.checkedAt=saved.checkedAt;return this.models;
    }
    this.jobKey=key;
    this.job=(async()=>{
      let page='',all=[];
      for(let count=0;count<3;count++){
        const url=new URL('https://generativelanguage.googleapis.com/v1beta/models');
        url.searchParams.set('key',apiKey);url.searchParams.set('pageSize','1000');
        if(page)url.searchParams.set('pageToken',page);
        const result=await request(url.href,{}, {timeout:5000,retries:0,signal});
        all.push(...(result.data.models||[]));page=result.data.nextPageToken||'';if(!page)break;
      }
      const unique=new Map();
      for(const row of all){
        if(!row.supportedGenerationMethods?.includes('generateContent'))continue;
        const id=String(row.name||'').replace(/^models\//,'');
        if(!id.startsWith('gemini-'))continue;
        const preview=/preview|experimental|(?:^|-)exp(?:-|$)/i.test(id);
        unique.set(id,{id,label:row.displayName||id,tier:preview?'preview':'stable',tag:preview?'預覽':'可用'});
      }
      const models=[...unique.values()].sort((a,b)=>
        Number(a.tier==='preview')-Number(b.tier==='preview') ||
        Number(!a.id.includes('flash'))-Number(!b.id.includes('flash')) || b.id.localeCompare(a.id,undefined,{numeric:true}));
      if(!models.length)throw new Error('NO_AVAILABLE_AI_MODELS');
      if(signal?.aborted)throw new Error('REQUEST_CANCELLED');
      this.models=models;this.key=key;this.checkedAt=Date.now();
      this.storage.setItem('geminiModelCatalog',JSON.stringify({key,checkedAt:this.checkedAt,models}));
      return models;
    })();
    try{return await this.job;}finally{this.job=null;}
  }
}
