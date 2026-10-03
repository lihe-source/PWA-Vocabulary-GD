import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{encrypt,decrypt,digest} from './cloud-auth-worker.js';

function d1(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(readFileSync(new URL('./cloud-auth-schema.sql',import.meta.url),'utf8'));
 const prepare=sql=>{let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},
  async all(){return {results:db.prepare(sql).all(...args)};},async run(){const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};};
 return {prepare,db,async batch(queries){db.exec('BEGIN');try{const results=[];for(const query of queries)results.push(await query.run());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
}
const origin='https://lihe-source.github.io',service='https://auth.example.test';
function req(path,{method='GET',body,bearer,requestOrigin=origin}={}){
 const headers={};if(requestOrigin)headers.Origin=requestOrigin;if(body!==undefined)headers['Content-Type']='application/json';if(bearer)headers.Authorization='Bearer '+bearer;
 return new Request(service+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}

test('OAuth backend uses encrypted refresh tokens, proof-bound redemption and restricted Drive access',async t=>{
 const database=d1(),env={AUTH_DB:database,GOOGLE_CLIENT_ID:'123-test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'server-only-secret',
  TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),ALLOWED_ORIGINS:origin,APP_URL:origin+'/PWA-Vocabulary-GD/',SESSION_IDLE_DAYS:'30'};
 const savedFetch=globalThis.fetch;let refreshes=0,driveWrites=0,invalidGrant=false;
 globalThis.fetch=async(url,options={})=>{
  const target=new URL(url);
  if(target.hostname==='oauth2.googleapis.com'){
   const params=new URLSearchParams(options.body);assert.equal(params.get('client_secret'),env.GOOGLE_CLIENT_SECRET);
   if(params.get('grant_type')==='refresh_token'){
    refreshes++;assert.equal(params.get('refresh_token'),'secret-refresh');
    if(invalidGrant)return Response.json({error:'invalid_grant'},{status:400});
    await new Promise(resolve=>setTimeout(resolve,10));return Response.json({access_token:'fresh-access',expires_in:3600});
   }
   assert.ok(params.get('code_verifier'));return Response.json({access_token:'initial-access',refresh_token:'secret-refresh',expires_in:3600});
  }
  if(target.hostname==='openidconnect.googleapis.com')return Response.json({sub:'google-sub',email:'user@example.test',email_verified:true});
  if(target.pathname==='/drive/v3/files')return Response.json({files:[{id:'backup-1',name:'vocab_backup_2026.json',version:'2',md5Checksum:'checksum'}]});
  if(target.pathname==='/drive/v3/files/private-1')return Response.json({id:'private-1',name:'private-document.json',mimeType:'application/json'});
  if(target.pathname==='/drive/v3/files/backup-1'){
   if(target.searchParams.get('alt')==='media')return Response.json({schemaVersion:8,words:[]});
   return Response.json({id:'backup-1',name:'vocab_backup_2026.json',mimeType:'application/json',size:'100'});
  }
  if(target.pathname==='/upload/drive/v3/files'){
   const uploaded=await new Response(options.body).text();assert.ok(uploaded.includes('vocab_backup_test.json'));assert.ok(uploaded.endsWith('--test_boundary--'));
   driveWrites++;return Response.json({error:{message:'Busy'}},{status:503});}
  throw new Error('Unexpected outbound URL '+url);
 };
 try{
  await t.test('public configuration never includes a client secret or encryption key',async()=>{
   const result=await worker.fetch(req('/api/config'),env),text=await result.text();assert.equal(result.status,200);assert.ok(!text.includes('server-only-secret'));
   assert.ok(!text.includes(env.TOKEN_ENCRYPTION_KEY));assert.match(result.headers.get('Cache-Control'),/no-store/);
  });
  await t.test('untrusted origins cannot initiate authorization',async()=>{
   const result=await worker.fetch(req('/auth/start',{method:'POST',requestOrigin:'https://other.example',body:{challenge:'x'.repeat(43)}}),env);
   assert.equal(result.status,403);assert.equal(database.db.prepare('SELECT count(*) AS n FROM oauth_attempts').get().n,0);
  });
  const proof='p'.repeat(43),challenge=await digest(proof);
  const start=await (await worker.fetch(req('/auth/start',{method:'POST',body:{challenge,email:'user@example.test'}}),env)).json();
  const authorization=new URL(start.authorizationUrl),attempt=database.db.prepare('SELECT * FROM oauth_attempts WHERE id=?').get(start.id);
  await t.test('authorization uses server PKCE and stores no plaintext verifier',async()=>{
   assert.equal(authorization.origin,'https://accounts.google.com');assert.equal(authorization.searchParams.get('access_type'),'offline');
   assert.equal(authorization.searchParams.get('redirect_uri'),service+'/oauth/callback');
   const verifier=await decrypt(env,attempt.verifier_cipher,start.id);assert.ok(!attempt.verifier_cipher.includes(verifier));
   assert.equal(await digest(verifier),authorization.searchParams.get('code_challenge'));assert.equal(authorization.searchParams.get('login_hint'),'user@example.test');
  });
  const callback=await worker.fetch(req('/oauth/callback?state='+start.id+'&code=one-time-code',{requestOrigin:null}),env);
  assert.equal(callback.status,303);assert.equal(callback.headers.get('Location'),env.APP_URL+'#cloud_auth='+start.id);
  await t.test('a wrong browser proof cannot steal or consume the completed login',async()=>{
   const bad=await worker.fetch(req('/auth/complete',{method:'POST',body:{id:start.id,verifier:'z'.repeat(43)}}),env);assert.equal(bad.status,403);
   assert.ok(database.db.prepare('SELECT id FROM oauth_attempts WHERE id=?').get(start.id));
  });
  const session=await (await worker.fetch(req('/auth/complete',{method:'POST',body:{id:start.id,verifier:proof}}),env)).json();
  const account=database.db.prepare('SELECT * FROM oauth_accounts').get();
  await t.test('redemption is single-use and Google tokens remain encrypted on the server',async()=>{
   assert.match(session.token,/^[\w-]{43}$/);assert.equal(session.email,'user@example.test');assert.ok(!JSON.stringify(session).includes('access'));
   assert.ok(!account.tokens_cipher.includes('secret-refresh'));assert.ok(!account.tokens_cipher.includes('initial-access'));
   const stored=database.db.prepare('SELECT * FROM device_sessions').get();assert.equal(stored.token_hash,await digest(session.token));assert.notEqual(stored.token_hash,session.token);
   const replay=await worker.fetch(req('/auth/complete',{method:'POST',body:{id:start.id,verifier:proof}}),env);assert.equal(replay.status,400);
   await assert.rejects(decrypt(env,account.tokens_cipher,'wrong-account'),/AUTH_STORAGE_UNAVAILABLE/);
  });
  const expire=async()=>database.db.prepare('UPDATE oauth_accounts SET tokens_cipher=? WHERE id=?').run(await encrypt(env,{refresh:'secret-refresh',access:'expired',expiresAt:1},account.id),account.id);
  await expire();
  await t.test('concurrent session restores share a silent refresh without exposing Google tokens',async()=>{
   const results=await Promise.all([worker.fetch(req('/api/session',{bearer:session.token}),env),worker.fetch(req('/api/session',{bearer:session.token}),env)]);
   assert.equal(refreshes,1);for(const result of results){assert.equal(result.status,200);const body=await result.json();assert.equal(body.connected,true);assert.ok(!JSON.stringify(body).includes('fresh-access'));}
  });
  await t.test('Drive proxy lists and downloads app backups, and rejects unrelated files and paths',async()=>{
   const list='/drive/v3/files?q='+encodeURIComponent("name contains 'vocab_backup_' and trashed=false");
   let result=await worker.fetch(req('/api/drive?path='+encodeURIComponent(list),{bearer:session.token}),env);assert.equal(result.status,200);assert.equal((await result.json()).files[0].id,'backup-1');
   result=await worker.fetch(req('/api/drive?path='+encodeURIComponent('/drive/v3/files/backup-1?alt=media'),{bearer:session.token}),env);assert.equal(result.status,200);assert.equal((await result.json()).schemaVersion,8);
   for(const path of ['/drive/v3/files/private-1?alt=media','/calendar/v3/calendars','//evil.example/drive/v3/files']){
    result=await worker.fetch(req('/api/drive?path='+encodeURIComponent(path),{bearer:session.token}),env);assert.ok([400,403].includes(result.status));
   }
  });
  await t.test('a failed Drive upload is attempted only once',async()=>{
   const boundary='test_boundary',text='--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify({name:'vocab_backup_test.json',mimeType:'application/json'})+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n{}\r\n--'+boundary+'--';
   const upload=new Request(service+'/api/drive?path='+encodeURIComponent('/upload/drive/v3/files?uploadType=multipart'),{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+session.token,'Content-Type':'multipart/related; boundary='+boundary},body:text});
   const result=await worker.fetch(upload,env);assert.equal(result.status,503);await result.text();assert.equal(driveWrites,1);
  });
  await t.test('non-app upload metadata is rejected before contacting Drive',async()=>{
   const text='--b\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify({name:'other.json',mimeType:'application/json'})+'\r\n--b\r\nContent-Type: application/json\r\n\r\n{}\r\n--b--';
   const upload=new Request(service+'/api/drive?path='+encodeURIComponent('/upload/drive/v3/files?uploadType=multipart'),{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+session.token,'Content-Type':'multipart/related; boundary=b'},body:text});
   const result=await worker.fetch(upload,env);assert.equal(result.status,403);assert.equal(driveWrites,1);
  });
  await t.test('cancelled consent returns to the fixed app URL and cannot redeem a credential',async()=>{
   const begin=await (await worker.fetch(req('/auth/start',{method:'POST',body:{challenge}}),env)).json();
   const cancelled=await worker.fetch(req('/oauth/callback?state='+begin.id+'&error=access_denied',{requestOrigin:null}),env);
   assert.equal(cancelled.status,303);assert.equal(cancelled.headers.get('Location'),env.APP_URL+'#cloud_auth='+begin.id);
   const completion=await worker.fetch(req('/auth/complete',{method:'POST',body:{id:begin.id,verifier:proof}}),env);
   assert.equal(completion.status,400);assert.equal((await completion.json()).error,'GOOGLE_AUTH_FAILED');
  });
  await t.test('sign-out revokes only the current device session',async()=>{
   const other='o'.repeat(43),now=Date.now();database.db.prepare('INSERT INTO device_sessions VALUES(?,?,?,?,?)').run(await digest(other),account.id,now,now,now+86400000);
   const signedOut=await worker.fetch(req('/api/session',{method:'DELETE',bearer:other}),env);assert.equal(signedOut.status,200);
   const current=await worker.fetch(req('/api/session',{bearer:session.token}),env);assert.equal(current.status,200);
  });
  await t.test('revoked Google authorization invalidates sessions and never starts new authorization',async()=>{
   invalidGrant=true;await expire();const result=await worker.fetch(req('/api/session',{bearer:session.token}),env);
   assert.equal(result.status,401);assert.equal((await result.json()).error,'CLOUD_RECONNECT_REQUIRED');
   assert.equal(database.db.prepare('SELECT count(*) AS n FROM device_sessions').get().n,0);
  });
 }finally{globalThis.fetch=savedFetch;database.db.close();}
});
