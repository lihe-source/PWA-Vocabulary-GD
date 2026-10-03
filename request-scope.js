export class RequestScope {
  constructor(){this.controller=new AbortController();this.signal=this.controller.signal;this.jobs=new Map();}
  get busy(){return this.jobs.size>0;}
  cancel(){this.controller.abort();for(const job of this.jobs.values())job.abort();this.jobs.clear();}
  begin(key='request',timeout=60000){
    if(this.signal.aborted)throw new Error('REQUEST_CANCELLED');
    this.jobs.get(key)?.abort();
    const controller=new AbortController();
    const abort=()=>controller.abort();
    this.signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,timeout);
    this.jobs.set(key,controller);
    return {signal:controller.signal,finish:()=>{
      clearTimeout(timer);this.signal.removeEventListener('abort',abort);
      if(this.jobs.get(key)===controller)this.jobs.delete(key);
    }};
  }
  isCurrent(element){return !this.signal.aborted && element?.isConnected!==false;}
}
