import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCollections,COLLECTION_STORAGE} from './data-merge.js';
import {processBackupJob} from './backup-worker.js';
import {createDataStore} from './data-store.js';
import {RequestCoordinator,fetchJSON} from './request-coordinator.js';
import {TaskManager} from './task-manager.js';
import {createDriveService} from './drive-service.js';
import {BackupSchema} from './backup-schema.js';

const empty=()=>Object.fromEntries(Object.keys(COLLECTION_STORAGE).map(key=>[key,[]]));
const raw=value=>Object.fromEntries(Object.entries({...empty(),...value}).map(([key,item])=>[key,JSON.stringify(item)]));

test('same-date different words and different sentences survive cloud merge',()=>{
  const a={wordEn:'apple',date:'2026/10/09',en:'An apple.',zh:'一顆蘋果。'},b={wordEn:'book',date:a.date,en:'A book.',zh:'一本書。'},c={...a,en:'Another apple.'};
  const result=mergeCollections({...empty(),sentences:[a],imported:[a]},{...empty(),sentences:[b,c],imported:[b,c]});
  assert.equal(result.collections.sentences.length,3);assert.equal(result.collections.imported.length,3);assert.equal(result.totals.added,4);
});
test('repeated merge is idempotent and distinguishes conflicts from duplicates',()=>{
  const local={...empty(),words:[{id:'1',english:'apple',chinese:'蘋果'}]};
  const incoming={...empty(),words:[{id:'2',english:' APPLE ',chinese:'另一個定義'},{id:'3',english:'book',chinese:'書'}]};
  const first=mergeCollections(local,incoming),second=mergeCollections(first.collections,incoming);
  assert.equal(first.report.words.conflicts,1);assert.equal(first.report.words.added,1);assert.equal(second.report.words.duplicates,1);assert.equal(second.report.words.added,0);
  assert.equal(first.collections.words[0].chinese,'蘋果');assert.deepEqual(local.words,[{id:'1',english:'apple',chinese:'蘋果'}]);
});
test('legacy sessions without IDs or timestamps do not collapse into one record',()=>{
  const result=mergeCollections({...empty(),essayHistory:[{date:'2026/10/09',sessions:[{essay:'First'}]}]},{...empty(),essayHistory:[{date:'2026/10/09',sessions:[{essay:'Second'},{essay:'First'}]}]});
  assert.equal(result.collections.essayHistory[0].sessions.length,2);assert.equal(result.report.essayHistory.added,1);assert.equal(result.report.essayHistory.duplicates,1);
});
test('word ID collisions and duplicate-word boosts retain correct references',()=>{
  const local={...empty(),words:[{id:'1',english:'apple'}]},incoming={...empty(),words:[{id:'2',english:'apple'},{id:'1',english:'book'}],boosted:['2','1']};
  const result=mergeCollections(local,incoming);assert.equal(new Set(result.collections.words.map(word=>word.id)).size,2);
  assert.deepEqual(result.collections.boosted,['1',result.collections.words[1].id]);assert.equal(incoming.words[1].id,'1');
});
test('overlapping daily aggregates are never summed twice',()=>{
  const result=mergeCollections({...empty(),history:[{date:'2026/10/09',total:10,correct:9}]},{...empty(),history:[{date:'2026/10/09',total:15,correct:12}]});
  assert.equal(result.collections.history.length,1);assert.equal(result.collections.history[0].total,15);
});
test('V7 restores preserve existing study days for legacy migration',()=>{
  const days=[{date:'2026-10-09',activities:['word_quiz'],eventIds:['a']}];
  assert.deepEqual(mergeCollections({...empty(),studyDays:days},empty(),'overwrite',7).collections.studyDays,days);
});
test('worker preparation retains Schema V8 checksums and CSV imports commit one batch',async()=>{
  const original=raw({words:[{id:'1',english:'apple',chinese:'蘋果'}]});
  const prepared=await processBackupJob('prepareRaw',{raw:original,metadata:{appVersion:'V7.4.3'}});
  assert.equal(BackupSchema.validate(prepared.payload).valid,true);assert.deepEqual(JSON.parse(prepared.json),prepared.payload);
  const header='英文單字,詞性,中文,音標,答錯次數,建立日期,頻率加權';
  const valid=header+'\n"book","n.","書", "",0,2026/10/09,1';
  const files=[{name:'good.csv',buffer:new TextEncoder().encode(valid)},{name:'unknown.csv',buffer:new TextEncoder().encode('unexpected header\nfoo')}];
  const result=await processBackupJob('importFiles',{raw:original,files});
  assert.equal(result.results.length,1);assert.equal(result.unknown.length,1);assert.equal(JSON.parse(result.writes.vocabWords).length,2);assert.equal(JSON.parse(original.words).length,1);
});
test('JSON read caching returns isolated mutable arrays',()=>{
  const values=new Map([['vocabWords','[{"id":"1","english":"apple"}]']]);
  const store=createDataStore({AppStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},getGemini:()=>({AVAILABLE_MODELS:[]}),getStudyStreak:()=>({}),recordStudyActivity:()=>{},STUDY_ACTIVITY_TYPES:{},STUDY_DAYS_CSV_HEADER:'',todayStr:()=>''});
  const first=store.getWords();first[0].english='changed';assert.equal(store.getWords()[0].english,'apple');store.saveWords(first);assert.equal(store.getWords()[0].english,'changed');
});
test('CSV escaped quotes and multiline values survive import/export',()=>{
  const values=new Map(),store=createDataStore({AppStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},getGemini:()=>({AVAILABLE_MODELS:[]}),getStudyStreak:()=>({}),recordStudyActivity:()=>{},STUDY_ACTIVITY_TYPES:{},STUDY_DAYS_CSV_HEADER:'',todayStr:()=>''});
  store.saveWords([{id:'1',english:'quote',partOfSpeech:'n.',chinese:'說「hi」, "hello"\n第二行',createdAt:'2026/10/09'}]);
  const csv=store.exportCSV();store.saveWords([]);store.importCSV(csv);assert.equal(store.getWords()[0].chinese,'說「hi」, "hello"\n第二行');
});
test('duplicate AI requests share work and canceling discards late results',async()=>{
  const tasks=new TaskManager(),coordinator=new RequestCoordinator(tasks);let finish,calls=0;
  const operation=()=>{calls++;return new Promise(resolve=>finish=resolve);};
  const first=coordinator.run('same',operation),second=coordinator.run('same',operation);assert.equal(first,second);assert.equal(calls,1);assert.equal(tasks.busy,true);
  coordinator.cancel();finish('late');await assert.rejects(first,/REQUEST_CANCELLED/);assert.equal(tasks.busy,false);
});
test('AI timeout stays active while reading the JSON body',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>({json:()=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))});
  try{await assert.rejects(fetchJSON('https://example.invalid',{},10),/API_TIMEOUT/);}finally{globalThis.fetch=original;}
});
test('AI cancellation is distinguishable from timeout',async()=>{
  const controller=new AbortController();controller.abort();await assert.rejects(fetchJSON('https://example.invalid',{signal:controller.signal}),/REQUEST_CANCELLED/);
});
test('remembered Google account alone does not authenticate or request OAuth',async()=>{
  const previous=globalThis.sessionStorage;const map=new Map();globalThis.sessionStorage={getItem:key=>map.get(key)||null,removeItem:key=>map.delete(key)};
  const values=new Map([['gdriveEmail','test@example.invalid']]);let called=0;
  const drive=createDriveService({AppStorage:{getItem:key=>values.get(key)||null},DB:{getGDriveClientId:()=> 'test-client'}});
  drive._requestToken=async()=>{called++;};
  try{assert.equal(drive.tryRestoreFromStorage(),false);assert.equal(drive.isSignedIn(),false);await assert.rejects(drive.ensureToken({interactive:false}),/TOKEN_EXPIRED/);assert.equal(called,0);}finally{globalThis.sessionStorage=previous;}
});
test('valid Google session restores even while profile email is not available',()=>{
  const previous=globalThis.sessionStorage,session=new Map(),values=new Map();globalThis.sessionStorage={getItem:key=>session.get(key)||null};
  const drive=createDriveService({AppStorage:{getItem:key=>values.get(key)||null},DB:{getGDriveClientId:()=> 'test-client'}});
  values.set(drive.SESSION_KEYS.clientId,'test-client');values.set(drive.SESSION_KEYS.scope,drive.SCOPE);
  session.set(drive.SESSION_KEYS.token,'mock-access-token');session.set(drive.SESSION_KEYS.expiry,String(Date.now()+3600000));
  try{assert.equal(drive.tryRestoreFromStorage(),true);assert.equal(drive.isSignedIn(),true);assert.equal(drive.getUserEmail(),'');}finally{globalThis.sessionStorage=previous;}
});
