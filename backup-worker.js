import {BackupSchema} from './backup-schema.js?v=V7_5_0';
import {decodeCollections,mergeCollections,serializedWrites,exportCsvFiles,importCsvFiles,parseCsvRecords} from './data-operations.js?v=V7_5_0';
self.onmessage=({data})=>{
  const {id,action,payload}=data||{};
  try{
    let result;
    if(action==='prepare'){
      const attached=BackupSchema.attach(decodeCollections(payload.collections),payload.metadata);
      const jsonBytes=new TextEncoder().encode(JSON.stringify(attached));
      const {words,history,sentences,imported,boosted,readingQuizHistory,essayHistory,aiAskHistory,studyDays,...metadata}=attached;
      self.postMessage({id,ok:true,result:{payload:metadata,json:jsonBytes}},[jsonBytes.buffer]);return;
    }
    if(action==='snapshot')result=BackupSchema.attach(decodeCollections(payload.collections),payload.metadata);
    else if(action==='parse'){
      result=JSON.parse(payload.text);const v=BackupSchema.validate(result);
      if(!v.valid)throw new Error('BACKUP_INVALID_'+v.reason);
    }else if(action==='validate'){
      result=BackupSchema.validate(payload);if(!result.valid)throw new Error('BACKUP_INVALID_'+result.reason);
    }else if(action==='compare'){
      result=BackupSchema.compare({...decodeCollections(payload.local),schemaVersion:8},payload.cloud);
    }else if(action==='restore'){
      const validation=BackupSchema.validate(payload.incoming);
      if(!validation.valid)throw new Error('BACKUP_INVALID_'+validation.reason);
      result=serializedWrites(mergeCollections(payload.local,validation.collections,payload.mode,validation.sourceSchemaVersion),validation.sourceSchemaVersion>=8);
    }else if(action==='export-csv')result=exportCsvFiles(payload.collections,payload.dateTag,payload.compactDateTag);
    else if(action==='import-csv')result=importCsvFiles(payload.collections,payload.files);
    else if(action==='parse-csv')result=parseCsvRecords(payload.text);
    else throw new Error('WORKER_ACTION_INVALID');
    self.postMessage({id,ok:true,result});
  }catch(error){self.postMessage({id,ok:false,error:error?.message||'WORKER_ERROR'});}
};
