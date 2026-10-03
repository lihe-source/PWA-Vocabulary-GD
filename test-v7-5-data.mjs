import test from 'node:test';
import assert from 'node:assert/strict';
import {ParsedCache} from './parsed-cache.js';
import {createDataRepository} from './data-repository.js';
import {mergeCollections,exportCsvFiles,importCsvFiles,parseCsvRecords} from './data-operations.js';
import {BackupSchema} from './backup-schema.js';
import {RequestScope} from './request-scope.js';
import {TaskManager} from './task-manager.js';
import {request} from './network.js';
import {createGeminiService} from './gemini-service.js';
import {ModelCatalogManager} from './model-catalog.js';
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
const empty=()=>({words:[],history:[],sentences:[],imported:[],boosted:[],readingQuizHistory:[],essayHistory:[],aiAskHistory:[],studyDays:[]});

test('parsed cache avoids repeated parsing, isolates editable copies, and detects external or rolled-back values',()=>{
 const storage=memory(),cache=new ParsedCache(storage);storage.setItem('words','[{"id":"a"}]');
 const first=cache.read('words');assert.equal(cache.read('words'),first);
 cache.copy('words')[0].id='mutated';assert.equal(cache.read('words')[0].id,'a');
 storage.setItem('words','[{"id":"b"}]');assert.notEqual(cache.read('words'),first);assert.equal(cache.read('words')[0].id,'b');
 storage.setItem('words','[{"id":"a"}]');assert.equal(cache.read('words')[0].id,'a');
});

test('merging keeps different sentences on the same date, maps boosted IDs, and is idempotent',()=>{
 const one={date:'2026/10/03',wordEn:'apple',en:'Eat an apple.',zh:'吃蘋果。'},two={...one,en:'An apple fell.',zh:'蘋果掉了。'};
 const local={...empty(),words:[{id:'local-id',english:'apple',chinese:'蘋果'}],sentences:[one],imported:[one]};
 const incoming={...empty(),words:[{id:'cloud-id',english:'apple',chinese:'蘋果'}],sentences:[one,two],imported:[one,two],boosted:['cloud-id']};
 const merged=mergeCollections(local,incoming);assert.equal(merged.words.length,1);assert.equal(merged.sentences.length,2);assert.equal(merged.imported.length,2);
 assert.deepEqual(merged.boosted,['local-id']);assert.deepEqual(mergeCollections(merged,incoming),merged);
 const overwritten=mergeCollections(local,incoming,'overwrite');assert.equal(overwritten.words[0].id,'cloud-id');
});

test('V7 overwrite preserves local study days absent from older backups',()=>{
 const local={...empty(),studyDays:[{date:'2026-10-03',eventIds:['a'],activities:['word_quiz']}]};
 assert.deepEqual(mergeCollections(local,empty(),'overwrite',7).studyDays,local.studyDays);
});

test('CSV round trip preserves embedded quotes, commas and multiline fields',()=>{
 const storage=memory(),db=createDataRepository(storage);
 const rows=[{id:'a',english:'test',chinese:'第一行，"引號"\n第二行',partOfSpeech:'n.',createdAt:'2026/10/03',frequencyWeight:2}];
 storage.setItem('vocabWords',JSON.stringify(rows));const text=db.exportCSV(),other=createDataRepository(memory());
 assert.equal(other.importCSV(text).added,1);assert.equal(other.readWords()[0].chinese,rows[0].chinese);assert.equal(other.readWords()[0].frequencyWeight,2);
 assert.throws(()=>parseCsvRecords('name,meaning\n"unclosed'),/CSV_UNCLOSED_QUOTE/);
});

test('a broken recognized CSV prevents partial changes from every file in the same import',()=>{
 const header='英文單字,詞性,中文,音標,答錯次數,建立日期,頻率加權\n';
 const result=importCsvFiles(empty(),[{name:'valid.csv',text:header+'apple,n.,蘋果,,0,2026/10/03,1'},
  {name:'broken.csv',text:header+'"unclosed,n.,壞掉,,0,2026/10/03,1'}]);
 assert.equal(result.errors.length,1);assert.deepEqual(result.writes,{});assert.deepEqual(result.results,[]);
});

