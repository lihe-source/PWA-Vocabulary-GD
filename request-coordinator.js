export class RequestCoordinator {
  constructor(tasks) {this.tasks=tasks;this.controller=new AbortController();this.pending=new Map();}
  notify() {if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('ai-request-state',{detail:{busy:this.pending.size>0}}));}
  cancel() {this.controller.abort();this.controller=new AbortController();this.pending.clear();this.notify();}
  run(key, operation) {
    if (this.pending.has(key)) return this.pending.get(key);
    const signal=this.controller.signal;
    const promise=this.tasks.run('ai-request',async()=>{
      if(signal.aborted)throw new Error('REQUEST_CANCELLED');
      const result=await operation(signal);
      if(signal.aborted)throw new Error('REQUEST_CANCELLED');
      return result;
    });
    this.pending.set(key,promise);this.notify();
    promise.finally(()=>{if(this.pending.get(key)===promise)this.pending.delete(key);this.notify();}).catch(()=>{});
    return promise;
  }
}

// Timeout covers headers AND body. Cancellation is propagated to every fallback.
export async function fetchJSON(url, options = {}, timeout = 30000) {
  const controller=new AbortController(), abort=()=>controller.abort();
  if(options.signal?.aborted)throw new Error('REQUEST_CANCELLED');
  options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeout);
  try {
    const response=await fetch(url,{...options,signal:controller.signal});
    const data=await response.json();
    return {response,data};
  } catch(error) {
    if(options.signal?.aborted)throw new Error('REQUEST_CANCELLED');
    if(error.name==='AbortError')throw new Error('API_TIMEOUT');
    throw error;
  } finally {clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
