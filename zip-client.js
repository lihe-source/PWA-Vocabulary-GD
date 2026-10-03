let worker,nextId=1;const pending=new Map();
function fail(error){worker?.terminate();worker=null;for(const job of pending.values()){clearTimeout(job.timer);job.reject(error);}pending.clear();}
function getWorker(){
  if(worker)return worker;
  worker=new Worker('./zip-worker.js?v=V7_5_0',{type:'module'});
  worker.onmessage=({data})=>{
    const job=pending.get(data.id);if(!job)return;
    if(data.progress){job.onProgress?.(data.progress);return;}
    clearTimeout(job.timer);pending.delete(data.id);
    data.ok?job.resolve(data.result):job.reject(new Error(data.error));
  };
  worker.onerror=()=>fail(new Error('WORKER_UNAVAILABLE'));return worker;
}
function run(action,payload,onProgress,transfer=[]){
  return new Promise((resolve,reject)=>{
    const id=nextId++,timer=setTimeout(()=>fail(new Error('WORKER_TIMEOUT')),120000);
    pending.set(id,{resolve,reject,timer,onProgress});
    try{getWorker().postMessage({id,action,payload},transfer);}
    catch(error){pending.delete(id);clearTimeout(timer);reject(error);}
  });
}
export const ZipClient={
  pack(collections,dateTag,compactDateTag,onProgress){return run('pack',{collections,dateTag,compactDateTag},onProgress);},
  import(collections,files,onProgress){return run('import',{collections,files},onProgress,files.map(file=>file.bytes));}
};