test('CSV export and import retain two distinct same-day examples',()=>{
 const sentences=[{date:'2026/10/03',wordEn:'test',en:'One test.',zh:'一個測試。'},
  {date:'2026/10/03',wordEn:'test',en:'Two tests.',zh:'兩個測試。'}];
 const files=exportCsvFiles({...empty(),sentences},'2026-10-03','20261003');assert.equal(files.length,1);
 const result=importCsvFiles(empty(),files);assert.equal(JSON.parse(result.writes.importedSentences).length,2);
});

test('sentence counts have no UI cap and summaries invalidate only when their source changes',()=>{
 const storage=memory(),db=createDataRepository(storage);
 storage.setItem('importedSentences',JSON.stringify(Array.from({length:201},(_,i)=>({date:'2026/10/03',wordEn:'test',en:'Example '+i,zh:'例句'+i}))));
 assert.equal(db.getCombinedSentenceLog().length,150);assert.equal(db.getCombinedSentenceLog(Infinity).length,201);
 storage.setItem('practiceHistory','[{"date":"2026/10/03","total":10,"correct":7}]');
 const summary=db.getHistorySummary();assert.equal(summary.overallPct,70);assert.equal(summary,db.getHistorySummary());
 storage.setItem('practiceHistory','[{"date":"2026/10/03","total":20,"correct":10}]');assert.equal(db.getHistorySummary().overallPct,50);
});

test('background comparisons do not block a foreground backup, but a commit owns the lock',()=>{
 const tasks=new TaskManager(),endBackground=tasks.start('cloud-compare',{background:true});
 const endForeground=tasks.start('backup',{exclusive:true});assert.throws(()=>tasks.start('auto-commit',{exclusive:true}),/TASK_ALREADY_RUNNING/);
 endForeground();const endCommit=tasks.start('auto-commit',{exclusive:true});endCommit();endBackground();assert.equal(tasks.busy,false);
});

test('leaving a route cancels its requests and superseding a request keeps only the new job',()=>{
 const scope=new RequestScope(),one=scope.begin('ai'),two=scope.begin('ai');assert.equal(one.signal.aborted,true);one.finish();assert.equal(scope.busy,true);
 scope.cancel();assert.equal(two.signal.aborted,true);two.finish();assert.equal(scope.busy,false);
});

test('network deadlines include a stalled response body',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=async(_url,{signal})=>new Response(new ReadableStream({start(controller){
  signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});
 }}),{headers:{'Content-Type':'application/json'}});
 try{await assert.rejects(request('https://test.example/data',{}, {timeout:15,retries:0}),/REQUEST_TIMEOUT/);}
 finally{globalThis.fetch=saved;}
});

test('catalog network requests obey route cancellation supplied in request policy',async()=>{
 const saved=globalThis.fetch,controller=new AbortController();
 globalThis.fetch=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 try{const job=new ModelCatalogManager(memory()).ensure('key',{signal:controller.signal});setTimeout(()=>controller.abort(),10);await assert.rejects(job,/REQUEST_CANCELLED/);}
 finally{globalThis.fetch=saved;}
});

test('AI generation shares cancellation and uses no more than two model choices',async()=>{
 const saved=globalThis.fetch,controller=new AbortController(),db={getApiKey:()=> 'key',getModel:()=> 'gemini-test'};
 const ai=createGeminiService(db,{signal:controller.signal,deadline:Date.now()+5000},[{id:'gemini-test',tier:'stable'},{id:'gemini-fallback',tier:'stable'},{id:'gemini-third',tier:'stable'}]);
 assert.equal(ai._getModelList().length,2);
 globalThis.fetch=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 try{const job=ai.answerQuestion('test');controller.abort();await assert.rejects(job,/REQUEST_CANCELLED/);}
 finally{globalThis.fetch=saved;}
});

test('checksum remains valid after Worker serialization and restore preparation',()=>{
 const payload=BackupSchema.attach({...empty(),words:[{id:'a',english:'apple',chinese:'蘋果'}]});
 assert.equal(BackupSchema.validate(JSON.parse(JSON.stringify(payload))).valid,true);
});
