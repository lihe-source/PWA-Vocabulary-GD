import { BackupSchema } from './backup-schema.js?v=V7_4_3';
import { COLLECTION_STORAGE,parseRawCollections,mergeCollections } from './data-merge.js?v=V7_4_3';
import { createDataStore } from './data-store.js?v=V7_4_3';
import { StudyStreakManager,STUDY_ACTIVITY_TYPES,STUDY_DAYS_CSV_HEADER } from './study-streak.js?v=V7_4_3';

function memoryStore(raw) {
  const values=new Map(Object.entries(raw || {}).map(([name,text])=>[COLLECTION_STORAGE[name]||name,text]));
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const streak=new StudyStreakManager({storage});
  const store=createDataStore({AppStorage:storage,getGemini:()=>({AVAILABLE_MODELS:[]}),getStudyStreak:()=>streak,recordStudyActivity:()=>{},STUDY_ACTIVITY_TYPES,STUDY_DAYS_CSV_HEADER,todayStr:()=>{const date=new Date();return `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')}`;}});
  return {values,store,streak};
}
async function zipLibrary() {if(!self.JSZip)await import('./jszip.min.js?v=3_10_1');return self.JSZip;}

export async function processBackupJob(action,payload) {
  if(action==='migrateDays') {
    const {values,store,streak}=memoryStore(payload.raw);
    streak.migrateFromHistories({history:store.getHistory(),readingQuizHistory:store.getReadingQuizHistory(),essayHistory:store.getEssayHistory(),aiAskHistory:store.getAiAskHistory()});
    return {studyActivityDays:values.get('studyActivityDays')||'[]'};
  }
  if (action==='prepare' || action==='prepareRaw') {
    const attached=BackupSchema.attach(action==='prepareRaw'?parseRawCollections(payload.raw):payload.collections,payload.metadata);
    return {payload:attached,json:JSON.stringify(attached)};
  }
  if(action==='parse') {const parsed=JSON.parse(payload.text);const validation=BackupSchema.validate(parsed);if(!validation.valid)throw new Error('BACKUP_INVALID_'+validation.reason);return parsed;}
  if(action==='validate') {const validation=BackupSchema.validate(payload);if(!validation.valid)throw new Error('BACKUP_INVALID_'+validation.reason);return validation;}
  if(action==='compare')return BackupSchema.compare(payload.local,payload.cloud);
  if(action==='merge') {
    const result=mergeCollections(parseRawCollections(payload.raw),payload.incoming,payload.mode,payload.sourceSchemaVersion);
    return payload.preview?{report:result.report,totals:result.totals}:{writes:result.writes,report:result.report,totals:result.totals};
  }
  if(action==='exportZIP') {
    const {store,streak}=memoryStore(payload.raw),zip=new (await zipLibrary())(),files=[];
    const exports=[['vocab','getWords','exportCSV'],['sentences','getCombinedSentenceLog','exportSentencesCSV'],['stats','getHistory','exportStatsCSV'],['reading','getReadingQuizHistory','exportReadingQuizCSV'],['essay','getEssayHistory','exportEssayCSV'],['aiask','getAiAskHistory','exportAiAskCSV']];
    for(const [name,getter,exporter]of exports)if(store[getter]().length){const filename=`${name}_${payload.dateTag}.csv`;zip.file(filename,'\uFEFF'+store[exporter]());files.push(filename);}
    if(streak.getDays().length){const name=`study_days_${payload.compactDateTag}.csv`;zip.file(name,'\uFEFF'+streak.exportCSV());files.push(name);}
    if(!files.length)throw new Error('EXPORT_EMPTY');
    const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});return {bytes,files};
  }
  if(action==='importFiles') {
    const {values,store,streak}=memoryStore(payload.raw),results=[],errors=[],unknown=[];
    const methods={vocab:'importCSV',sentences:'importSentencesCSV',stats:'importStatsCSV',reading:'importReadingQuizCSV',essay:'importEssayCSV',aiask:'importAiAskCSV',studyDays:'importStudyDaysCSV'};
    const process=(name,text)=>{
      const type=store.detectCSVType(text);if(!type){unknown.push(name);return;}
      const before=new Map(values);
      try{const result=store[methods[type]](text);results.push(`${name}：新增 ${result.added||0} 筆${result.updated?`、更新 ${result.updated} 筆`:''}${result.skipped?`、略過 ${result.skipped} 筆`:''}`);}
      catch(error){values.clear();for(const entry of before)values.set(...entry);errors.push(`${name}（${error.message}）`);}
    };
    for(const file of payload.files) {
      try {
        if(file.name.toLowerCase().endsWith('.zip')) {
          const zip=await (await zipLibrary()).loadAsync(file.buffer,{checkCRC32:true});
          const entries=Object.values(zip.files).filter(entry=>!entry.dir&&entry.name.toLowerCase().endsWith('.csv'));
          if(!entries.length)unknown.push(file.name+'（ZIP 內無 CSV）');
          for(const entry of entries)process(entry.name,await entry.async('text'));
        }else process(file.name,new TextDecoder().decode(file.buffer));
      }catch(error){errors.push(`${file.name}（${error.message}）`);}
    }
    if(results.length)streak.migrateFromHistories({history:store.getHistory(),readingQuizHistory:store.getReadingQuizHistory(),essayHistory:store.getEssayHistory(),aiAskHistory:store.getAiAskHistory()});
    const writes=Object.fromEntries(Object.values(COLLECTION_STORAGE).filter(key=>values.has(key)).map(key=>[key,values.get(key)]));
    return {writes,results,errors,unknown};
  }
  throw new Error('WORKER_ACTION_INVALID');
}

if(typeof self!=='undefined')self.onmessage=async({data})=>{
  const {id,action,payload}=data || {};
  try{const result=await processBackupJob(action,payload);self.postMessage({id,ok:true,result},result?.bytes?[result.bytes.buffer]:[]);}
  catch(error){self.postMessage({id,ok:false,error:error?.message||'WORKER_ERROR'});}
};
