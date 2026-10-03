// Google code flow and a restricted Drive gateway. Google tokens never reach the PWA.
const VERSION='V7.5.0';
const SCOPE='openid email https://www.googleapis.com/auth/drive.file';
const encoder=new TextEncoder();
const refreshJobs=new Map();
const MAX_UPLOAD=40*1024*1024;

export function base64url(bytes){
  let text='';for(const byte of new Uint8Array(bytes))text+=String.fromCharCode(byte);
  return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode64(value){
  const text=atob(String(value).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from(text,x=>x.charCodeAt(0));
}
function randomToken(){return base64url(crypto.getRandomValues(new Uint8Array(32)));}
export async function digest(value){return base64url(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
function failure(code,status=400){const error=new Error(code);error.status=status;return error;}
function origins(env){return String(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);}
function appUrl(env){
  const url=new URL(env.APP_URL);
  if(url.protocol!=='https:'||!origins(env).includes(url.origin))throw failure('AUTH_CONFIGURATION_INVALID',503);
  return url;
}
function configured(env){
  return !!env.AUTH_DB && !!env.GOOGLE_CLIENT_SECRET && !!env.TOKEN_ENCRYPTION_KEY &&
    /^[\w.-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||'');
}
function headers(request,env){
  const h=new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  const origin=request.headers.get('Origin');
  if(origins(env).includes(origin)){
    h.set('Access-Control-Allow-Origin',origin);h.set('Vary','Origin');
    h.set('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
    h.set('Access-Control-Allow-Headers','Authorization,Content-Type');
  }
  return h;
}
function json(request,env,data,status=200){
  const h=headers(request,env);h.set('Content-Type','application/json; charset=UTF-8');
  return new Response(JSON.stringify(data),{status,headers:h});
}
function checkOrigin(request,env){
  if(!origins(env).includes(request.headers.get('Origin')))throw failure('ORIGIN_NOT_ALLOWED',403);
}
async function readLimited(request,max=16384){
  const declared=Number(request.headers.get('Content-Length'));
  if(declared>max)throw failure('PAYLOAD_TOO_LARGE',413);
  if(!request.body)return '';
  const reader=request.body.getReader();const chunks=[];let size=0;
  try{
    while(true){
      const result=await reader.read();if(result.done)break;
      size+=result.value.length;if(size>max){await reader.cancel();throw failure('PAYLOAD_TOO_LARGE',413);}
      chunks.push(result.value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder().decode(bytes);
}
async function input(request,max){
  try{return JSON.parse(await readLimited(request,max));}
  catch(error){if(error.status)throw error;throw failure('INVALID_JSON');}
}
async function encryptionKey(env){
  let key;try{key=decode64(env.TOKEN_ENCRYPTION_KEY);}catch{throw failure('AUTH_CONFIGURATION_INVALID',503);}
  if(key.length!==32)throw failure('AUTH_CONFIGURATION_INVALID',503);
  return crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt','decrypt']);
}
export async function encrypt(env,value,aad){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(aad)},
    await encryptionKey(env),encoder.encode(JSON.stringify(value)));
  return base64url(iv)+'.'+base64url(bytes);
}
export async function decrypt(env,value,aad){
  const [iv,cipher]=String(value).split('.');
  try{
    const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(iv),additionalData:encoder.encode(aad)},
      await encryptionKey(env),decode64(cipher));
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch{throw failure('AUTH_STORAGE_UNAVAILABLE',503);}
}
async function google(url,options={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal,redirect:'error'});
    const data=await response.json();
    if(!response.ok){
      if(data.error==='invalid_grant')throw failure('CLOUD_RECONNECT_REQUIRED',401);
      if(response.status===429||response.status>=500)throw failure('GOOGLE_TEMPORARILY_UNAVAILABLE',503);
      throw failure('GOOGLE_AUTH_FAILED',400);
    }
    return data;
  }catch(error){
    if(error.status)throw error;
    throw failure(error.name==='AbortError'?'GOOGLE_TIMEOUT':'GOOGLE_TEMPORARILY_UNAVAILABLE',503);
  }finally{clearTimeout(timer);}
}
function tokenRequest(env,body){
  return google('https://oauth2.googleapis.com/token',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,...body})});
}
async function accountSession(request,env){
  const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization')||'');
  if(!match)throw failure('CLOUD_RECONNECT_REQUIRED',401);
  const tokenHash=await digest(match[1]);const now=Date.now();
  const row=await env.AUTH_DB.prepare(
    'SELECT s.*, a.email, a.tokens_cipher FROM device_sessions s JOIN oauth_accounts a ON a.id=s.account_id WHERE s.token_hash=?'
  ).bind(tokenHash).first();
  if(!row||row.expires_at<=now)throw failure('CLOUD_RECONNECT_REQUIRED',401);
  if(now-row.last_seen>60*60*1000){
    const days=Math.min(90,Math.max(7,Number(env.SESSION_IDLE_DAYS)||30));
    await env.AUTH_DB.prepare('UPDATE device_sessions SET last_seen=?, expires_at=? WHERE token_hash=?')
      .bind(now,now+days*86400000,tokenHash).run();
  }
  return row;
}
async function accessToken(env,session,force=false){
  if(refreshJobs.has(session.account_id))return refreshJobs.get(session.account_id);
  const job=(async()=>{
    // Read the newest encrypted record; another isolate may already have refreshed it.
    const row=await env.AUTH_DB.prepare('SELECT tokens_cipher FROM oauth_accounts WHERE id=?').bind(session.account_id).first();
    if(!row)throw failure('CLOUD_RECONNECT_REQUIRED',401);
    const tokens=await decrypt(env,row.tokens_cipher,session.account_id);
    if(!force&&tokens.access&&tokens.expiresAt>Date.now()+120000)return tokens.access;
    let refreshed;
    try{refreshed=await tokenRequest(env,{grant_type:'refresh_token',refresh_token:tokens.refresh});}
    catch(error){
      if(error.message==='CLOUD_RECONNECT_REQUIRED'){
        await env.AUTH_DB.prepare('DELETE FROM device_sessions WHERE account_id=?').bind(session.account_id).run();
      }
      throw error;
    }
    tokens.access=refreshed.access_token;tokens.expiresAt=Date.now()+Number(refreshed.expires_in||3600)*1000;
    if(refreshed.refresh_token)tokens.refresh=refreshed.refresh_token;
    await env.AUTH_DB.prepare('UPDATE oauth_accounts SET tokens_cipher=?, updated_at=? WHERE id=?')
      .bind(await encrypt(env,tokens,session.account_id),Date.now(),session.account_id).run();
    return tokens.access;
  })();
  refreshJobs.set(session.account_id,job);
  try{return await job;}finally{if(refreshJobs.get(session.account_id)===job)refreshJobs.delete(session.account_id);}
}
function appFile(name){return name==='vocab_study_streak.json'||/^vocab_backup_[A-Za-z0-9_.-]+\.json$/.test(name||'');}
async function multipartBody(request,boundary){
  if(Number(request.headers.get('Content-Length'))>MAX_UPLOAD)throw failure('PAYLOAD_TOO_LARGE',413);
  if(!request.body)throw failure('INVALID_UPLOAD');
  const reader=request.body.getReader(),chunks=[];let size=0,prefix='',metadata;
  try{
    // Inspect only the metadata prefix; forward file bytes without decoding or
    // copying the whole backup into the Worker's limited memory.
    while(true){
      const next=await reader.read();if(next.done)throw failure('INVALID_UPLOAD');
      chunks.push(next.value);size+=next.value.length;if(size>MAX_UPLOAD)throw failure('PAYLOAD_TOO_LARGE',413);
      const sample=new Uint8Array(Math.min(size,16384));let offset=0;
      for(const chunk of chunks){const part=chunk.subarray(0,sample.length-offset);sample.set(part,offset);offset+=part.length;if(offset===sample.length)break;}
      prefix=new TextDecoder().decode(sample);
      const first=prefix.indexOf('\r\n\r\n'),last=prefix.indexOf('\r\n--'+boundary,first+4);
      if(first>=0&&last>=0){
        try{metadata=JSON.parse(prefix.slice(first+4,last));}catch{throw failure('INVALID_UPLOAD');}
        break;
      }
      if(size>=16384)throw failure('INVALID_UPLOAD');
    }
    if(!appFile(metadata.name)||metadata.mimeType!=='application/json')throw failure('FILE_NOT_ALLOWED',403);
    if(metadata.parents&&(!Array.isArray(metadata.parents)||metadata.parents.length!==1||
      !/^[A-Za-z0-9_-]{1,200}$/.test(metadata.parents[0])))throw failure('INVALID_FOLDER');
  }catch(error){await reader.cancel();throw error;}
  return new ReadableStream({
    start(controller){for(const chunk of chunks)controller.enqueue(chunk);chunks.length=0;},
    async pull(controller){
      try{const next=await reader.read();if(next.done){controller.close();reader.releaseLock();return;}
        size+=next.value.length;if(size>MAX_UPLOAD){await reader.cancel();throw failure('PAYLOAD_TOO_LARGE',413);}
        controller.enqueue(next.value);
      }catch(error){controller.error(error);}
    },
    async cancel(reason){await reader.cancel(reason);}
  });
}
async function fileInfo(token,id){
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw failure('INVALID_FILE_ID');
  const info=await google('https://www.googleapis.com/drive/v3/files/'+id+'?fields=id,name,mimeType,size',
    {headers:{Authorization:'Bearer '+token}});
  if(!appFile(info.name)||info.mimeType!=='application/json')throw failure('FILE_NOT_ALLOWED',403);
  if(Number(info.size)>MAX_UPLOAD)throw failure('PAYLOAD_TOO_LARGE',413);
  return info;
}
async function drive(request,env,session){
  const outer=new URL(request.url);const raw=outer.searchParams.get('path');
  if(!raw||!raw.startsWith('/')||raw.includes('://'))throw failure('INVALID_DRIVE_PATH');
  const target=new URL(raw,'https://www.googleapis.com');
  if(target.origin!=='https://www.googleapis.com'||target.hash)throw failure('INVALID_DRIVE_PATH');
  const method=request.method;let body;
  const token=await accessToken(env,session);
  if(target.pathname==='/drive/v3/files'&&method==='GET'){
    const original=target.searchParams.get('q')||'';
    const streak=original.includes("name='vocab_study_streak.json'");
    const backup=original.includes("name contains 'vocab_backup_'");
    if(!streak&&!backup)throw failure('INVALID_DRIVE_QUERY');
    let q=streak?"name='vocab_study_streak.json'":"name contains 'vocab_backup_'";
    q+=" and mimeType='application/json' and trashed=false";
    const folder=original.match(/'([A-Za-z0-9_-]{1,200})'\s+in\s+parents/);
    if(/\bin\s+parents\b/.test(original)&&!folder)throw failure('INVALID_FOLDER');
    if(folder)q+=" and '"+folder[1]+"' in parents";
    const page=target.searchParams.get('pageToken');const size=target.searchParams.get('pageSize');
    target.search='';
    target.searchParams.set('q',q);target.searchParams.set('pageSize',String(Math.min(100,Math.max(1,Number(size)||20))));
    if(page)target.searchParams.set('pageToken',page);
    target.searchParams.set('fields','nextPageToken,files(id,name,createdTime,modifiedTime,description,version,md5Checksum,size)');
    target.searchParams.set('orderBy','modifiedTime desc');
  }else if(/^\/drive\/v3\/files\/[A-Za-z0-9_-]+$/.test(target.pathname)&&method==='GET'){
    await fileInfo(token,target.pathname.split('/').pop());
    if(target.searchParams.get('alt')!=='media')throw failure('INVALID_DRIVE_QUERY');
    target.search='?alt=media';
  }else if(target.pathname==='/upload/drive/v3/files'&&method==='POST'){
    if(target.searchParams.get('uploadType')!=='multipart')throw failure('INVALID_UPLOAD');
    const type=request.headers.get('Content-Type')||'';
    const boundary=type.match(/boundary=([A-Za-z0-9_-]{1,100})/);
    if(!boundary||!type.startsWith('multipart/related'))throw failure('INVALID_UPLOAD');
    body=await multipartBody(request,boundary[1]);
    target.search='?uploadType=multipart';
  }else if(/^\/upload\/drive\/v3\/files\/[A-Za-z0-9_-]+$/.test(target.pathname)&&method==='PATCH'){
    const info=await fileInfo(token,target.pathname.split('/').pop());
    if(info.name!=='vocab_study_streak.json')throw failure('FILE_NOT_ALLOWED',403);
    body=await readLimited(request,MAX_UPLOAD);let payload;
    try{payload=JSON.parse(body);}catch{throw failure('INVALID_JSON');}
    if(payload.dataType!=='vocabulary-study-streak'||!Array.isArray(payload.studyDays))throw failure('INVALID_STREAK');
    target.search='?uploadType=media';
  }else{throw failure('INVALID_DRIVE_PATH');}
  const outgoing={method,headers:{Authorization:'Bearer '+token},redirect:'error'};
  if(body!==undefined){outgoing.body=body;outgoing.headers['Content-Type']=request.headers.get('Content-Type')||'application/json';}
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
  const onAbort=()=>controller.abort();request.signal.addEventListener('abort',onAbort,{once:true});
  try{
    let result=await fetch(target,outgoingWithSignal(outgoing,controller.signal));
    if(result.status===401&&method==='GET'){
      outgoing.headers.Authorization='Bearer '+await accessToken(env,session,true);
      result=await fetch(target,outgoingWithSignal(outgoing,controller.signal));
    }
    const h=headers(request,env);h.set('Content-Type',result.headers.get('Content-Type')||'application/json');
    if(result.headers.has('Retry-After'))h.set('Retry-After',result.headers.get('Retry-After'));
    h.set('Access-Control-Expose-Headers','Retry-After');
    // Keep the deadline alive until the response body finishes, without buffering downloads.
    const reader=result.body?.getReader();
    const finish=()=>{clearTimeout(timer);request.signal.removeEventListener('abort',onAbort);};
    const stream=reader?new ReadableStream({
      async pull(controller){try{const next=await reader.read();if(next.done){finish();controller.close();}else controller.enqueue(next.value);}
        catch(error){finish();controller.error(error);}},
      async cancel(reason){finish();await reader.cancel(reason);}
    }):null;
    if(!reader)finish();
    return new Response(stream,{status:result.status,headers:h});
  }catch(error){
    clearTimeout(timer);request.signal.removeEventListener('abort',onAbort);
    if(error.status)throw error;
    throw failure(error.name==='AbortError'?'GOOGLE_TIMEOUT':'GOOGLE_TEMPORARILY_UNAVAILABLE',503);
  }
}
function outgoingWithSignal(options,signal){return {...options,signal,...(options.body instanceof ReadableStream?{duplex:'half'}:{})};}
async function start(request,env){
  const data=await input(request);const challenge=String(data.challenge||'');
  if(!/^[A-Za-z0-9_-]{43}$/.test(challenge))throw failure('INVALID_CHALLENGE');
  const id=randomToken(),verifier=randomToken(),now=Date.now();
  await env.AUTH_DB.prepare('INSERT INTO oauth_attempts (id,challenge,verifier_cipher,status,created_at,expires_at) VALUES (?,?,?,?,?,?)')
    .bind(id,challenge,await encrypt(env,verifier,id),'pending',now,now+10*60000).run();
  const callback=new URL('/oauth/callback',request.url).href;
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  for(const [key,value] of Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback,
    response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent',state:id,
    code_challenge:await digest(verifier),code_challenge_method:'S256'}))url.searchParams.set(key,value);
  const hint=String(data.email||'').trim();
  if(hint.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint))url.searchParams.set('login_hint',hint);
  return json(request,env,{id,authorizationUrl:url.href,expiresAt:now+10*60000});
}
async function callback(request,env){
  const url=new URL(request.url),id=url.searchParams.get('state');
  const row=await env.AUTH_DB.prepare('SELECT * FROM oauth_attempts WHERE id=?').bind(id||'').first();
  if(!row||row.status!=='pending'||row.expires_at<Date.now())throw failure('AUTH_ATTEMPT_EXPIRED');
  if(url.searchParams.has('error')){
    await env.AUTH_DB.prepare("UPDATE oauth_attempts SET status='denied' WHERE id=?").bind(id).run();
    const target=appUrl(env);target.hash='cloud_auth='+id;
    return new Response(null,{status:303,headers:{Location:target.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  const code=url.searchParams.get('code');if(!code)throw failure('AUTH_CODE_MISSING');
  const claim=await env.AUTH_DB.prepare("UPDATE oauth_attempts SET status='exchanging' WHERE id=? AND status='pending'").bind(id).run();
  if(!claim.meta?.changes)throw failure('AUTH_ATTEMPT_EXPIRED');
  try{
    const tokens=await tokenRequest(env,{grant_type:'authorization_code',code,
      redirect_uri:new URL('/oauth/callback',request.url).href,
      code_verifier:await decrypt(env,row.verifier_cipher,id)});
    const profile=await google('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}});
    if(!profile.sub||!profile.email||profile.email_verified===false)throw failure('GOOGLE_PROFILE_INVALID');
    const accountId=await digest(env.GOOGLE_CLIENT_ID+'|'+profile.sub);
    let refresh=tokens.refresh_token;
    if(!refresh){
      const old=await env.AUTH_DB.prepare('SELECT tokens_cipher FROM oauth_accounts WHERE id=?').bind(accountId).first();
      if(old)refresh=(await decrypt(env,old.tokens_cipher,accountId)).refresh;
    }
    if(!refresh)throw failure('OFFLINE_ACCESS_REQUIRED');
    const now=Date.now(),token=randomToken();
    const cipher=await encrypt(env,{refresh,access:tokens.access_token,expiresAt:now+Number(tokens.expires_in||3600)*1000},accountId);
    const days=Math.min(90,Math.max(7,Number(env.SESSION_IDLE_DAYS)||30));
    const sessionData={token,email:profile.email,expiresAt:now+days*86400000,clientId:env.GOOGLE_CLIENT_ID};
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare('INSERT INTO oauth_accounts(id,google_sub,email,tokens_cipher,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,tokens_cipher=excluded.tokens_cipher,updated_at=excluded.updated_at')
        .bind(accountId,profile.sub,profile.email,cipher,now),
      env.AUTH_DB.prepare('INSERT INTO device_sessions(token_hash,account_id,created_at,last_seen,expires_at) VALUES(?,?,?,?,?)')
        .bind(await digest(token),accountId,now,now,sessionData.expiresAt),
      env.AUTH_DB.prepare("UPDATE oauth_attempts SET status='complete',session_cipher=? WHERE id=?")
        .bind(await encrypt(env,sessionData,id),id)
    ]);
    const target=appUrl(env);target.hash='cloud_auth='+id;
    return new Response(null,{status:303,headers:{Location:target.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }catch(error){
    await env.AUTH_DB.prepare("UPDATE oauth_attempts SET status='failed' WHERE id=?").bind(id).run();
    const target=appUrl(env);target.hash='cloud_auth='+id;
    return new Response(null,{status:303,headers:{Location:target.href,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
}
async function complete(request,env){
  const data=await input(request);const row=await env.AUTH_DB.prepare('SELECT * FROM oauth_attempts WHERE id=?').bind(data.id||'').first();
  if(!row||row.expires_at<Date.now())throw failure('AUTH_ATTEMPT_EXPIRED');
  if(!/^[A-Za-z0-9_-]{43}$/.test(data.verifier||'')||await digest(data.verifier)!==row.challenge)throw failure('AUTH_PROOF_INVALID',403);
  if(row.status==='denied'||row.status==='failed')throw failure('GOOGLE_AUTH_FAILED');
  if(row.status!=='complete')return json(request,env,{pending:true},202);
  const result=await decrypt(env,row.session_cipher,row.id);
  const consumed=await env.AUTH_DB.prepare("DELETE FROM oauth_attempts WHERE id=? AND status='complete'").bind(row.id).run();
  if(!consumed.meta?.changes)throw failure('AUTH_ATTEMPT_EXPIRED');
  return json(request,env,result);
}
async function handle(request,env){
  const url=new URL(request.url);
  if(request.method==='OPTIONS'){
    checkOrigin(request,env);return new Response(null,{status:204,headers:headers(request,env)});
  }
  if(url.pathname==='/api/config'&&request.method==='GET'){
    checkOrigin(request,env);
    return json(request,env,{service:'Vocabulary Google Auth',version:VERSION,configured:configured(env),
      clientId:env.GOOGLE_CLIENT_ID||'',callbackUrl:new URL('/oauth/callback',request.url).href,appUrl:appUrl(env).href});
  }
  if(!configured(env))throw failure('AUTH_NOT_CONFIGURED',503);
  appUrl(env);
  if(url.pathname==='/oauth/callback'&&request.method==='GET')return callback(request,env);
  checkOrigin(request,env);
  if(url.pathname==='/auth/start'&&request.method==='POST')return start(request,env);
  if(url.pathname==='/auth/complete'&&request.method==='POST')return complete(request,env);
  const session=await accountSession(request,env);
  if(url.pathname==='/api/session'&&request.method==='GET'){
    await accessToken(env,session);
    return json(request,env,{email:session.email,clientId:env.GOOGLE_CLIENT_ID,connected:true});
  }
  if(url.pathname==='/api/session'&&request.method==='DELETE'){
    await env.AUTH_DB.prepare('DELETE FROM device_sessions WHERE token_hash=?').bind(session.token_hash).run();
    return json(request,env,{signedOut:true});
  }
  if(url.pathname==='/api/drive')return drive(request,env,session);
  throw failure('NOT_FOUND',404);
}
export default {
  async fetch(request,env){
    try{return await handle(request,env);}
    catch(error){return json(request,env,{error:error.status?error.message:'AUTH_SERVICE_ERROR'},error.status||500);}
  },
  async scheduled(_controller,env){
    if(!env.AUTH_DB)return;
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare('DELETE FROM oauth_attempts WHERE expires_at<?').bind(Date.now()),
      env.AUTH_DB.prepare('DELETE FROM device_sessions WHERE expires_at<?').bind(Date.now())
    ]);
  }
};
