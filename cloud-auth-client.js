import {request} from './network.js?v=V7_5_0';
const SESSION='googleCloudSession';
const PENDING='googleCloudAuthPending';
const URL_KEY='googleAuthWorkerUrl';
function read(storage,key){try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}}
export function normalizeWorkerUrl(value){
  if(!String(value||'').trim())return '';
  const url=new URL(String(value).trim());
  const local=['localhost','127.0.0.1'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||
    url.search||url.hash||!['','/'].includes(url.pathname))throw new Error('INVALID_AUTH_URL');
  return url.origin;
}
function token(){
  const bytes=crypto.getRandomValues(new Uint8Array(32));let value='';
  for(const byte of bytes)value+=String.fromCharCode(byte);
  return btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function challenge(value){
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  let text='';for(const byte of bytes)text+=String.fromCharCode(byte);
  return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export class CloudAuthClient {
  constructor(storage){
    this.storage=storage;this.url='';this.state='local';this.email='';this.validatedAt=0;
    this.restoreJob=null;this.initJob=null;this.lastError='';
  }
  get configured(){return !!this.url;}
  get connected(){return this.state==='connected';}
  session(){const value=read(this.storage,SESSION);return value?.serviceUrl===this.url ? value : null;}
  _emit(){
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('vocabulary-cloud-state',{detail:this.status()}));
  }
  status(){return {state:this.state,email:this.email,configured:this.configured,lastError:this.lastError};}
  async init(){
    if(this.initJob)return this.initJob;
    this.initJob=(async()=>{
      let value=this.storage.getItem(URL_KEY)||'';
      if(!value){
        try{const result=await request('./cloud-config.json',{cache:'no-store'},{timeout:1800,retries:0});
          value=result.data.authWorkerUrl||'';}catch{}
      }
      try{this.url=normalizeWorkerUrl(value);}catch{this.lastError='INVALID_AUTH_URL';this._emit();return;}
      if(!this.url)return;
      this.email=this.session()?.email||'';
      await this.finishPending();
      if(this.session())await this.restore().catch(()=>{});
      else {this.state='needs-link';this._emit();}
    })();
    return this.initJob;
  }
  async configure(value,expectedClient=''){
    const url=normalizeWorkerUrl(value);
    if(url){
      const config=await request(url+'/api/config',{}, {timeout:10000,retries:0});
      if(!config.data.configured)throw new Error('AUTH_NOT_CONFIGURED');
      if(config.data.service!=='Vocabulary Google Auth')throw new Error('INVALID_AUTH_SERVICE');
      if(expectedClient&&config.data.clientId!==expectedClient)throw new Error('AUTH_CLIENT_MISMATCH');
      if(!expectedClient&&config.data.clientId)this.storage.setItem('gdriveClientId',config.data.clientId);
    }
    if(url!==this.url){
      await this.signOut();this.storage.removeItem(PENDING);
    }
    this.url=url;this.storage.setItem(URL_KEY,url);
    this.state=url?'needs-link':'local';this.lastError='';this.initJob=null;this._emit();
    return url;
  }
  async restore(){
    if(this.restoreJob)return this.restoreJob;
    const session=this.session();
    if(!session){this.state=this.configured?'needs-link':'local';this._emit();return false;}
    if(typeof navigator!=='undefined'&&navigator.onLine===false){this.state='offline';this._emit();return false;}
    this.state='restoring';this._emit();
    this.restoreJob=(async()=>{
      try{
        const result=await request(this.url+'/api/session',{headers:{Authorization:'Bearer '+session.token}},
          {timeout:12000,retries:0});
        if(this.session()?.token!==session.token)return false;
        this.email=result.data.email||session.email;this.state='connected';this.validatedAt=Date.now();this.lastError='';
        this.storage.setItem(SESSION,JSON.stringify({...session,email:this.email,clientId:result.data.clientId}));
        this.storage.setItem('gdriveEmail',this.email);
        return true;
      }catch(error){
        if(this.session()?.token!==session.token)return false;
        this.lastError=error.message;
        if(error.status===401||['CLOUD_RECONNECT_REQUIRED','TOKEN_EXPIRED'].includes(error.message)){
          this.storage.removeItem(SESSION);this.state='needs-link';
        }else this.state='unavailable';
        throw error;
      }finally{this._emit();}
    })();
    try{return await this.restoreJob;}finally{this.restoreJob=null;}
  }
  async ensureSession(){
    if(this.connected&&Date.now()-this.validatedAt<60000)return;
    if(!await this.restore())throw new Error('CLOUD_RECONNECT_REQUIRED');
  }
  async beginLink(email=''){
    if(!this.url)throw new Error('AUTH_NOT_CONFIGURED');
    const verifier=token();
    const result=await request(this.url+'/auth/start',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({challenge:await challenge(verifier),email})},{timeout:12000,retries:0});
    const target=new URL(result.data.authorizationUrl);
    if(target.origin!=='https://accounts.google.com')throw new Error('INVALID_AUTH_SERVICE');
    this.storage.setItem(PENDING,JSON.stringify({id:result.data.id,verifier,serviceUrl:this.url,expiresAt:result.data.expiresAt}));
    await this.storage.flush();
    location.assign(target.href);
  }
  async finishPending(){
    const pending=read(this.storage,PENDING);
    const hash=typeof location!=='undefined'?new URLSearchParams(location.hash.slice(1)):null;
    const returned=hash?.get('cloud_auth');
    if(returned)history.replaceState(null,'',location.pathname+location.search);
    if(!pending||pending.serviceUrl!==this.url){
      if(returned){this.lastError='RETURN_TO_ORIGINAL_PWA';this._emit();}
      return false;
    }
    if(pending.expiresAt<Date.now()){
      this.storage.removeItem(PENDING);this.lastError='AUTH_ATTEMPT_EXPIRED';return false;
    }
    try{
      const result=await request(this.url+'/auth/complete',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:pending.id,verifier:pending.verifier})},{timeout:12000,retries:0});
      if(result.data.pending)return false;
      if(!/^[A-Za-z0-9_-]{43}$/.test(result.data.token||''))throw new Error('INVALID_AUTH_SERVICE');
      this.storage.setItem(SESSION,JSON.stringify({...result.data,serviceUrl:this.url}));
      this.storage.removeItem(PENDING);await this.storage.flush();
      this.email=result.data.email||'';this.storage.setItem('gdriveEmail',this.email);
      this.state='connected';this.validatedAt=Date.now();this.lastError='';this._emit();return true;
    }catch(error){
      this.lastError=error.message;
      if(error.status===400||error.status===403)this.storage.removeItem(PENDING);
      this._emit();return false;
    }
  }
  async requestDrive(url,options={},policy={}){
    await this.ensureSession();const session=this.session();if(!session)throw new Error('CLOUD_RECONNECT_REQUIRED');
    const target=new URL(url);
    if(target.origin!=='https://www.googleapis.com')throw new Error('INVALID_DRIVE_PATH');
    const h=new Headers(options.headers||{});h.set('Authorization','Bearer '+session.token);
    try{return await request(this.url+'/api/drive?path='+encodeURIComponent(target.pathname+target.search),
      {...options,headers:h},policy);}
    catch(error){
      if(error.status===401){this.storage.removeItem(SESSION);this.state='needs-link';this.lastError='CLOUD_RECONNECT_REQUIRED';this._emit();}
      throw error;
    }
  }
  async signOut(){
    const session=this.session(),url=this.url;
    // Clear local credentials immediately; only the original service sees its token.
    this.storage.removeItem(SESSION);this.storage.removeItem(PENDING);
    this.state=this.configured?'needs-link':'local';this.email='';this.validatedAt=0;this._emit();
    if(session&&url)await request(url+'/api/session',{method:'DELETE',headers:{Authorization:'Bearer '+session.token}},
      {timeout:8000,retries:0}).catch(()=>{});
  }
}
