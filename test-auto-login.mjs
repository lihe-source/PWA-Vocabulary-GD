import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CloudAuthClient,normalizeWorkerUrl} from './cloud-auth-client.js';
const app=await readFile(new URL('./app.js',import.meta.url),'utf8');
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key),flush:async()=>{}};};

test('startup and ordinary taps never arm OAuth or load the GIS popup SDK',async()=>{
  const home=app.indexOf("Router._doNavigate('home')"),bootstrap=app.indexOf('const bootstrapGDriveInBackground');
  assert.ok(home>=0&&bootstrap>home);assert.ok(!app.includes('armSeamlessGoogleReconnect'));
  const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
  assert.ok(!html.includes('gsi/client'));assert.ok(!html.includes('jszip.min.js'));
  const start=app.indexOf('async tryRestoreToken('),end=app.indexOf('async signOut(',start);
  assert.ok(!app.slice(start,end).includes('_requestToken'));
});

test('remembered backend credential restores silently without a Google authorization request',async()=>{
  const storage=memory(),url='https://auth.example.test';
  storage.setItem('googleAuthWorkerUrl',url);
  storage.setItem('googleCloudSession',JSON.stringify({serviceUrl:url,token:'t'.repeat(43),email:'user@example.test'}));
  const saved=globalThis.fetch,calls=[];
  globalThis.fetch=async(target,options)=>{calls.push(String(target));assert.equal(new Headers(options.headers).get('Authorization'),'Bearer '+'t'.repeat(43));
    return Response.json({email:'user@example.test',clientId:'same-client'});};
  try{const client=new CloudAuthClient(storage);await client.init();assert.equal(client.connected,true);
    assert.deepEqual(calls,[url+'/api/session']);}
  finally{globalThis.fetch=saved;}
});

test('expired backend permission becomes an inline reconnect state without opening Google',async()=>{
  const storage=memory(),url='https://auth.example.test';storage.setItem('googleAuthWorkerUrl',url);
  storage.setItem('googleCloudSession',JSON.stringify({serviceUrl:url,token:'t'.repeat(43)}));
  const saved=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({error:'CLOUD_RECONNECT_REQUIRED'},{status:401});};
  try{const client=new CloudAuthClient(storage);await client.init();assert.equal(client.state,'needs-link');
    assert.equal(client.session(),null);assert.equal(calls,1);}
  finally{globalThis.fetch=saved;}
});

test('backend credentials remain bound to their original service URL',()=>{
  const storage=memory();storage.setItem('googleCloudSession',JSON.stringify({serviceUrl:'https://old.example.test',token:'t'.repeat(43)}));
  const client=new CloudAuthClient(storage);client.url='https://new.example.test';assert.equal(client.session(),null);
  for(const url of ['http://example.test','https://example.test/path','https://user:pass@example.test','https://example.test?key=x'])assert.throws(()=>normalizeWorkerUrl(url));
  assert.equal(normalizeWorkerUrl(' https://auth.example.test/ '),'https://auth.example.test');
});
