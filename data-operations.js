import {sentenceKey} from './sentence-key.js?v=V7_5_0';
export {sentenceKey} from './sentence-key.js?v=V7_5_0';
import {BackupSchema} from './backup-schema.js?v=V7_5_0';
import {mergeStudyDays,StudyStreakManager} from './study-streak.js?v=V7_5_0';
import {createDataRepository} from './data-repository.js?v=V7_5_0';
export const COLLECTION_STORAGE_KEYS=Object.freeze({
  words:'vocabWords',history:'practiceHistory',sentences:'sentenceLog',imported:'importedSentences',
  boosted:'boostedWords',readingQuizHistory:'readingQuizHistory',essayHistory:'essayHistory',
  aiAskHistory:'aiAskHistory',studyDays:'studyActivityDays'
});
export function decodeCollections(raw={}){
  const result={};
  for(const name of Object.keys(COLLECTION_STORAGE_KEYS)){
    const value=raw[name];let rows;
    try{rows=typeof value==='string'?JSON.parse(value):value;}catch{throw new Error('LOCAL_DATA_INVALID');}
    result[name]=Array.isArray(rows)?rows:[];
  }
  return result;
}
function union(local,incoming,key){
  const result=[...local],seen=new Set(local.map(key));
  for(const item of incoming){const id=key(item);if(!seen.has(id)){seen.add(id);result.push(item);}}
  return result;
}
function mergeGroups(local,incoming){
  const byDate=new Map();
  for(const group of [...local,...incoming]){
    const key=String(group.date||''),existing=byDate.get(key);
    if(!existing)byDate.set(key,{...group,sessions:[...(group.sessions||[])]});
    else existing.sessions=union(existing.sessions,group.sessions||[],
      session=>String(session.id||session.ts||JSON.stringify(session)));
  }
  return [...byDate.values()];
}
export function mergeCollections(localRaw,incomingRaw,mode='merge',sourceVersion=8){
  const local=decodeCollections(localRaw),incoming=BackupSchema.normalize(incomingRaw);
  if(!['merge','overwrite'].includes(mode))throw new Error('INVALID_RESTORE_MODE');
  if(mode==='overwrite')return {...incoming,studyDays:sourceVersion>=8?mergeStudyDays(incoming.studyDays):local.studyDays};
  const result={...local};
  result.words=union(local.words,incoming.words,word=>String(word.english||word.wordEn||'').trim().toLowerCase());
  const byDate=new Map();
  for(const entry of [...local.history,...incoming.history]){
    const old=byDate.get(entry.date);
    if(!old||Number(entry.total)>Number(old.total))byDate.set(entry.date,{...entry});
  }
  result.history=[...byDate.values()];
  result.sentences=union(local.sentences,incoming.sentences,sentenceKey);
  result.imported=union(local.imported,incoming.imported,sentenceKey);
  const idsByWord=new Map(result.words.map(word=>[String(word.english||'').toLowerCase(),word.id]));
  const incomingIdMap=new Map(incoming.words.map(word=>[word.id,idsByWord.get(String(word.english||'').toLowerCase())||word.id]));
  result.boosted=[...new Set([...local.boosted,...incoming.boosted.map(id=>incomingIdMap.get(id)||id)])];
  result.readingQuizHistory=mergeGroups(local.readingQuizHistory,incoming.readingQuizHistory);
  result.essayHistory=mergeGroups(local.essayHistory,incoming.essayHistory);
  result.aiAskHistory=union(local.aiAskHistory,incoming.aiAskHistory,row=>String(row.id||row.ts||JSON.stringify([row.question,row.answer])));
  result.studyDays=sourceVersion>=8?mergeStudyDays(local.studyDays,incoming.studyDays):local.studyDays;
  return result;
}
export function serializedWrites(collections,includeDays=true){
  return Object.fromEntries(Object.entries(COLLECTION_STORAGE_KEYS).filter(([name])=>includeDays||name!=='studyDays')
    .map(([name,key])=>[key,JSON.stringify(collections[name]||[])]));
}
function memoryRepository(raw){
  const values=new Map(),dirty=new Set();
  for(const [name,key] of Object.entries(COLLECTION_STORAGE_KEYS)){
    const value=raw[name];values.set(key,typeof value==='string'?value:JSON.stringify(value||[]));
  }
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>{values.set(key,String(value));dirty.add(key);},
    removeItem:key=>{values.delete(key);dirty.add(key);}};
  const streak=new StudyStreakManager({storage});
  const db=createDataRepository(storage,{studyStreak:()=>streak});
  return {values,dirty,storage,streak,db};
}
export function exportCsvFiles(raw,dateTag,compactDateTag){
  const {db}=memoryRepository(raw),c=decodeCollections(raw),files=[];
  const definitions=[[c.words.length,'vocab','exportCSV'],[c.sentences.length+c.imported.length,'sentences','exportSentencesCSV'],
    [c.history.length,'stats','exportStatsCSV'],[c.readingQuizHistory.length,'reading','exportReadingQuizCSV'],
    [c.essayHistory.length,'essay','exportEssayCSV'],[c.aiAskHistory.length,'aiask','exportAiAskCSV'],
    [c.studyDays.length,'study_days','exportStudyDaysCSV']];
  for(const [count,prefix,method] of definitions){
    if(count)files.push({name:prefix+'_'+(prefix==='study_days'?compactDateTag:dateTag)+'.csv',text:'\uFEFF'+db[method]()});
  }
  return files;
}
export function importCsvFiles(raw,files){
  const {db,streak,values,dirty}=memoryRepository(raw);
  const methods={vocab:'importCSV',sentences:'importSentencesCSV',stats:'importStatsCSV',
    reading:'importReadingQuizCSV',essay:'importEssayCSV',aiask:'importAiAskCSV',studyDays:'importStudyDaysCSV'};
  const results=[],errors=[],unknown=[];
  for(const file of files){
    const clean=String(file.text||'').replace(/^\uFEFF/,'');
    const type=db.detectCSVType(clean);
    if(!type){unknown.push(file.name);continue;}
    try{results.push({name:file.name,type,...db[methods[type]](clean)});}
    catch(error){errors.push({name:file.name,error:error.message});}
  }
  if(errors.length)return {writes:{},results:[],errors,unknown};
  if(results.length)streak.migrateFromHistories({history:db.readHistory(),readingQuizHistory:db.readReadingQuizHistory(),
    essayHistory:db.readEssayHistory(),aiAskHistory:db.readAiAskHistory()},{markPending:false});
  const allowed=new Set(Object.values(COLLECTION_STORAGE_KEYS));
  return {writes:Object.fromEntries([...dirty].filter(key=>allowed.has(key)).map(key=>[key,values.get(key)])),results,errors,unknown};
}
export function parseCsvRecords(text){
  const rows=[];let fields=[],current='',quoted=false;const source=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(ch==='"'){if(quoted&&source[i+1]==='"'){current+='"';i++;}else quoted=!quoted;}
    else if(ch===','&&!quoted){fields.push(current);current='';}
    else if((ch==='\r'||ch==='\n')&&!quoted){
      fields.push(current);if(fields.some(Boolean))rows.push(fields);fields=[];current='';
      if(ch==='\r'&&source[i+1]==='\n')i++;
    }else current+=ch;
  }
  if(quoted)throw new Error('CSV_UNCLOSED_QUOTE');
  if(current||fields.length){fields.push(current);rows.push(fields);}
  return rows;
}
