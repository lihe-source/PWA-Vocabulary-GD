let worker;
let nextId=1;
const pending=new Map();

function getWorker() {
  if (worker) return worker;
  if (typeof Worker === 'undefined') throw new Error('WORKER_UNAVAILABLE');
  worker=new Worker('./backup-worker.js?v=V7_3_0',{type:'module'});
  worker.onmessage=({data})=>{
    const job=pending.get(data?.id);if(!job)return;
    pending.delete(data.id);clearTimeout(job.timer);
    data.ok ? job.resolve(data.result) : job.reject(new Error(data.error || 'WORKER_ERROR'));
  };
  worker.onerror=()=>{
    for(const job of pending.values()){clearTimeout(job.timer);job.reject(new Error('WORKER_UNAVAILABLE'));}
    pending.clear();worker?.terminate();worker=null;
  };
  return worker;
}

function run(action,payload,timeout=45000) {
  return new Promise((resolve,reject)=>{
    const id=nextId++;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('WORKER_TIMEOUT'));},timeout);
    pending.set(id,{resolve,reject,timer});
    try{getWorker().postMessage({id,action,payload});}
    catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
}

export const BackupWorker={
  prepare(collections,metadata){return run('prepare',{collections,metadata});},
  parse(text){return run('parse',{text});},
  validate(payload){return run('validate',payload)}
};
