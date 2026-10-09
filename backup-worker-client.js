let worker;
let nextId=1;
const pending=new Map();

function resetWorker(error) {
  worker?.terminate();worker=null;
  for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}
  pending.clear();
}

function getWorker() {
  if (worker) return worker;
  if (typeof Worker === 'undefined') throw new Error('WORKER_UNAVAILABLE');
  worker=new Worker('./backup-worker.js?v=V7_4_3',{type:'module'});
  worker.onmessage=({data})=>{
    const job=pending.get(data?.id);if(!job)return;
    pending.delete(data.id);clearTimeout(job.timer);
    data.ok ? job.resolve(data.result) : job.reject(new Error(data.error || 'WORKER_ERROR'));
  };
  worker.onerror=()=>{
    resetWorker(new Error('WORKER_UNAVAILABLE'));
  };
  return worker;
}

function run(action,payload,timeout=45000) {
  return new Promise((resolve,reject)=>{
    const id=nextId++;
    const timer=setTimeout(()=>resetWorker(new Error('WORKER_TIMEOUT')),timeout);
    pending.set(id,{resolve,reject,timer});
    try{getWorker().postMessage({id,action,payload});}
    catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
}

export const BackupWorker={
  migrateDays(raw){return run('migrateDays',{raw});},
  prepareRaw(raw,metadata){return run('prepareRaw',{raw,metadata});},
  compare(local,cloud){return run('compare',{local,cloud});},
  merge(raw,incoming,mode,sourceSchemaVersion,preview=false){return run('merge',{raw,incoming,mode,sourceSchemaVersion,preview});},
  exportZIP(raw,dateTag,compactDateTag){return run('exportZIP',{raw,dateTag,compactDateTag},90000);},
  importFiles(raw,files){return run('importFiles',{raw,files},90000);},
  prepare(collections,metadata){return run('prepare',{collections,metadata});},
  parse(text){return run('parse',{text});},
  validate(payload){return run('validate',payload)}
};
