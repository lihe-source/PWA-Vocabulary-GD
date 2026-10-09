import { mergeStudyDays } from './study-streak.js?v=V7_4_3';

export const COLLECTION_STORAGE = Object.freeze({words:'vocabWords',history:'practiceHistory',sentences:'sentenceLog',imported:'importedSentences',boosted:'boostedWords',readingQuizHistory:'readingQuizHistory',essayHistory:'essayHistory',aiAskHistory:'aiAskHistory',studyDays:'studyActivityDays'});
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
const wordKey = item => String(item.english || item.wordEn || item.word || '').trim().toLowerCase();
export const sentenceIdentity = item => stable([item.date || '',wordKey(item),item.en || item.english || item.sentence || '',item.zh || item.chinese || '']);
const sessionKey = item => item.id != null && item.id !== '' ? 'id:'+item.id : item.ts ? 'ts:'+item.ts : 'content:'+stable(item);

// Every collection has a real identity. Missing legacy fields never collapse
// all records into the same undefined key. Conflicting content retains local data.
export function mergeCollections(local = {}, incoming = {}, mode = 'merge', sourceSchemaVersion = 8) {
  if (!['merge','overwrite'].includes(mode)) throw new Error('RESTORE_MODE_INVALID');
  if(mode==='merge') {
    incoming=structuredClone(incoming);
    const localWords=new Map((local.words||[]).map(item=>[wordKey(item),item]));
    const ids=new Set((local.words||[]).map(item=>String(item.id))),remap=new Map();
    for(const item of incoming.words||[]) {
      const original=item.id,existing=localWords.get(wordKey(item));
      if(existing) {if(original!=null)remap.set(String(original),existing.id);continue;}
      if(original==null || ids.has(String(original))) {
        let next='merge:'+wordKey(item)+':'+String(original||'');while(ids.has(next))next+=':';
        item.id=next;
      }
      ids.add(String(item.id));if(original!=null)remap.set(String(original),item.id);
    }
    incoming.boosted=(incoming.boosted||[]).map(id=>remap.get(String(id))??id);
    for(const name of ['essayHistory','readingQuizHistory'])for(const group of incoming[name]||[])for(const session of group.sessions||[])for(const word of session.words||[]) {
      if(word&&typeof word==='object'&&remap.has(String(word.id)))word.id=remap.get(String(word.id));
    }
  }
  const collections = {}, report = {};
  const unique = (name, a, b, key) => {
    const counts = report[name] = {added:0,duplicates:0,conflicts:0};
    const output = [...a], seen = new Map(a.map(item => [key(item),item]));
    for (const item of b) {
      const identity = key(item);
      if (!seen.has(identity)) {output.push(item);seen.set(identity,item);counts.added++;}
      else if (stable(seen.get(identity)) === stable(item)) counts.duplicates++;
      else counts.conflicts++;
    }
    return output;
  };
  for (const name of Object.keys(COLLECTION_STORAGE)) {
    const a = Array.isArray(local[name]) ? local[name] : [], b = Array.isArray(incoming[name]) ? incoming[name] : [];
    if (mode === 'overwrite') {collections[name] = b;report[name] = {added:b.length,duplicates:0,conflicts:0};continue;}
    if (name === 'studyDays') {
      collections[name] = mergeStudyDays(a,b);
      const dates=new Set(a.map(day=>day.date));
      report[name] = {added:collections[name].length-a.length,duplicates:b.filter(day=>dates.has(day.date)).length,conflicts:0};
    } else if (name === 'history') {
      const rows = unique(name,a,b,item=>item.date || 'content:'+stable(item));
      // A daily total is an aggregate, not a new session: never sum overlapping backups.
      const incomingByDate = new Map(b.map(item=>[item.date,item]));
      collections[name] = rows.map(item => {
        const other = incomingByDate.get(item.date);
        if(!other)return item;
        const chosen=Number(other.total)>Number(item.total)?other:item;
        if(!Array.isArray(item.wrongWordDetails)&&!Array.isArray(other.wrongWordDetails))return chosen;
        const details=new Map([...(item.wrongWordDetails||[]),...(other.wrongWordDetails||[])].map(detail=>[stable(detail),detail]));
        return {...chosen,wrongWordDetails:[...details.values()]};
      });
    } else if (name === 'readingQuizHistory' || name === 'essayHistory') {
      report[name] = {added:0,duplicates:0,conflicts:0};
      const groups = new Map(a.map(group=>[group.date,{...group,sessions:[...(group.sessions || [])]}]));
      for (const group of b) {
        const existing = groups.get(group.date) || {...group,sessions:[]};
        const counts = {...report[name]};
        existing.sessions = unique(name,existing.sessions,group.sessions || [],sessionKey);
        for (const key of Object.keys(counts)) report[name][key] += counts[key];
        groups.set(group.date,existing);
      }
      collections[name] = [...groups.values()];
    } else collections[name] = unique(name,a,b,name==='words' ? item=>wordKey(item)||stable(item) : ['sentences','imported'].includes(name) ? sentenceIdentity : name==='boosted' ? item=>String(item) : sessionKey);
  }
  if (sourceSchemaVersion < 8) collections.studyDays = local.studyDays || [];
  const writes = Object.fromEntries(Object.entries(COLLECTION_STORAGE).map(([name,key])=>[key,JSON.stringify(collections[name])]));
  const totals = Object.values(report).reduce((all,item)=>({added:all.added+item.added,duplicates:all.duplicates+item.duplicates,conflicts:all.conflicts+item.conflicts}),{added:0,duplicates:0,conflicts:0});
  return {collections,writes,report,totals};
}

export function parseRawCollections(raw = {}) {
  return Object.fromEntries(Object.keys(COLLECTION_STORAGE).map(name=>{
    const value = JSON.parse(raw[name] || '[]');
    if (!Array.isArray(value)) throw new Error('BACKUP_INVALID_'+name);
    return [name,value];
  }));
}
