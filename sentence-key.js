export function sentenceKey(row={}){
  return JSON.stringify([String(row.date||'').replace(/\//g,'-'),
    String(row.wordEn||row.word||'').trim().toLowerCase(),
    String(row.en||row.english||'').trim(),String(row.zh||row.chinese||'').trim()]);
}
