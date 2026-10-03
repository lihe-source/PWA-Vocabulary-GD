// Cache read-only decoded values. Mutating callers still receive fresh copies.
export class ParsedCache {
  constructor(storage) { this.storage=storage;this.entries=new Map();this.derived=new Map(); }
  read(key, fallback=[]) {
    const raw=this.storage.getItem(key);
    const old=this.entries.get(key);
    if(old && old.raw===raw)return old.value;
    let value;try{value=raw ? JSON.parse(raw) : fallback;}catch{value=fallback;}
    this.entries.set(key,{raw,value});return value;
  }
  copy(key,fallback=[]) { return structuredClone(this.read(key,fallback)); }
  compute(name,keys,fn) {
    const raw=keys.map(key=>this.storage.getItem(key));
    const old=this.derived.get(name);
    if(old && old.raw.every((item,i)=>item===raw[i]))return old.value;
    const value=fn();this.derived.set(name,{raw,value});return value;
  }
  clear() { this.entries.clear();this.derived.clear(); }
}
